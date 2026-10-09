-- Run in the Supabase SQL editor or with `supabase db push`.
create extension if not exists pgcrypto;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.event_settings (
  id integer primary key default 1 check (id = 1),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  approval_required boolean not null default true,
  allow_single_day boolean not null default true,
  event_time text not null default 'To Be Announced',
  venue text not null default 'Institute of Information Technology (IIT)',
  require_iit_student_id boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint valid_registration_window check (registration_opens_at is null or registration_closes_at is null or registration_opens_at < registration_closes_at)
);
insert into public.event_settings (id) values (1);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('AGNT-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  full_name text not null,
  email text not null,
  phone text not null,
  institution text not null,
  department text not null,
  academic_year text not null,
  student_id text,
  programming_languages text[] not null,
  programming_level text not null,
  python_familiarity text not null,
  api_experience text not null,
  ai_familiarity text not null,
  agent_experience text not null,
  attendance text not null check (attendance in ('Both Days', 'Day 1 Only', 'Day 2 Only')),
  bringing_laptop text not null,
  development_environment text not null,
  learning_expectations text,
  declaration_accepted boolean not null check (declaration_accepted),
  privacy_accepted boolean not null check (privacy_accepted),
  registration_status text not null check (registration_status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index registrations_email_normalized_unique on public.registrations (lower(btrim(email)));
create index registrations_created_at_idx on public.registrations (created_at desc);
create index registrations_status_idx on public.registrations (registration_status);
create index registrations_attendance_idx on public.registrations (attendance);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger registrations_updated_at before update on public.registrations for each row execute function public.touch_updated_at();
create trigger event_settings_updated_at before update on public.event_settings for each row execute function public.touch_updated_at();

alter table public.admins enable row level security;
alter table public.event_settings enable row level security;
alter table public.registrations enable row level security;
-- No public/anon/authenticated policies: all reads and writes go through checked server routes.
revoke all on public.admins, public.event_settings, public.registrations from anon, authenticated;

create or replace function public.submit_registration(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.event_settings%rowtype;
declare r public.registrations%rowtype;
declare normalized_email text;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  -- Serialize submission checks to enforce capacity under concurrency.
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  select * into s from public.event_settings where id = 1;
  if not found or (s.registration_opens_at is not null and now() < s.registration_opens_at)
    or (s.registration_closes_at is not null and now() > s.registration_closes_at) then
    return jsonb_build_object('error', 'registration_closed');
  end if;
  normalized_email := lower(btrim(p_payload->>'email'));
  if exists (select 1 from public.registrations where lower(btrim(email)) = normalized_email) then
    return jsonb_build_object('error', 'duplicate_registration');
  end if;
  if s.capacity is not null and (select count(*) from public.registrations where registration_status <> 'rejected') >= s.capacity then
    return jsonb_build_object('error', 'registration_full');
  end if;
  if not s.allow_single_day and p_payload->>'attendance' <> 'Both Days' then return jsonb_build_object('error', 'invalid_attendance'); end if;
  if s.require_iit_student_id and (lower(p_payload->>'institution') ~ '(^|[^a-z])iit([^a-z]|$)' or lower(p_payload->>'institution') like '%institute of information technology%')
    and nullif(btrim(p_payload->>'student_id'), '') is null then return jsonb_build_object('error', 'student_id_required'); end if;
  insert into public.registrations (
    full_name, email, phone, institution, department, academic_year, student_id,
    programming_languages, programming_level, python_familiarity, api_experience,
    ai_familiarity, agent_experience, attendance, bringing_laptop, development_environment,
    learning_expectations, declaration_accepted, privacy_accepted, registration_status
  ) values (
    p_payload->>'full_name', normalized_email, p_payload->>'phone', p_payload->>'institution',
    p_payload->>'department', p_payload->>'academic_year', nullif(p_payload->>'student_id', ''),
    array(select jsonb_array_elements_text(p_payload->'programming_languages')),
    p_payload->>'programming_level', p_payload->>'python_familiarity', p_payload->>'api_experience',
    p_payload->>'ai_familiarity', p_payload->>'agent_experience', p_payload->>'attendance',
    p_payload->>'bringing_laptop', p_payload->>'development_environment',
    nullif(p_payload->>'learning_expectations', ''),
    (p_payload->>'declaration_accepted')::boolean, (p_payload->>'privacy_accepted')::boolean,
    case when s.approval_required then 'pending' else 'confirmed' end
  ) returning * into r;
  return jsonb_build_object('reference', r.reference, 'status', r.registration_status);
end; $$;
revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_registration(jsonb) to service_role;

create or replace function public.admin_registration_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) filter (where registration_status = 'confirmed'),
    'pending', count(*) filter (where registration_status = 'pending'),
    'day1', count(*) filter (where attendance in ('Both Days', 'Day 1 Only')),
    'day2', count(*) filter (where attendance in ('Both Days', 'Day 2 Only')),
    'both', count(*) filter (where attendance = 'Both Days'),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'count', n) order by day)
      from (select (created_at at time zone 'Asia/Dhaka')::date as day, count(*) as n
        from public.registrations group by 1 order by 1 desc limit 30) d), '[]'::jsonb)
  ) from public.registrations;
$$;
revoke all on function public.admin_registration_stats() from public, anon, authenticated;
grant execute on function public.admin_registration_stats() to service_role;
