-- Keep the original survey and feedback tables for historical records.
-- New five-question workshop responses live in a separate anonymous table.
create table public.workshop_feedback_v2 (
  request_id uuid primary key,
  form_key text not null check (form_key in ('workshop-1', 'workshop-2')),
  learning_helpfulness text not null check (learning_helpfulness in
    ('Extremely helpful', 'Very helpful', 'Moderately helpful', 'Slightly helpful', 'Not helpful')),
  future_workshops text not null check (future_workshops in ('Yes', 'Maybe', 'No')),
  improvements text not null default '' check (length(improvements) <= 500),
  course_support text not null check (course_support in ('Yes', 'No', 'Not sure')),
  academic_year text check (academic_year in ('1st Year', '2nd Year', '3rd Year', '4th Year')),
  course_suggestions text not null default '' check (length(course_suggestions) <= 500),
  submitted_on date not null default (now() at time zone 'Asia/Dhaka')::date,
  constraint workshop_feedback_v2_conditional_year check (
    (course_support = 'Yes' and academic_year is not null) or
    (course_support <> 'Yes' and academic_year is null)
  ),
  constraint workshop_feedback_v2_anonymous_text check (
    improvements !~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(\+?88)?01[0-9]{9}|https?://[^[:space:]]+|<[^>]*>)'
    and course_suggestions !~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(\+?88)?01[0-9]{9}|https?://[^[:space:]]+|<[^>]*>)'
  )
);
create index workshop_feedback_v2_form_idx on public.workshop_feedback_v2 (form_key);
alter table public.workshop_feedback_v2 enable row level security;
revoke all on public.workshop_feedback_v2 from public, anon, authenticated;

-- The old public questionnaire is retired, while its responses remain intact.
update public.feedback_forms set enabled = false where key = 'pre-workshop';
-- Reset Workshop 1 to the requested 17 October opening after its earlier trial date.
update public.feedback_forms
set opens_at = '2026-10-17 00:00:00+06',
    closes_at = case when closes_at is not null and closes_at <= '2026-10-17 00:00:00+06'
      then null else closes_at end
where key = 'workshop-1';

create function public.submit_workshop_feedback_v2(p_form text, p_answers jsonb, p_request_id uuid)
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
    request_id, form_key, learning_helpfulness, future_workshops, improvements,
    course_support, academic_year, course_suggestions
  ) values (
    p_request_id, p_form, p_answers->>'learning_helpfulness', p_answers->>'future_workshops',
    coalesce(p_answers->>'improvements', ''), p_answers->>'course_support',
    nullif(p_answers->>'academic_year', ''), coalesce(p_answers->>'course_suggestions', '')
  ) on conflict (request_id) do nothing returning request_id into inserted_id;
  if inserted_id is null then return 'already_saved'; end if;
  return 'saved';
end; $$;
revoke all on function public.submit_workshop_feedback_v2(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_workshop_feedback_v2(text, jsonb, uuid) to service_role;
notify pgrst, 'reload schema';
