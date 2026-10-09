-- Run after 001_initial.sql (and 002_remove_spam_protection.sql if applicable).
-- Existing registrations are retained as legacy records with no payment due recorded.
alter table public.event_settings add column if not exists bkash_merchant_number text;

alter table public.registrations add column if not exists traditional_development text;
alter table public.registrations add column if not exists ai_tools_basics text;
alter table public.registrations add column if not exists built_software_project text;
alter table public.registrations add column if not exists payment_amount_bdt integer not null default 0;
alter table public.registrations add column if not exists payment_destination text;
alter table public.registrations add column if not exists bkash_transaction_id text;
alter table public.registrations add column if not exists payment_status text not null default 'legacy';
alter table public.registrations add column if not exists bank_name text;
alter table public.registrations add column if not exists bank_account_holder_name text;
alter table public.registrations add column if not exists bank_account_number text;
alter table public.registrations add column if not exists bank_branch text;
alter table public.registrations add column if not exists completion_status text not null default 'not_completed';
alter table public.registrations add column if not exists completed_at timestamptz;
alter table public.registrations add column if not exists refund_status text not null default 'not_eligible';
alter table public.registrations add column if not exists refund_reference text;
alter table public.registrations add column if not exists refunded_at timestamptz;

create unique index if not exists registrations_bkash_trx_unique on public.registrations (upper(btrim(bkash_transaction_id))) where bkash_transaction_id is not null;
alter table public.registrations add constraint registrations_payment_amount_check check (payment_amount_bdt in (0, 1000, 2000));
alter table public.registrations add constraint registrations_payment_status_check check (payment_status in ('legacy', 'unverified', 'verified'));
alter table public.registrations add constraint registrations_completion_status_check check (completion_status in ('not_completed', 'completed'));
alter table public.registrations add constraint registrations_refund_status_check check (refund_status in ('not_eligible', 'pending', 'sent'));

create or replace function public.submit_registration(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.event_settings%rowtype;
declare r public.registrations%rowtype;
declare normalized_email text;
declare normalized_trx text;
declare amount integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  select * into s from public.event_settings where id = 1;
  if not found or (s.registration_opens_at is not null and now() < s.registration_opens_at)
    or (s.registration_closes_at is not null and now() > s.registration_closes_at) then
    return jsonb_build_object('error', 'registration_closed');
  end if;
  if nullif(btrim(s.bkash_merchant_number), '') is null then
    return jsonb_build_object('error', 'payment_unavailable');
  end if;
  normalized_email := lower(btrim(p_payload->>'email'));
  normalized_trx := upper(btrim(p_payload->>'bkash_transaction_id'));
  if exists (select 1 from public.registrations where lower(btrim(email)) = normalized_email) then
    return jsonb_build_object('error', 'duplicate_registration');
  end if;
  if exists (select 1 from public.registrations where upper(btrim(bkash_transaction_id)) = normalized_trx) then
    return jsonb_build_object('error', 'duplicate_transaction');
  end if;
  if s.capacity is not null and (select count(*) from public.registrations where registration_status <> 'rejected') >= s.capacity then
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
    attendance, bringing_laptop, development_environment, learning_expectations,
    declaration_accepted, privacy_accepted, registration_status,
    payment_amount_bdt, payment_destination, bkash_transaction_id, payment_status,
    bank_name, bank_account_holder_name, bank_account_number, bank_branch
  ) values (
    p_payload->>'full_name', normalized_email, p_payload->>'phone', p_payload->>'institution',
    p_payload->>'department', p_payload->>'academic_year', nullif(p_payload->>'student_id', ''),
    array(select jsonb_array_elements_text(p_payload->'programming_languages')),
    p_payload->>'programming_level', p_payload->>'python_familiarity', p_payload->>'api_experience',
    p_payload->>'ai_familiarity', p_payload->>'agent_experience', p_payload->>'traditional_development',
    p_payload->>'ai_tools_basics', p_payload->>'built_software_project', p_payload->>'attendance',
    p_payload->>'bringing_laptop', p_payload->>'development_environment',
    nullif(p_payload->>'learning_expectations', ''),
    (p_payload->>'declaration_accepted')::boolean, (p_payload->>'privacy_accepted')::boolean,
    'pending', amount, s.bkash_merchant_number, normalized_trx, 'unverified',
    p_payload->>'bank_name', p_payload->>'bank_account_holder_name', p_payload->>'bank_account_number',
    nullif(p_payload->>'bank_branch', '')
  ) returning * into r;
  return jsonb_build_object('reference', r.reference, 'status', r.registration_status, 'payment_status', r.payment_status);
end; $$;
revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_registration(jsonb) to service_role;

create or replace function public.admin_registration_action(p_id uuid, p_action text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.registrations%rowtype;
declare s public.event_settings%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into r from public.registrations where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into s from public.event_settings where id = 1;
  case p_action
    when 'verify_payment' then
      if r.payment_status <> 'unverified' or r.registration_status = 'rejected' then return jsonb_build_object('error', 'invalid_transition'); end if;
      update public.registrations set payment_status = 'verified',
        registration_status = case when s.approval_required then 'pending' else 'confirmed' end
      where id = p_id;
    when 'approve' then
      if r.payment_status <> 'verified' or r.registration_status <> 'pending' then return jsonb_build_object('error', 'payment_not_verified'); end if;
      update public.registrations set registration_status = 'confirmed' where id = p_id;
    when 'reject' then
      if r.registration_status = 'rejected' or r.completion_status = 'completed' then return jsonb_build_object('error', 'invalid_transition'); end if;
      if r.payment_status = 'verified' then return jsonb_build_object('error', 'paid_registration_requires_manual_resolution'); end if;
      update public.registrations set registration_status = 'rejected' where id = p_id;
    when 'complete' then
      if r.payment_status <> 'verified' or r.registration_status <> 'confirmed' or r.completion_status = 'completed' then
        return jsonb_build_object('error', 'invalid_transition');
      end if;
      update public.registrations set completion_status = 'completed', completed_at = now(), refund_status = 'pending' where id = p_id;
    when 'mark_refunded' then
      if r.completion_status <> 'completed' or r.payment_status <> 'verified' or r.refund_status <> 'pending'
        or nullif(btrim(p_ref), '') is null then return jsonb_build_object('error', 'invalid_transition'); end if;
      update public.registrations set refund_status = 'sent', refund_reference = btrim(p_ref), refunded_at = now() where id = p_id;
    else return jsonb_build_object('error', 'invalid_action');
  end case;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.admin_registration_action(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_registration_action(uuid, text, text) to service_role;

create or replace function public.admin_registration_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) filter (where registration_status = 'confirmed'),
    'pending', count(*) filter (where registration_status = 'pending'),
    'day1', count(*) filter (where attendance in ('Both Days', 'Day 1 Only')),
    'day2', count(*) filter (where attendance in ('Both Days', 'Day 2 Only')),
    'both', count(*) filter (where attendance = 'Both Days'),
    'payment_unverified', count(*) filter (where payment_status = 'unverified'),
    'refunds_pending', count(*) filter (where refund_status = 'pending'),
    'refunds_sent', count(*) filter (where refund_status = 'sent'),
    'amount_verified_bdt', coalesce(sum(payment_amount_bdt) filter (where payment_status = 'verified'), 0),
    'amount_refunded_bdt', coalesce(sum(payment_amount_bdt) filter (where refund_status = 'sent'), 0),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'count', n) order by day)
      from (select (created_at at time zone 'Asia/Dhaka')::date as day, count(*) as n
        from public.registrations group by 1 order by 1 desc limit 30) d), '[]'::jsonb)
  ) from public.registrations;
$$;
revoke all on function public.admin_registration_stats() from public, anon, authenticated;
grant execute on function public.admin_registration_stats() to service_role;
notify pgrst, 'reload schema';
