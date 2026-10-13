-- Run after 013. Drafts and final notifications are accessible only through admin server routes.
create table public.contest_team_plan (
  id integer primary key default 1 check (id = 1),
  version uuid not null default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  teams jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id)
);

create table public.contest_team_notifications (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('outsider', 'batch14')),
  reference text not null,
  team_name text not null,
  full_name text not null,
  email text not null,
  phone text not null default '',
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed')),
  email_attempts integer not null default 0,
  email_sent_at timestamptz,
  email_error text,
  unique (source, reference)
);
create index contest_team_notifications_status_idx on public.contest_team_notifications (email_status);
alter table public.contest_team_plan enable row level security;
alter table public.contest_team_notifications enable row level security;
revoke all on public.contest_team_plan, public.contest_team_notifications from anon, authenticated;

create or replace function public.admin_save_contest_team_draft(p_admin_id uuid, p_teams jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  team jsonb;
  member jsonb;
  canonical_members jsonb;
  canonical_teams jsonb := '[]'::jsonb;
  team_name text;
  source_value text;
  reference_value text;
  participant_name text;
  participant_email text;
  participant_phone text;
  seen_members text[] := '{}';
  seen_names text[] := '{}';
  eligible_count integer;
  new_version uuid := gen_random_uuid();
  plan_status text;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_teams) <> 'array' then
    return jsonb_build_object('error', 'invalid_teams');
  end if;
  if jsonb_array_length(p_teams) < 1 or jsonb_array_length(p_teams) > 250 then
    return jsonb_build_object('error', 'invalid_teams');
  end if;
  perform pg_advisory_xact_lock(hashtext('contest-teams'));
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  lock table public.registrations, public.batch14_registrations in share mode;
  insert into public.contest_team_plan (id) values (1) on conflict (id) do nothing;
  select status into plan_status from public.contest_team_plan where id = 1 for update;
  if plan_status = 'finalized' then return jsonb_build_object('error', 'already_finalized'); end if;

  for team in select value from jsonb_array_elements(p_teams) loop
    team_name := btrim(team->>'name');
    if nullif(team_name, '') is null or team_name = any(seen_names) or jsonb_typeof(team->'members') <> 'array' then
      return jsonb_build_object('error', 'invalid_teams');
    end if;
    if jsonb_array_length(team->'members') not between 1 and 5 then
      return jsonb_build_object('error', 'invalid_teams');
    end if;
    seen_names := array_append(seen_names, team_name);
    canonical_members := '[]'::jsonb;
    for member in select value from jsonb_array_elements(team->'members') loop
      source_value := member->>'source';
      reference_value := member->>'reference';
      if source_value not in ('outsider', 'batch14') or nullif(reference_value, '') is null or
         (source_value || ':' || reference_value) = any(seen_members) then
        return jsonb_build_object('error', 'duplicate_or_invalid_member');
      end if;
      participant_name := null;
      if source_value = 'outsider' then
        select full_name, email, phone into participant_name, participant_email, participant_phone
          from public.registrations where reference = reference_value and qr_status = 'sent' and registration_status = 'confirmed';
      else
        select full_name, email, coalesce(phone, '') into participant_name, participant_email, participant_phone
          from public.batch14_registrations where reference = reference_value and qr_status = 'sent';
      end if;
      if participant_name is null then return jsonb_build_object('error', 'roster_changed'); end if;
      seen_members := array_append(seen_members, source_value || ':' || reference_value);
      canonical_members := canonical_members || jsonb_build_array(jsonb_build_object(
        'source', source_value, 'reference', reference_value, 'full_name', participant_name,
        'email', participant_email, 'phone', coalesce(participant_phone, '')));
    end loop;
    canonical_teams := canonical_teams || jsonb_build_array(jsonb_build_object('name', team_name, 'members', canonical_members));
  end loop;

  select (select count(*) from public.registrations where qr_status = 'sent' and registration_status = 'confirmed') +
         (select count(*) from public.batch14_registrations where qr_status = 'sent') into eligible_count;
  if cardinality(seen_members) <> eligible_count then return jsonb_build_object('error', 'roster_changed'); end if;
  update public.contest_team_plan set version = new_version, teams = canonical_teams, updated_at = now() where id = 1;
  return jsonb_build_object('version', new_version, 'status', 'draft', 'teams', canonical_teams);
end; $$;
revoke all on function public.admin_save_contest_team_draft(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_contest_team_draft(uuid, jsonb) to service_role;

create or replace function public.admin_finalize_contest_teams(p_admin_id uuid, p_version uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  plan public.contest_team_plan%rowtype;
  team jsonb;
  member jsonb;
  eligible_count integer;
  planned_count integer := 0;
  member_valid boolean;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtext('contest-teams'));
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  lock table public.registrations, public.batch14_registrations in share mode;
  select * into plan from public.contest_team_plan where id = 1 for update;
  if not found then return jsonb_build_object('error', 'no_draft'); end if;
  if plan.status = 'finalized' then return jsonb_build_object('error', 'already_finalized'); end if;
  if plan.version is distinct from p_version then return jsonb_build_object('error', 'draft_changed'); end if;

  for team in select value from jsonb_array_elements(plan.teams) loop
    for member in select value from jsonb_array_elements(team->'members') loop
      if member->>'source' = 'outsider' then
        select exists (select 1 from public.registrations where reference = member->>'reference'
          and qr_status = 'sent' and registration_status = 'confirmed') into member_valid;
      else
        select exists (select 1 from public.batch14_registrations where reference = member->>'reference'
          and qr_status = 'sent') into member_valid;
      end if;
      if not member_valid then return jsonb_build_object('error', 'roster_changed'); end if;
      planned_count := planned_count + 1;
    end loop;
  end loop;
  select (select count(*) from public.registrations where qr_status = 'sent' and registration_status = 'confirmed') +
         (select count(*) from public.batch14_registrations where qr_status = 'sent') into eligible_count;
  if planned_count <> eligible_count then return jsonb_build_object('error', 'roster_changed'); end if;

  for team in select value from jsonb_array_elements(plan.teams) loop
    for member in select value from jsonb_array_elements(team->'members') loop
      insert into public.contest_team_notifications (source, reference, team_name, full_name, email, phone)
      values (member->>'source', member->>'reference', team->>'name', member->>'full_name',
        member->>'email', coalesce(member->>'phone', ''));
    end loop;
  end loop;
  update public.contest_team_plan set status = 'finalized', finalized_at = now(), finalized_by = p_admin_id where id = 1;
  return jsonb_build_object('status', 'finalized', 'members', planned_count);
end; $$;
revoke all on function public.admin_finalize_contest_teams(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_finalize_contest_teams(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
