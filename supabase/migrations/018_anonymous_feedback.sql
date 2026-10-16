-- Anonymous answers are deliberately independent of registration and auth tables.
create table public.feedback_forms (
  key text primary key check (key in ('pre-workshop', 'workshop-1', 'workshop-2')),
  opens_at timestamptz not null,
  closes_at timestamptz,
  enabled boolean not null default true,
  constraint feedback_window check (closes_at is null or closes_at > opens_at)
);
insert into public.feedback_forms (key, opens_at) values
  ('pre-workshop', '2026-10-01 00:00:00+06'),
  ('workshop-1', '2026-10-17 00:00:00+06'),
  ('workshop-2', '2026-10-18 00:00:00+06');

create function public.valid_feedback_choices(p_choices text[], p_allowed text[], p_none text)
returns boolean language sql immutable as $$
  select p_choices is not null and cardinality(p_choices) between 1 and cardinality(p_allowed)
    and p_choices <@ p_allowed
    and (not p_none = any(p_choices) or cardinality(p_choices) = 1)
    and (select count(distinct choice) = count(*) from unnest(p_choices) choice)
$$;

create table public.background_survey_responses (
  academic_discipline text not null check (academic_discipline in ('Software Engineering','Computer Science','Computer Science and Engineering','Other Engineering Discipline','Other','Prefer not to say')),
  software_credits text not null check (software_credits in ('Below 10 credits','10–19 credits','20–29 credits','30 credits or more','Not sure')),
  ai_use_frequency text not null check (ai_use_frequency in ('Never','Rarely','Sometimes','Frequently','Daily')),
  ai_tools text[] not null check (public.valid_feedback_choices(ai_tools,
    array['ChatGPT','Claude','Gemini','GitHub Copilot','Cursor','Other AI tools','I have not used any AI tools'],
    'I have not used any AI tools')),
  ai_activities text[] not null check (public.valid_feedback_choices(ai_activities,
    array['Learning or understanding programming concepts','Code generation','Debugging','Software testing','Documentation','Software architecture or design','Research and problem-solving','Other','I have not used AI tools'],
    'I have not used AI tools')),
  ai_coursework text not null check (ai_coursework in ('Yes','Currently enrolled','No','Not sure')),
  agentic_coursework text not null check (agentic_coursework in ('Yes','Currently enrolled','No','Not sure')),
  agentic_familiarity smallint not null check (agentic_familiarity between 1 and 5),
  submitted_on date not null default (now() at time zone 'Asia/Dhaka')::date
);
create table public.workshop_feedback_responses (
  form_key text not null check (form_key in ('workshop-1','workshop-2')),
  overall_quality smallint not null check (overall_quality between 1 and 5),
  clarity smallint not null check (clarity between 1 and 5),
  relevance smallint not null check (relevance between 1 and 5),
  examples smallint not null check (examples between 1 and 5),
  confidence smallint not null check (confidence between 1 and 5),
  pacing text not null check (pacing in ('Too slow','Appropriate','Too fast')),
  most_valuable text not null default '' check (length(most_valuable) <= 1000),
  improvements text not null default '' check (length(improvements) <= 1000),
  submitted_on date not null default (now() at time zone 'Asia/Dhaka')::date
);
create index workshop_feedback_form_idx on public.workshop_feedback_responses (form_key);
alter table public.feedback_forms enable row level security;
alter table public.background_survey_responses enable row level security;
alter table public.workshop_feedback_responses enable row level security;
revoke all on public.feedback_forms, public.background_survey_responses, public.workshop_feedback_responses from public, anon, authenticated;

create or replace function public.submit_anonymous_feedback(p_form text, p_answers jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.feedback_forms%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into f from public.feedback_forms where key = p_form for share;
  if not found then return 'unknown_form'; end if;
  if not f.enabled or now() < f.opens_at or (f.closes_at is not null and now() >= f.closes_at) then return 'unavailable'; end if;
  if p_form = 'pre-workshop' then
    insert into public.background_survey_responses
      (academic_discipline, software_credits, ai_use_frequency, ai_tools, ai_activities, ai_coursework, agentic_coursework, agentic_familiarity)
    values (p_answers->>'academic_discipline', p_answers->>'software_credits', p_answers->>'ai_use_frequency',
      array(select jsonb_array_elements_text(p_answers->'ai_tools')),
      array(select jsonb_array_elements_text(p_answers->'ai_activities')),
      p_answers->>'ai_coursework', p_answers->>'agentic_coursework', (p_answers->>'agentic_familiarity')::smallint);
  else
    insert into public.workshop_feedback_responses
      (form_key, overall_quality, clarity, relevance, examples, confidence, pacing, most_valuable, improvements)
    values (p_form, (p_answers->>'overall_quality')::smallint, (p_answers->>'clarity')::smallint,
      (p_answers->>'relevance')::smallint, (p_answers->>'examples')::smallint, (p_answers->>'confidence')::smallint,
      p_answers->>'pacing', coalesce(p_answers->>'most_valuable',''), coalesce(p_answers->>'improvements',''));
  end if;
  return 'saved';
end; $$;
revoke all on function public.submit_anonymous_feedback(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_anonymous_feedback(text, jsonb) to service_role;
notify pgrst, 'reload schema';
