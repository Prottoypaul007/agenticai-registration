-- Apply only if 001_initial.sql was run before spam protection was removed.
-- Keeps registrations, settings, and admins intact.
create or replace function public.submit_registration(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.event_settings%rowtype;
declare r public.registrations%rowtype;
declare normalized_email text;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
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
drop function if exists public.submit_registration(jsonb, text);
drop table if exists public.registration_rate_events;
notify pgrst, 'reload schema';
