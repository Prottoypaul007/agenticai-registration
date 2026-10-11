import { readBatch14Sheet } from "@/lib/batch14-sheet";
import { serviceClient } from "@/lib/supabase";

export async function syncBatch14Registrations(adminId?: string) {
  const client = serviceClient();
  let reviewerId = adminId;
  if (!reviewerId) {
    const { data: admins, error } = await client.from("admins").select("user_id").limit(1);
    if (error || !admins?.length) throw new Error("batch14_admin_missing");
    reviewerId = admins[0].user_id;
  }
  const rows = await readBatch14Sheet();
  const { data, error } = await client.rpc("admin_import_batch14", { p_admin_id: reviewerId, p_rows: rows });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { read: rows.length, added: Number(data.added || 0), skipped: Number(data.skipped || 0),
    conflicts: Number(data.conflicts || 0), resolved: Number(data.resolved || 0) };
}
