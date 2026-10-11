-- Run after 009. Keep Form responses visible even when a transaction ID conflicts.
alter table public.batch14_registrations
  add column if not exists import_issue text check (import_issue in ('duplicate_transaction'));

create or replace function public.admin_import_batch14(p_admin_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item jsonb;
  added integer := 0;
  skipped integer := 0;
  conflicts integer := 0;
  resolved integer := 0;
  row_number integer;
  existing_id uuid;
  existing_email text;
  existing_method text;
  existing_transaction text;
  email_value text;
  name_value text;
  attendance_value text;
  method_value text;
  transaction_value text;
  transaction_conflict boolean;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'invalid import'; end if;
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  for item in select value from jsonb_array_elements(p_rows) loop
    row_number := (item->>'source_row')::integer;
    email_value := lower(btrim(item->>'email'));
    name_value := btrim(item->>'full_name');
    attendance_value := coalesce(nullif(item->>'attendance', ''), 'Both Days');
    method_value := nullif(lower(btrim(item->>'payment_method')), '');
    transaction_value := nullif(upper(btrim(item->>'payment_transaction_id')), '');
    if row_number <= 1 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or nullif(name_value, '') is null or attendance_value not in ('Both Days', 'Day 1 Only', 'Day 2 Only') then
      raise exception 'invalid Batch 14 row %', row_number;
    end if;

    select id, email, payment_method, payment_transaction_id
      into existing_id, existing_email, existing_method, existing_transaction
      from public.batch14_registrations where source_row = row_number;
    if existing_id is not null and lower(btrim(existing_email)) <> email_value then
      raise exception 'Google Sheet row % changed identity; restore the original row order', row_number;
    end if;
    if existing_id is null and
       (exists (select 1 from public.batch14_registrations where lower(btrim(email)) = email_value)
        or exists (select 1 from public.registrations where lower(btrim(email)) = email_value)) then
      skipped := skipped + 1;
      continue;
    end if;

    transaction_conflict := transaction_value is not null and method_value is not null and
      (exists (select 1 from public.batch14_registrations
        where id is distinct from existing_id and lower(btrim(payment_method)) = method_value
          and upper(btrim(payment_transaction_id)) = transaction_value)
       or exists (select 1 from public.registrations
        where payment_method = method_value and upper(btrim(payment_transaction_id)) = transaction_value));

    if existing_id is not null then
      if existing_method is null or existing_transaction is null then
        update public.batch14_registrations
          set payment_method = method_value,
              payment_transaction_id = case when transaction_conflict then null else transaction_value end,
              import_issue = case when transaction_conflict then 'duplicate_transaction' else null end,
              source_data = coalesce(item->'source_data', '{}'::jsonb)
          where id = existing_id;
        if transaction_conflict then conflicts := conflicts + 1;
        elsif transaction_value is not null then resolved := resolved + 1;
        end if;
      end if;
      skipped := skipped + 1;
      continue;
    end if;

    insert into public.batch14_registrations (source_row, full_name, email, phone, institution, attendance,
      payment_method, payment_transaction_id, bank_name, bank_branch, bank_account_number, source_data, import_issue)
      values (row_number, name_value, email_value, nullif(btrim(item->>'phone'), ''),
        coalesce(nullif(btrim(item->>'institution'), ''), 'University of Dhaka, IIT'), attendance_value,
        method_value, case when transaction_conflict then null else transaction_value end,
        nullif(btrim(item->>'bank_name'), ''), nullif(btrim(item->>'bank_branch'), ''),
        nullif(btrim(item->>'bank_account_number'), ''), coalesce(item->'source_data', '{}'::jsonb),
        case when transaction_conflict then 'duplicate_transaction' else null end);
    added := added + 1;
    if transaction_conflict then conflicts := conflicts + 1; end if;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'conflicts', conflicts, 'resolved', resolved);
end; $$;
revoke all on function public.admin_import_batch14(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_import_batch14(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
