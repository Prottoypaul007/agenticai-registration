-- Run after 014. Custom mailbox records are private and independent of contest emails.
create table public.mailbox_messages (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  body text not null default '',
  audience text not null default 'selected' check (audience in ('selected', 'all')),
  recipient_refs jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'queued')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table public.mailbox_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.mailbox_messages(id) on delete cascade,
  source text not null check (source in ('outsider', 'batch14')),
  reference text not null,
  full_name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  sent_at timestamptz,
  error text,
  unique (message_id, source, reference)
);
create unique index mailbox_deliveries_message_email_idx on public.mailbox_deliveries (message_id, lower(email));
create index mailbox_deliveries_message_status_idx on public.mailbox_deliveries (message_id, status);
create index mailbox_messages_history_idx on public.mailbox_messages (created_at desc);
alter table public.mailbox_messages enable row level security;
alter table public.mailbox_deliveries enable row level security;
revoke all on public.mailbox_messages, public.mailbox_deliveries from anon, authenticated;

create or replace function public.admin_finalize_mailbox_message(
  p_admin_id uuid, p_message_id uuid, p_subject text, p_body text,
  p_audience text, p_recipients jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item jsonb;
  source_value text;
  reference_value text;
  participant_name text;
  participant_email text;
  seen_refs text[] := '{}';
  seen_emails text[] := '{}';
  eligible_count integer;
  message_status text;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  if nullif(btrim(p_subject), '') is null or length(p_subject) > 200 or
     nullif(btrim(p_body), '') is null or length(p_body) > 20000 or
     p_audience is null or p_audience not in ('selected', 'all') or jsonb_typeof(p_recipients) <> 'array' or
     jsonb_array_length(p_recipients) not between 1 and 2000 then
    return jsonb_build_object('error', 'invalid_message');
  end if;
  perform pg_advisory_xact_lock(hashtext('admin-mailbox'));
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  lock table public.registrations, public.batch14_registrations in share mode;
  select status into message_status from public.mailbox_messages where id = p_message_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if message_status <> 'draft' then return jsonb_build_object('error', 'already_finalized'); end if;

  for item in select value from jsonb_array_elements(p_recipients) loop
    source_value := item->>'source';
    reference_value := item->>'reference';
    if source_value not in ('outsider', 'batch14') or nullif(reference_value, '') is null or
       (source_value || ':' || reference_value) = any(seen_refs) then
      raise exception 'invalid_recipients';
    end if;
    participant_name := null;
    if source_value = 'outsider' then
      select full_name, email into participant_name, participant_email from public.registrations
        where reference = reference_value and registration_status <> 'rejected';
    else
      select full_name, email into participant_name, participant_email from public.batch14_registrations
        where reference = reference_value;
    end if;
    if participant_name is null or participant_email !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then
      raise exception 'roster_changed';
    end if;
    if lower(participant_email) = any(seen_emails) then
      raise exception 'duplicate_email';
    end if;
    seen_refs := array_append(seen_refs, source_value || ':' || reference_value);
    seen_emails := array_append(seen_emails, lower(participant_email));
    insert into public.mailbox_deliveries (message_id, source, reference, full_name, email)
      values (p_message_id, source_value, reference_value, participant_name, participant_email);
  end loop;
  if p_audience = 'all' then
    select (select count(*) from public.registrations where registration_status <> 'rejected') +
           (select count(*) from public.batch14_registrations) into eligible_count;
    if cardinality(seen_refs) <> eligible_count then
      -- An exception rolls back inserted deliveries and leaves the draft intact.
      raise exception 'roster_changed';
    end if;
  end if;
  update public.mailbox_messages set subject = btrim(p_subject), body = p_body,
    audience = p_audience, recipient_refs = p_recipients, status = 'queued',
    finalized_at = now(), updated_at = now() where id = p_message_id;
  return jsonb_build_object('queued', cardinality(seen_refs));
end; $$;
revoke all on function public.admin_finalize_mailbox_message(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_finalize_mailbox_message(uuid, uuid, text, text, text, jsonb) to service_role;

create or replace function public.admin_claim_mailbox_delivery(p_admin_id uuid, p_delivery_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare delivery public.mailbox_deliveries%rowtype; message public.mailbox_messages%rowtype;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  select * into delivery from public.mailbox_deliveries where id = p_delivery_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into message from public.mailbox_messages where id = delivery.message_id;
  if message.status <> 'queued' or delivery.status not in ('pending', 'failed') then
    return jsonb_build_object('error', 'already_claimed');
  end if;
  update public.mailbox_deliveries set status = 'sending', attempts = attempts + 1, error = null
    where id = p_delivery_id;
  return jsonb_build_object('id', delivery.id, 'email', delivery.email,
    'subject', message.subject, 'body', message.body);
end; $$;
revoke all on function public.admin_claim_mailbox_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_mailbox_delivery(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
