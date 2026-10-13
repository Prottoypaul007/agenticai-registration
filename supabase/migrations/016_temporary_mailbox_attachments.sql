-- Run after 015. Uploaded files are private and temporary; only metadata remains in mailbox history.
insert into storage.buckets (id, name, public, file_size_limit)
values ('mailbox-temp', 'mailbox-temp', false, 10485760)
on conflict (id) do nothing;

alter table public.mailbox_messages
  add column attachments jsonb not null default '[]'::jsonb,
  add column attachment_expires_at timestamptz,
  add column attachments_cleaned_at timestamptz;

alter table public.mailbox_deliveries drop constraint if exists mailbox_deliveries_status_check;
alter table public.mailbox_deliveries add constraint mailbox_deliveries_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'expired'));
create index mailbox_messages_attachment_cleanup_idx on public.mailbox_messages (attachment_expires_at)
  where attachment_expires_at is not null and attachments_cleaned_at is null;

create or replace function public.admin_finalize_mailbox_message(
  p_admin_id uuid, p_message_id uuid, p_subject text, p_body text,
  p_audience text, p_recipients jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item jsonb;
  attachment jsonb;
  source_value text;
  reference_value text;
  participant_name text;
  participant_email text;
  seen_refs text[] := '{}';
  seen_emails text[] := '{}';
  eligible_count integer;
  message_record public.mailbox_messages%rowtype;
begin
  if auth.role() <> 'service_role' or not exists (select 1 from public.admins where user_id = p_admin_id) then
    raise exception 'forbidden';
  end if;
  if nullif(btrim(p_subject), '') is null or length(p_subject) > 200 or
     p_body is null or length(p_body) > 20000 or
     p_audience is null or p_audience not in ('selected', 'all') or jsonb_typeof(p_recipients) <> 'array' or
     jsonb_array_length(p_recipients) not between 1 and 2000 then
    return jsonb_build_object('error', 'invalid_message');
  end if;
  perform pg_advisory_xact_lock(hashtext('admin-mailbox'));
  perform pg_advisory_xact_lock(hashtext('workshop-registration'));
  lock table public.registrations, public.batch14_registrations in share mode;
  select * into message_record from public.mailbox_messages where id = p_message_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if message_record.status <> 'draft' then return jsonb_build_object('error', 'already_finalized'); end if;
  if nullif(btrim(p_body), '') is null and jsonb_array_length(message_record.attachments) = 0 then
    return jsonb_build_object('error', 'empty_message');
  end if;
  for attachment in select value from jsonb_array_elements(message_record.attachments) loop
    if attachment->>'status' <> 'ready' or nullif(attachment->>'path', '') is null or
       coalesce((attachment->>'size')::integer, 0) < 1 then
      return jsonb_build_object('error', 'attachments_not_ready');
    end if;
  end loop;
  if jsonb_array_length(message_record.attachments) > 0 and
     (message_record.attachment_expires_at is null or message_record.attachment_expires_at <= now()) then
    return jsonb_build_object('error', 'attachments_expired');
  end if;

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
    if lower(participant_email) = any(seen_emails) then raise exception 'duplicate_email'; end if;
    seen_refs := array_append(seen_refs, source_value || ':' || reference_value);
    seen_emails := array_append(seen_emails, lower(participant_email));
    insert into public.mailbox_deliveries (message_id, source, reference, full_name, email)
      values (p_message_id, source_value, reference_value, participant_name, participant_email);
  end loop;
  if p_audience = 'all' then
    select (select count(*) from public.registrations where registration_status <> 'rejected') +
           (select count(*) from public.batch14_registrations) into eligible_count;
    if cardinality(seen_refs) <> eligible_count then raise exception 'roster_changed'; end if;
  end if;
  update public.mailbox_messages set subject = btrim(p_subject), body = p_body,
    audience = p_audience, recipient_refs = p_recipients, status = 'queued',
    attachment_expires_at = case when jsonb_array_length(message_record.attachments) > 0
      then now() + interval '7 days' else null end,
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
  if jsonb_array_length(message.attachments) > 0 and
     (message.attachments_cleaned_at is not null or message.attachment_expires_at <= now()) then
    return jsonb_build_object('error', 'attachments_expired');
  end if;
  update public.mailbox_deliveries set status = 'sending', attempts = attempts + 1, error = null
    where id = p_delivery_id;
  return jsonb_build_object('id', delivery.id, 'message_id', message.id, 'email', delivery.email,
    'subject', message.subject, 'body', message.body, 'attachments', message.attachments);
end; $$;
revoke all on function public.admin_claim_mailbox_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_mailbox_delivery(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
