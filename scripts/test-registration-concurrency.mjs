import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

// Always use a fresh local cluster, never DATABASE_URL or a production connection.
const databaseDir = await mkdtemp(path.join(tmpdir(), "workshop-capacity-"));
const port = 15432;
const password = randomUUID();
const postgres = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password,
  persistent: true, onLog: () => {}, onError: () => {} });
let pool;
let started = false;
const adminId = "00000000-0000-4000-8000-000000000001";
const payload = (id) => ({
  full_name: "Capacity Test", email: `capacity-${id}@example.com`, phone: "01700000000",
  institution: "Test University", department: "CSE", academic_year: "3rd year",
  programming_languages: ["Python"], programming_level: "Intermediate", python_familiarity: "Basic",
  api_experience: "Yes", ai_familiarity: "Basic", agent_experience: "No", attendance: "Both Days",
  traditional_development: "Yes", ai_tools_basics: "Yes", built_software_project: "Yes",
  paid_llm_subscription: "No", paid_llm_models: [], local_model_laptop: "No",
  bringing_laptop: "Yes", development_environment: "Yes", declaration_accepted: true, privacy_accepted: true,
  payment_method: "bkash", payment_transaction_id: `CAPACITY-${id}`, bank_name: "Test Bank",
  bank_account_holder_name: "Capacity Test", bank_account_number: "1234567890"
});
const batchRows = (count) => Array.from({ length: count }, (_, index) => ({
  source_row: index + 2, full_name: "Batch Test", email: `batch-${index}@example.com`, attendance: "Both Days"
}));
const submit = async (id) => (await pool.query("select public.submit_registration($1::jsonb) as result", [JSON.stringify(payload(id))])).rows[0].result;
const count = async () => (await pool.query("select public.public_registration_count() as count")).rows[0].count;
async function seed(batch, outside, rejected = 0) {
  await pool.query("truncate public.registrations, public.batch14_registrations cascade");
  await pool.query("update public.event_settings set capacity = 40, outsider_registration_enabled = true, bkash_merchant_number = '01700000000' where id = 1");
  await pool.query("select public.admin_import_batch14($1::uuid, $2::jsonb)", [adminId, JSON.stringify(batchRows(batch))]);
  for (let index = 0; index < outside + rejected; index++) {
    const result = await submit(`seed-${index}`);
    assert.ok(result.reference, JSON.stringify(result));
    if (index < rejected) await pool.query("update public.registrations set registration_status = 'rejected' where reference = $1", [result.reference]);
  }
}

async function race(label, batch, outside, attempts, accepted, rejected = 0) {
  await seed(batch, outside, rejected);
  const gate = await pool.connect();
  const initial = await count();
  const errors = [];
  let requests;
  try {
    await gate.query("begin");
    await gate.query("select pg_advisory_xact_lock(hashtext('workshop-registration'))");
    // Hold the real production lock until every independent connection is waiting.
    requests = Array.from({ length: attempts }, (_, index) => submit(`${label}-${index}`).catch(error => { errors.push(error); return { error: "unexpected_database_failure" }; }));
    const deadline = Date.now() + 15000;
    let waiting = 0;
    while (waiting < attempts && Date.now() < deadline) {
      await gate.query("select pg_stat_clear_snapshot()");
      waiting = Number((await gate.query("select count(*) from pg_stat_activity where wait_event = 'advisory' and application_name = 'workshop-capacity-test'")).rows[0].count);
      if (waiting < attempts) await delay(20);
    }
    assert.equal(waiting, attempts, "All requests must contend for the same database lock");
  } finally {
    await gate.query("rollback");
    gate.release();
  }
  const results = await Promise.all(requests);
  assert.equal(errors.length, 0, errors[0]?.message);
  assert.equal(results.filter(result => result.reference).length, accepted);
  assert.equal(results.filter(result => result.error === "registration_full").length, attempts - accepted);
  assert.equal(await count(), initial + accepted);
  assert.ok(await count() <= Math.max(40, initial));
  assert.equal((await submit(`${label}-retry`)).error, "registration_full", "A subsequent request must also be rejected");
  console.log(`PASS ${label}: ${attempts} simultaneous requests, ${accepted} accepted, ${attempts - accepted} rejected; total ${await count()}`);
}

try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres",
    max: 65, application_name: "workshop-capacity-test" });
  await pool.query(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);`);
  const migrations = path.resolve("supabase/migrations");
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort())
    await pool.query(await readFile(path.join(migrations, file), "utf8"));
  await pool.query("insert into auth.users values ($1);", [adminId]);
  await pool.query("insert into public.admins(user_id) values ($1)", [adminId]);
  console.log("Applied every repository migration to an isolated PostgreSQL cluster. Capacity: 40.");
  await race("empty database", 0, 0, 60, 40);
  await race("last place with Batch 14", 25, 14, 50, 1);
  await race("already full", 25, 15, 50, 0);
  await race("Batch 14 fills all places", 40, 0, 50, 0);
  await race("rejected registrations free places", 25, 14, 50, 1, 5);
  await race("existing Batch 14 count exceeds limit", 41, 0, 50, 0);
  console.log("All 310 concurrent submissions passed capacity assertions.");
} finally {
  if (pool) await pool.end();
  if (started) await postgres.stop();
  // mkdtemp creates this exact disposable directory; no workspace or production files are removed.
  assert.equal(path.dirname(path.resolve(databaseDir)), path.resolve(tmpdir()));
  assert.ok(path.basename(databaseDir).startsWith("workshop-capacity-"));
  await rm(databaseDir, { recursive: true, force: true });
}
