-- Run after 007. Sync Batch 14 before opening the remaining seats to outsiders.
alter table public.event_settings add column if not exists outsider_registration_enabled boolean not null default false;

create table public.batch14_registrations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('B14-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  source_row integer not null unique check (source_row > 1),
  full_name text not null check (length(btrim(full_name)) > 0),
  email text not null check (length(btrim(email)) > 0),
  phone text,
  institution text not null default 'University of Dhaka, IIT',
  attendance text not null default 'Both Days' check (attendance in ('Both Days', 'Day 1 Only', 'Day 2 Only')),
  payment_method text,
  payment_transaction_id text,
  payment_status text not null default 'unverified' check (payment_status in ('unverified', 'verified')),
  bank_name text,
  bank_branch text,
  bank_account_number text,
  source_data jsonb not null default '{}'::jsonb,
  qr_status text not null default 'pending_review' check (qr_status in ('pending_review', 'sending', 'sent', 'failed')),
  qr_delivery_started_at timestamptz,
  qr_reviewed_by uuid references auth.users(id),
  qr_sent_at timestamptz,
  qr_sent_by uuid references auth.users(id),
  day1_checked_in_at timestamptz,
  day1_checked_in_by uuid references auth.users(id),
  day2_checked_in_at timestamptz,
  day2_checked_in_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index batch14_email_unique on public.batch14_registrations (lower(btrim(email)));
create unique index batch14_transaction_unique on public.batch14_registrations (lower(btrim(payment_method)), upper(btrim(payment_transaction_id))) where payment_transaction_id is not null;
create index batch14_qr_status_idx on public.batch14_registrations (qr_status, created_at desc);
alter table public.batch14_registrations enable row level security;
revoke all on public.batch14_registrations from anon, authenticated;

-- The import and public form share one lock, so they cannot oversubscribe a seat.
create or replace function public.admin_import_batch14(p_admin_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; s public.event_settings%rowtype; added integer := 0; skipped integer := 0;
email_value text; row_number integer; name_value text; attendance_value text; existing_email text;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'invalid import'; end if;
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  select * into s from public.event_settings where id = 1;
  for item in select value from jsonb_array_elements(p_rows) loop
    row_number := (item->>'source_row')::integer;
    email_value := lower(btrim(item->>'email'));
    name_value := btrim(item->>'full_name');
    attendance_value := coalesce(nullif(item->>'attendance', ''), 'Both Days');
    if row_number <= 1 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or nullif(name_value, '') is null or attendance_value not in ('Both Days', 'Day 1 Only', 'Day 2 Only') then
      raise exception 'invalid Batch 14 row %', row_number;
    end if;
    select email into existing_email from public.batch14_registrations where source_row = row_number;
    if found and lower(btrim(existing_email)) <> email_value then
      raise exception 'Google Sheet row % changed identity; restore the original row order', row_number;
    end if;
    if found or exists (select 1 from public.batch14_registrations where lower(btrim(email)) = email_value)
       or exists (select 1 from public.registrations where lower(btrim(email)) = email_value) then
      skipped := skipped + 1;
      continue;
    end if;
    if s.capacity is not null and
      (select count(*) from public.registrations where registration_status <> 'rejected') +
      (select count(*) from public.batch14_registrations) >= s.capacity then
      raise exception 'registration_full';
    end if;
    if nullif(btrim(item->>'payment_transaction_id'), '') is not null and
      (exists (select 1 from public.batch14_registrations where lower(btrim(payment_method)) = lower(btrim(item->>'payment_method'))
        and upper(btrim(payment_transaction_id)) = upper(btrim(item->>'payment_transaction_id')))
      or exists (select 1 from public.registrations where payment_method = lower(btrim(item->>'payment_method'))
        and upper(btrim(payment_transaction_id)) = upper(btrim(item->>'payment_transaction_id')))) then
      raise exception 'duplicate transaction in Batch 14 sheet row %', row_number;
    end if;
    insert into public.batch14_registrations (source_row, full_name, email, phone, institution, attendance,
      payment_method, payment_transaction_id, bank_name, bank_branch, bank_account_number, source_data)
      values (row_number, name_value, email_value, nullif(btrim(item->>'phone'), ''),
        coalesce(nullif(btrim(item->>'institution'), ''), 'University of Dhaka, IIT'),
        attendance_value, nullif(lower(btrim(item->>'payment_method')), ''),
        nullif(upper(btrim(item->>'payment_transaction_id')), ''), nullif(btrim(item->>'bank_name'), ''),
        nullif(btrim(item->>'bank_branch'), ''), nullif(btrim(item->>'bank_account_number'), ''),
        coalesce(item->'source_data', '{}'::jsonb));
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped);
end; $$;
revoke all on function public.admin_import_batch14(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_import_batch14(uuid, jsonb) to service_role;

create or replace function public.admin_prepare_batch14_qr(p_id uuid, p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.batch14_registrations%rowtype;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  select * into r from public.batch14_registrations where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.qr_status = 'sent' then return jsonb_build_object('error', 'already_sent'); end if;
  if r.qr_status = 'sending' and r.qr_delivery_started_at > now() - interval '5 minutes' then
    return jsonb_build_object('error', 'in_progress');
  end if;
  if r.payment_method is null or r.payment_transaction_id is null then
    return jsonb_build_object('error', 'missing_payment_details');
  end if;
  update public.batch14_registrations set payment_status = 'verified', qr_status = 'sending',
    qr_delivery_started_at = now(), qr_reviewed_by = p_admin_id
    where id = p_id;
  return jsonb_build_object('reference', r.reference);
end; $$;
revoke all on function public.admin_prepare_batch14_qr(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_prepare_batch14_qr(uuid, uuid) to service_role;

-- Replace the public submit function from 005 to count both groups and reject duplicate emails across them.
create or replace function public.submit_registration(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.event_settings%rowtype; r public.registrations%rowtype;
normalized_email text; normalized_trx text; method text; destination text; amount integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  select * into s from public.event_settings where id = 1;
  if not found or not s.outsider_registration_enabled
    or (s.registration_opens_at is not null and now() < s.registration_opens_at)
    or (s.registration_closes_at is not null and now() > s.registration_closes_at) then
    return jsonb_build_object('error', 'registration_closed');
  end if;
  method := p_payload->>'payment_method';
  destination := case method when 'bkash' then s.bkash_merchant_number
    when 'rocket' then s.rocket_number when 'nagad' then s.nagad_number else null end;
  if nullif(btrim(destination), '') is null then return jsonb_build_object('error', 'payment_unavailable'); end if;
  normalized_email := lower(btrim(p_payload->>'email'));
  normalized_trx := upper(btrim(p_payload->>'payment_transaction_id'));
  if exists (select 1 from public.registrations where lower(btrim(email)) = normalized_email)
    or exists (select 1 from public.batch14_registrations where lower(btrim(email)) = normalized_email) then
    return jsonb_build_object('error', 'duplicate_registration');
  end if;
  if exists (select 1 from public.registrations where payment_method = method and upper(btrim(payment_transaction_id)) = normalized_trx) then
    return jsonb_build_object('error', 'duplicate_transaction');
  end if;
  if s.capacity is not null and
    (select count(*) from public.registrations where registration_status <> 'rejected') +
    (select count(*) from public.batch14_registrations) >= s.capacity then
    return jsonb_build_object('error', 'registration_full');
  end if;
  if not s.allow_single_day and p_payload->>'attendance' <> 'Both Days' then return jsonb_build_object('error', 'invalid_attendance'); end if;
  if s.require_iit_student_id and (lower(p_payload->>'institution') ~ '(^|[^a-z])iit([^a-z]|$)' or lower(p_payload->>'institution') like '%institute of information technology%')
    and nullif(btrim(p_payload->>'student_id'), '') is null then return jsonb_build_object('error', 'student_id_required'); end if;
  if lower(regexp_replace(btrim(p_payload->>'full_name'), '[[:space:]]+', ' ', 'g')) <>
     lower(regexp_replace(btrim(p_payload->>'bank_account_holder_name'), '[[:space:]]+', ' ', 'g')) then
    return jsonb_build_object('error', 'bank_name_mismatch');
  end if;
  amount := case when p_payload->>'attendance' = 'Both Days' then 2000 else 1000 end;
  insert into public.registrations (
    full_name, email, phone, institution, department, academic_year, student_id,
    programming_languages, programming_level, python_familiarity, api_experience,
    ai_familiarity, agent_experience, traditional_development, ai_tools_basics, built_software_project,
    paid_llm_subscription, paid_llm_models, paid_llm_other_model, local_model_laptop,
    attendance, bringing_laptop, development_environment, learning_expectations,
    declaration_accepted, privacy_accepted, registration_status,
    payment_amount_bdt, payment_method, payment_destination, payment_transaction_id, payment_status,
    bank_name, bank_account_holder_name, bank_account_number, bank_branch
  ) values (
    p_payload->>'full_name', normalized_email, p_payload->>'phone', p_payload->>'institution',
    p_payload->>'department', p_payload->>'academic_year', nullif(p_payload->>'student_id', ''),
    array(select jsonb_array_elements_text(p_payload->'programming_languages')),
    p_payload->>'programming_level', p_payload->>'python_familiarity', p_payload->>'api_experience',
    p_payload->>'ai_familiarity', p_payload->>'agent_experience', p_payload->>'traditional_development',
    p_payload->>'ai_tools_basics', p_payload->>'built_software_project',
    p_payload->>'paid_llm_subscription', array(select jsonb_array_elements_text(p_payload->'paid_llm_models')),
    nullif(p_payload->>'paid_llm_other_model', ''), p_payload->>'local_model_laptop',
    p_payload->>'attendance', p_payload->>'bringing_laptop', p_payload->>'development_environment',
    nullif(p_payload->>'learning_expectations', ''),
    (p_payload->>'declaration_accepted')::boolean, (p_payload->>'privacy_accepted')::boolean,
    'pending', amount, method, destination, normalized_trx, 'unverified',
    p_payload->>'bank_name', p_payload->>'bank_account_holder_name', p_payload->>'bank_account_number',
    nullif(p_payload->>'bank_branch', '')
  ) returning * into r;
  return jsonb_build_object('reference', r.reference, 'status', r.registration_status, 'payment_status', r.payment_status);
end; $$;

create or replace function public.public_registration_count()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select ((select count(*) from public.registrations where registration_status <> 'rejected') +
    (select count(*) from public.batch14_registrations))::integer;
$$;
revoke all on function public.public_registration_count() from public;
grant execute on function public.public_registration_count() to anon, authenticated, service_role;

create or replace function public.admin_batch14_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('total', count(*),
    'pending', count(*) filter (where qr_status = 'pending_review'),
    'sent', count(*) filter (where qr_status = 'sent'),
    'failed', count(*) filter (where qr_status = 'failed')) from public.batch14_registrations;
$$;
revoke all on function public.admin_batch14_stats() from public, anon, authenticated;
grant execute on function public.admin_batch14_stats() to service_role;

create or replace function public.admin_present_participants(p_admin_id uuid, p_day integer)
returns table (source text, reference text, full_name text, email text, attendance text, checked_in_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  if p_day not in (1, 2) then raise exception 'invalid day'; end if;
  return query
    select 'outsider'::text, r.reference, r.full_name, r.email, r.attendance,
      case when p_day = 1 then r.day1_checked_in_at else r.day2_checked_in_at end
    from public.registrations r
    where (case when p_day = 1 then r.day1_checked_in_at else r.day2_checked_in_at end) is not null
    union all
    select 'batch14'::text, b.reference, b.full_name, b.email, b.attendance,
      case when p_day = 1 then b.day1_checked_in_at else b.day2_checked_in_at end
    from public.batch14_registrations b
    where (case when p_day = 1 then b.day1_checked_in_at else b.day2_checked_in_at end) is not null
    order by 6 desc;
end; $$;
revoke all on function public.admin_present_participants(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_present_participants(uuid, integer) to service_role;

create or replace function public.admin_check_in(p_reference text, p_day integer, p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.registrations%rowtype; b public.batch14_registrations%rowtype; current_day integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  current_day := case (now() at time zone 'Asia/Dhaka')::date
    when date '2026-10-17' then 1 when date '2026-10-18' then 2 else 0 end;
  if p_day <> current_day then return jsonb_build_object('error', 'wrong_day'); end if;
  if not exists (select 1 from public.admins where user_id = p_admin_id) then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  if p_reference like 'B14-%' then
    select * into b from public.batch14_registrations where reference = p_reference for update;
    if not found then return jsonb_build_object('error', 'not_found'); end if;
    if b.qr_status <> 'sent' then return jsonb_build_object('error', 'qr_not_sent'); end if;
    if (p_day = 1 and b.attendance = 'Day 2 Only') or (p_day = 2 and b.attendance = 'Day 1 Only') then
      return jsonb_build_object('error', 'wrong_attendance'); end if;
    if (p_day = 1 and b.day1_checked_in_at is not null) or (p_day = 2 and b.day2_checked_in_at is not null) then
      return jsonb_build_object('status', 'already_checked_in', 'source', 'batch14', 'name', b.full_name,
        'reference', b.reference, 'attendance', b.attendance,
        'checked_in_at', case when p_day = 1 then b.day1_checked_in_at else b.day2_checked_in_at end);
    end if;
    if p_day = 1 then update public.batch14_registrations set day1_checked_in_at = now(), day1_checked_in_by = p_admin_id where id = b.id;
    else update public.batch14_registrations set day2_checked_in_at = now(), day2_checked_in_by = p_admin_id where id = b.id; end if;
    return jsonb_build_object('status', 'checked_in', 'source', 'batch14', 'name', b.full_name,
      'reference', b.reference, 'attendance', b.attendance, 'checked_in_at', now());
  end if;
  select * into r from public.registrations where reference = p_reference for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.registration_status = 'rejected' then return jsonb_build_object('error', 'rejected_registration'); end if;
  if r.qr_status <> 'sent' then return jsonb_build_object('error', 'qr_not_sent'); end if;
  if (p_day = 1 and r.attendance = 'Day 2 Only') or (p_day = 2 and r.attendance = 'Day 1 Only') then
    return jsonb_build_object('error', 'wrong_attendance'); end if;
  if (p_day = 1 and r.day1_checked_in_at is not null) or (p_day = 2 and r.day2_checked_in_at is not null) then
    return jsonb_build_object('status', 'already_checked_in', 'source', 'outsider', 'name', r.full_name,
      'reference', r.reference, 'attendance', r.attendance,
      'checked_in_at', case when p_day = 1 then r.day1_checked_in_at else r.day2_checked_in_at end);
  end if;
  if p_day = 1 then update public.registrations set day1_checked_in_at = now(), day1_checked_in_by = p_admin_id where id = r.id;
  else update public.registrations set day2_checked_in_at = now(), day2_checked_in_by = p_admin_id where id = r.id; end if;
  return jsonb_build_object('status', 'checked_in', 'source', 'outsider', 'name', r.full_name,
    'reference', r.reference, 'attendance', r.attendance, 'checked_in_at', now());
end; $$;
notify pgrst, 'reload schema';
