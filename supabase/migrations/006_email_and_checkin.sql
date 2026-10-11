-- Run after 005_llm_readiness_questions.sql.
alter table public.registrations
  add column if not exists confirmation_email_status text not null default 'pending'
    check (confirmation_email_status in ('pending', 'sent', 'failed')),
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists day1_checked_in_at timestamptz,
  add column if not exists day1_checked_in_by uuid references auth.users(id),
  add column if not exists day2_checked_in_at timestamptz,
  add column if not exists day2_checked_in_by uuid references auth.users(id);

create or replace function public.admin_check_in(p_reference text, p_day integer, p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.registrations%rowtype;
declare current_day integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  current_day := case (now() at time zone 'Asia/Dhaka')::date
    when date '2026-10-17' then 1 when date '2026-10-18' then 2 else 0 end;
  if p_day <> current_day then return jsonb_build_object('error', 'wrong_day'); end if;
  if not exists (select 1 from public.admins where user_id = p_admin_id) then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  select * into r from public.registrations where reference = p_reference for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  -- Attendance is separate from manual payment review and approval.
  if r.registration_status = 'rejected' then
    return jsonb_build_object('error', 'rejected_registration');
  end if;
  if (p_day = 1 and r.attendance = 'Day 2 Only') or
     (p_day = 2 and r.attendance = 'Day 1 Only') then
    return jsonb_build_object('error', 'wrong_attendance');
  end if;
  if (p_day = 1 and r.day1_checked_in_at is not null) or
     (p_day = 2 and r.day2_checked_in_at is not null) then
    return jsonb_build_object('status', 'already_checked_in', 'name', r.full_name,
      'reference', r.reference, 'attendance', r.attendance,
      'checked_in_at', case when p_day = 1 then r.day1_checked_in_at else r.day2_checked_in_at end);
  end if;
  if p_day = 1 then
    update public.registrations set day1_checked_in_at = now(), day1_checked_in_by = p_admin_id where id = r.id;
  else
    update public.registrations set day2_checked_in_at = now(), day2_checked_in_by = p_admin_id where id = r.id;
  end if;
  return jsonb_build_object('status', 'checked_in', 'name', r.full_name,
    'reference', r.reference, 'attendance', r.attendance, 'checked_in_at', now());
end; $$;
revoke all on function public.admin_check_in(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.admin_check_in(text, integer, uuid) to service_role;
notify pgrst, 'reload schema';
