-- Run after 003_payment_and_refunds.sql. Existing registration and payment data are preserved.
alter table public.event_settings add column if not exists rocket_number text;
alter table public.event_settings add column if not exists nagad_number text;

-- The earlier bKash-only field becomes a method-independent transaction ID.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'registrations' and column_name = 'bkash_transaction_id')
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'registrations' and column_name = 'payment_transaction_id') then
    alter table public.registrations rename column bkash_transaction_id to payment_transaction_id;
  end if;
end; $$;
alter table public.registrations add column if not exists payment_method text not null default 'bkash';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_payment_method_check') then
    alter table public.registrations add constraint registrations_payment_method_check check (payment_method in ('bkash', 'rocket', 'nagad'));
  end if;
end; $$;
drop index if exists public.registrations_bkash_trx_unique;
create unique index if not exists registrations_payment_trx_unique
  on public.registrations (payment_method, upper(btrim(payment_transaction_id)))
  where payment_transaction_id is not null;

-- Numbers supplied by the organizer. Nagad remains blank until its number is confirmed.
update public.event_settings
set bkash_merchant_number = '01817889286', rocket_number = '018178892865',
    registration_opens_at = null, registration_closes_at = null,
    approval_required = false
where id = 1;

create or replace function public.submit_registration(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.event_settings%rowtype;
declare r public.registrations%rowtype;
declare normalized_email text;
declare normalized_trx text;
declare method text;
declare destination text;
declare amount integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  select * into s from public.event_settings where id = 1;
  if not found or (s.registration_opens_at is not null and now() < s.registration_opens_at)
    or (s.registration_closes_at is not null and now() > s.registration_closes_at) then
    return jsonb_build_object('error', 'registration_closed');
  end if;
  method := p_payload->>'payment_method';
  destination := case method
    when 'bkash' then s.bkash_merchant_number
    when 'rocket' then s.rocket_number
    when 'nagad' then s.nagad_number
    else null end;
  if nullif(btrim(destination), '') is null then return jsonb_build_object('error', 'payment_unavailable'); end if;
  normalized_email := lower(btrim(p_payload->>'email'));
  normalized_trx := upper(btrim(p_payload->>'payment_transaction_id'));
  if exists (select 1 from public.registrations where lower(btrim(email)) = normalized_email) then
    return jsonb_build_object('error', 'duplicate_registration');
  end if;
  if exists (select 1 from public.registrations where payment_method = method and upper(btrim(payment_transaction_id)) = normalized_trx) then
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
    payment_amount_bdt, payment_method, payment_destination, payment_transaction_id, payment_status,
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
    'pending', amount, method, destination, normalized_trx, 'unverified',
    p_payload->>'bank_name', p_payload->>'bank_account_holder_name', p_payload->>'bank_account_number',
    nullif(p_payload->>'bank_branch', '')
  ) returning * into r;
  return jsonb_build_object('reference', r.reference, 'status', r.registration_status, 'payment_status', r.payment_status);
end; $$;
revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_registration(jsonb) to service_role;
notify pgrst, 'reload schema';
