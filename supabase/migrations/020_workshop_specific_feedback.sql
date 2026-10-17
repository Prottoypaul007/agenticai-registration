-- Extend the anonymous workshop questionnaire without changing earlier responses.
alter table public.workshop_feedback_v2
  add column response_version smallint not null default 1,
  add column outcome_confidence text,
  add column focus_area text;

alter table public.workshop_feedback_v2
  add constraint workshop_feedback_v2_response_version_check check (response_version in (1, 2)),
  add constraint workshop_feedback_v2_specific_answers_check check (
    response_version = 1 or (
      outcome_confidence is not null and outcome_confidence in
        ('Very confident', 'Somewhat confident', 'Not yet confident')
      and focus_area is not null and (
        (form_key = 'workshop-1' and focus_area in
          ('Agent roles and planning', 'Agentic architecture and workflows', 'Tool use and orchestration',
           'Evaluation and reliability', 'Everything was clear'))
        or (form_key = 'workshop-2' and focus_area in
          ('Building the agent workflow', 'Connecting tools and APIs', 'Testing and evaluating behavior',
           'Deploying and showcasing', 'I did not need more practice'))
      )
    )
  );

create or replace function public.submit_workshop_feedback_v2(p_form text, p_answers jsonb, p_request_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.feedback_forms%rowtype;
declare inserted_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if p_form not in ('workshop-1', 'workshop-2') then return 'unknown_form'; end if;
  if exists (select 1 from public.workshop_feedback_v2 where request_id = p_request_id) then
    return 'already_saved';
  end if;
  select * into f from public.feedback_forms where key = p_form for share;
  if not found then return 'unknown_form'; end if;
  if not f.enabled or now() < f.opens_at or (f.closes_at is not null and now() >= f.closes_at) then
    return 'unavailable';
  end if;
  insert into public.workshop_feedback_v2 (
    request_id, form_key, response_version, learning_helpfulness, outcome_confidence, focus_area,
    future_workshops, improvements, course_support, academic_year, course_suggestions
  ) values (
    p_request_id, p_form, 2, p_answers->>'learning_helpfulness',
    p_answers->>'outcome_confidence', p_answers->>'focus_area',
    p_answers->>'future_workshops', coalesce(p_answers->>'improvements', ''),
    p_answers->>'course_support', nullif(p_answers->>'academic_year', ''),
    coalesce(p_answers->>'course_suggestions', '')
  ) on conflict (request_id) do nothing returning request_id into inserted_id;
  if inserted_id is null then return 'already_saved'; end if;
  return 'saved';
end; $$;
revoke all on function public.submit_workshop_feedback_v2(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_workshop_feedback_v2(text, jsonb, uuid) to service_role;
notify pgrst, 'reload schema';
