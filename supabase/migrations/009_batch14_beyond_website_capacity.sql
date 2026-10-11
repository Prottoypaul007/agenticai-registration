-- Run after 008. Batch 14 Form responses may continue after the website reaches its 45-seat limit.
-- The public website capacity check still counts both groups and closes at the threshold.
create or replace function public.admin_import_batch14(p_admin_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; added integer := 0; skipped integer := 0;
email_value text; row_number integer; name_value text; attendance_value text; existing_email text;
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

notify pgrst, 'reload schema';
