-- Run after 006_email_and_checkin.sql. Existing records are preserved.
alter table public.registrations
  add column if not exists qr_status text not null default 'pending_review',
  add column if not exists qr_reviewed_at timestamptz,
  add column if not exists qr_reviewed_by uuid references auth.users(id),
  add column if not exists qr_delivery_started_at timestamptz,
  add column if not exists qr_sent_at timestamptz,
  add column if not exists qr_sent_by uuid references auth.users(id),
  add column if not exists rejection_reason_code text,
  add column if not exists rejection_reason_detail text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id),
  add column if not exists rejection_email_status text not null default 'not_required',
  add column if not exists rejection_email_sent_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_qr_status_check') then
    alter table public.registrations add constraint registrations_qr_status_check
      check (qr_status in ('pending_review', 'sending', 'sent', 'failed', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'registrations_rejection_email_status_check') then
    alter table public.registrations add constraint registrations_rejection_email_status_check
      check (rejection_email_status in ('not_required', 'pending', 'sent', 'failed'));
  end if;
end $$;

-- Keep tickets delivered before this migration visible in the sent history.
update public.registrations set qr_status = 'sent', qr_sent_at = confirmation_email_sent_at
where confirmation_email_status = 'sent' and qr_status = 'pending_review';
update public.registrations set qr_status = 'rejected', rejected_at = coalesce(rejected_at, updated_at)
where registration_status = 'rejected' and qr_status <> 'rejected';

create index if not exists registrations_qr_status_idx on public.registrations (qr_status, created_at desc);

create or replace function public.admin_prepare_qr(p_id uuid, p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.registrations%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.admins where user_id = p_admin_id) then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  select * into r from public.registrations where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.registration_status = 'rejected' or r.qr_status = 'rejected' then
    return jsonb_build_object('error', 'rejected');
  end if;
  if r.qr_status = 'sent' then return jsonb_build_object('error', 'already_sent'); end if;
  if r.qr_status = 'sending' and r.qr_delivery_started_at > now() - interval '5 minutes' then
    return jsonb_build_object('error', 'in_progress');
  end if;
  if r.payment_status not in ('unverified', 'verified') then
    return jsonb_build_object('error', 'invalid_payment_status');
  end if;
  update public.registrations set
    payment_status = 'verified',
    qr_status = 'sending', qr_reviewed_at = now(),
    qr_reviewed_by = p_admin_id,
    qr_delivery_started_at = now(), confirmation_email_status = 'pending'
  where id = p_id;
  return jsonb_build_object('reference', r.reference, 'status', 'sending');
end; $$;
revoke all on function public.admin_prepare_qr(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_prepare_qr(uuid, uuid) to service_role;

create or replace function public.admin_reject_registration(
  p_id uuid, p_admin_id uuid, p_reason_code text, p_reason_detail text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.registrations%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.admins where user_id = p_admin_id) then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  if p_reason_code is null or p_reason_code not in ('transaction_mismatch', 'criteria_not_met', 'incomplete_information', 'other')
    or length(coalesce(p_reason_detail, '')) > 500
    or (p_reason_code = 'other' and nullif(btrim(p_reason_detail), '') is null) then
    return jsonb_build_object('error', 'invalid_reason');
  end if;
  select * into r from public.registrations where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.payment_status <> 'unverified' or r.registration_status = 'rejected'
    or r.qr_status <> 'pending_review' then
    return jsonb_build_object('error', 'invalid_transition');
  end if;
  update public.registrations set
    registration_status = 'rejected', qr_status = 'rejected',
    rejection_reason_code = p_reason_code, rejection_reason_detail = nullif(btrim(p_reason_detail), ''),
    rejected_at = now(), rejected_by = p_admin_id,
    rejection_email_status = 'pending'
  where id = p_id;
  return jsonb_build_object('reference', r.reference, 'status', 'rejected');
end; $$;
revoke all on function public.admin_reject_registration(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reject_registration(uuid, uuid, text, text) to service_role;

create or replace function public.admin_registration_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) filter (where registration_status = 'confirmed'),
    'pending', count(*) filter (where registration_status = 'pending'),
    'rejected', count(*) filter (where registration_status = 'rejected'),
    'qr_pending_review', count(*) filter (where qr_status = 'pending_review'),
    'qr_sent', count(*) filter (where qr_status = 'sent'),
    'qr_failed', count(*) filter (where qr_status = 'failed'),
    'day1', count(*) filter (where attendance in ('Both Days', 'Day 1 Only')),
    'day2', count(*) filter (where attendance in ('Both Days', 'Day 2 Only')),
    'both', count(*) filter (where attendance = 'Both Days'),
    'payment_unverified', count(*) filter (where payment_status = 'unverified' and registration_status <> 'rejected'),
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

-- Only tickets deliberately sent after review are valid for attendance.
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
  if r.registration_status = 'rejected' then return jsonb_build_object('error', 'rejected_registration'); end if;
  if r.qr_status <> 'sent' then return jsonb_build_object('error', 'qr_not_sent'); end if;
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
