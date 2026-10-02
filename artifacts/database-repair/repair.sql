-- Health Monitor: additive database repair, prepared 2026-10-02.
-- Target project: avopjsfldiclrhardabs ONLY. Run the ENTIRE file once in SQL Editor.
-- Existing health records and snapshot/push write permissions are preserved.
-- No messages are enqueued or sent. The bucket remains private.
-- This is an operational bundle assembled from the existing reviewed migrations,
-- NOT a replacement for their migration history. See DATABASE_REPAIR_CHECKLIST.md.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE name text;
BEGIN
  IF to_regclass('public.health_snapshots') IS NULL OR to_regclass('public.medicines') IS NULL
    OR to_regclass('public.medicine_doses') IS NULL OR to_regclass('public.push_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'Wrong database or missing prerequisite tables; no repair applied';
  END IF;
  FOREACH name IN ARRAY ARRAY['server_rate_limits','email_announcement_opt_outs','email_announcement_deliveries','email_campaigns','device_reminder_deliveries','reminder_scheduler_runs','reminder_snoozes','push_broadcast_campaigns','push_broadcast_deliveries','medicine_dose_events'] LOOP
    IF to_regclass('public.' || name) IS NOT NULL THEN
      RAISE EXCEPTION 'Table % already exists. Stop and reconcile applied changes before rerunning.', name;
    END IF;
  END LOOP;
END;
$preflight$;


-- Only the additive rate-limiter portion; permission cutover is deferred.
create table public.server_rate_limits (
  key text primary key check (char_length(key) between 1 and 200),
  window_started_at timestamptz not null,
  hits integer not null check (hits > 0)
);
alter table public.server_rate_limits enable row level security;
revoke all on public.server_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.server_rate_limits to service_role;

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_hits integer; current_time_at timestamptz := clock_timestamp();
begin
  if p_limit < 1 or p_limit > 100000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit';
  end if;
  insert into public.server_rate_limits as limits (key, window_started_at, hits)
  values (p_key, current_time_at, 1)
  on conflict (key) do update set
    hits = case when limits.window_started_at + make_interval(secs => p_window_seconds) <= current_time_at
      then 1 else least(limits.hits + 1, p_limit + 1) end,
    window_started_at = case when limits.window_started_at + make_interval(secs => p_window_seconds) <= current_time_at
      then current_time_at else limits.window_started_at end
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;


-- Source: supabase/migrations/20260930000000_email_announcements.sql
create table if not exists public.email_announcement_opt_outs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.email_announcement_deliveries (
  campaign_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  status text not null check (status in ('pending', 'accepted', 'failed')),
  provider_id text,
  error text,
  updated_at timestamptz not null default now(),
  primary key (campaign_key, user_id)
);

create index if not exists email_announcement_deliveries_status_idx
  on public.email_announcement_deliveries (campaign_key, status);

alter table public.email_announcement_opt_outs enable row level security;
alter table public.email_announcement_deliveries enable row level security;
revoke all on public.email_announcement_opt_outs, public.email_announcement_deliveries from anon, authenticated;

create policy "Read own announcement opt out" on public.email_announcement_opt_outs
  for select to authenticated using ((select auth.uid()) = user_id);


-- Source: supabase/migrations/20261002130444_email_delivery_recovery.sql
alter table public.email_announcement_deliveries
  drop constraint if exists email_announcement_deliveries_status_check;
alter table public.email_announcement_deliveries
  add constraint email_announcement_deliveries_status_check check (status in ('pending','accepted','failed','review','cancelled')),
  add column if not exists attempts integer not null default 0,
  add column if not exists first_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists lease_until timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists request_payload jsonb;
-- Earlier attempts have no immutable request to replay. Reconcile them in Resend first.
update public.email_announcement_deliveries set status = 'review',
  error = 'Legacy attempt requires provider reconciliation before retry.'
  where status in ('pending','failed') and request_payload is null;

create table if not exists public.email_campaigns (
  campaign_key text primary key,
  enqueued_at timestamptz not null default now()
);
alter table public.email_campaigns enable row level security;
revoke all on public.email_campaigns from public, anon, authenticated;
grant all on public.email_campaigns, public.email_announcement_deliveries, public.email_announcement_opt_outs to service_role;

create or replace function public.enqueue_email_campaign(p_campaign_key text)
returns integer language plpgsql security definer set search_path = '' as $$
declare added integer;
begin
  insert into public.email_campaigns(campaign_key) values(p_campaign_key) on conflict do nothing;
  if not found then return 0; end if;
  insert into public.email_announcement_deliveries(campaign_key,user_id,recipient_email,status)
  select p_campaign_key,u.id,u.email,'pending' from auth.users u
  where u.email is not null and u.email_confirmed_at is not null
    and not exists(select 1 from public.email_announcement_opt_outs o where o.user_id=u.id)
  on conflict do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.enqueue_email_campaign(text) from public, anon, authenticated;
grant execute on function public.enqueue_email_campaign(text) to service_role;

create or replace function public.claim_email_delivery(p_campaign_key text,p_user_id uuid,p_lease_token uuid,p_payload jsonb)
returns setof public.email_announcement_deliveries language sql security invoker set search_path = '' as $$
  update public.email_announcement_deliveries set
    status='pending', attempts=attempts+1, first_attempt_at=coalesce(first_attempt_at,now()),
    lease_until=now()+interval '90 seconds',lease_token=p_lease_token,
    request_payload=coalesce(request_payload,p_payload),updated_at=now()
  where campaign_key=p_campaign_key and user_id=p_user_id and status in ('pending','failed')
    and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now())
    and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
  returning *;
$$;
revoke all on function public.claim_email_delivery(text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.claim_email_delivery(text,uuid,uuid,jsonb) to service_role;
create index if not exists email_delivery_due_idx on public.email_announcement_deliveries(campaign_key,next_attempt_at)
where status in ('pending','failed');


-- Source: supabase/migrations/20261002130510_device_reminder_recovery.sql
-- Delivery records are separate from users' medicine adherence records.
create table public.device_reminder_deliveries (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_key text not null,
  status text not null check (status in ('sending','retry','accepted')),
  lease_token uuid not null,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 1,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (subscription_id, reminder_key)
);
create index device_reminder_deliveries_updated_idx on public.device_reminder_deliveries(updated_at);
alter table public.device_reminder_deliveries enable row level security;
revoke all on public.device_reminder_deliveries from anon, authenticated;
grant select on public.device_reminder_deliveries to authenticated;
create policy "Read own device deliveries" on public.device_reminder_deliveries for select to authenticated using ((select auth.uid()) = user_id);

create function public.claim_device_reminder(p_user_id uuid, p_subscription_id uuid, p_reminder_key text, p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.push_subscriptions where id = p_subscription_id and user_id = p_user_id) then
    raise exception 'Subscription ownership mismatch';
  end if;
  insert into public.device_reminder_deliveries (subscription_id,user_id,reminder_key,status,lease_token,lease_until)
  values (p_subscription_id,p_user_id,p_reminder_key,'sending',p_token,now()+interval '2 minutes')
  on conflict (subscription_id,reminder_key) do update
  set status='sending', lease_token=p_token, lease_until=now()+interval '2 minutes',
      attempts=public.device_reminder_deliveries.attempts+1, updated_at=now()
  where (public.device_reminder_deliveries.status='retry' and public.device_reminder_deliveries.next_attempt_at <= now())
     or (public.device_reminder_deliveries.status='sending' and public.device_reminder_deliveries.lease_until < now());
  return found;
end;
$$;
revoke all on function public.claim_device_reminder(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_device_reminder(uuid,uuid,text,uuid) to service_role;
grant all on public.device_reminder_deliveries to service_role;

create table public.reminder_scheduler_runs (
  id uuid primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','complete','failed')),
  accepted integer not null default 0,
  error text
);
create index reminder_scheduler_runs_started_idx on public.reminder_scheduler_runs(started_at desc);
alter table public.reminder_scheduler_runs enable row level security;
revoke all on public.reminder_scheduler_runs from anon,authenticated;
grant all on public.reminder_scheduler_runs to service_role;

create table public.reminder_snoozes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner')),
  due_at timestamptz not null,
  unique(user_id,meal_type)
);
alter table public.reminder_snoozes enable row level security;
revoke all on public.reminder_snoozes from anon,authenticated;
grant all on public.reminder_snoozes to service_role;
create index reminder_snoozes_due_idx on public.reminder_snoozes(due_at);

-- One indexed latest-row lookup per user inside a single bounded database call.
create function public.latest_reminder_snapshots(p_user_ids uuid[])
returns table(user_id uuid, date date, profile jsonb, meals jsonb, quote_index integer) language sql stable security invoker set search_path = '' as $$
  select s.user_id, s.date, s.profile, s.meals, s.quote_index from unnest(p_user_ids) u(user_id)
  cross join lateral (select * from public.health_snapshots h where h.user_id=u.user_id order by date desc limit 1) s;
$$;
revoke all on function public.latest_reminder_snapshots(uuid[]) from public,anon,authenticated;
grant execute on function public.latest_reminder_snapshots(uuid[]) to service_role;


-- Source: supabase/migrations/20261002131717_push_broadcast_campaigns.sql
create table public.push_broadcast_campaigns (
  id text primary key check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  audience_cursor uuid,
  audience_complete boolean not null default false
);
create table public.push_broadcast_deliveries (
  campaign_id text not null references public.push_broadcast_campaigns(id) on delete cascade,
  subscription_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','retry','accepted','stale','failed')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(campaign_id,subscription_id)
);
create index push_broadcast_deliveries_due_idx on public.push_broadcast_deliveries(campaign_id,status,next_attempt_at);
alter table public.push_broadcast_campaigns enable row level security;
alter table public.push_broadcast_deliveries enable row level security;
revoke all on public.push_broadcast_campaigns,public.push_broadcast_deliveries from anon,authenticated;
grant all on public.push_broadcast_campaigns,public.push_broadcast_deliveries to service_role;

-- Lock the cursor so simultaneous continuation requests cannot skip an audience page.
create function public.enqueue_push_broadcast(p_campaign_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare campaign public.push_broadcast_campaigns; device record; added integer:=0; last_id uuid;
begin
  select * into strict campaign from public.push_broadcast_campaigns where id=p_campaign_id for update;
  if campaign.audience_complete then return true; end if;
  for device in select id,user_id from public.push_subscriptions
    where (campaign.audience_cursor is null or id>campaign.audience_cursor) and created_at<=campaign.created_at
    order by id limit 50
  loop
    insert into public.push_broadcast_deliveries(campaign_id,subscription_id,user_id)
      values(p_campaign_id,device.id,device.user_id) on conflict do nothing;
    added:=added+1; last_id:=device.id;
  end loop;
  update public.push_broadcast_campaigns set audience_cursor=coalesce(last_id,audience_cursor),audience_complete=(added<50) where id=p_campaign_id;
  return added<50;
end;
$$;

create function public.claim_push_broadcast(p_campaign_id text,p_token uuid)
returns table(subscription_id uuid,subscription jsonb,attempts integer)
language plpgsql security invoker set search_path='' as $$
begin
  update public.push_broadcast_deliveries d set status='failed',last_error='Attempt budget exhausted; review before starting another campaign.'
    where d.campaign_id=p_campaign_id and d.attempts>=5 and d.status in ('retry','sending') and (d.lease_until is null or d.lease_until<now());
  update public.push_broadcast_deliveries d set status='stale',lease_until=null,lease_token=null
    where d.campaign_id=p_campaign_id and d.status in ('pending','retry','sending')
      and (d.lease_until is null or d.lease_until<now())
      and not exists(select 1 from public.push_subscriptions s where s.id=d.subscription_id);
  return query
    with candidates as (
      select d.subscription_id from public.push_broadcast_deliveries d
      where d.campaign_id=p_campaign_id and d.attempts<5
        and ((d.status in ('pending','retry') and d.next_attempt_at<=now()) or (d.status='sending' and d.lease_until<now()))
      order by d.next_attempt_at,d.subscription_id limit 10 for update skip locked
    ), claimed as (
      update public.push_broadcast_deliveries d set status='sending',attempts=d.attempts+1,lease_token=p_token,lease_until=now()+interval '2 minutes',updated_at=now()
      from candidates c where d.campaign_id=p_campaign_id and d.subscription_id=c.subscription_id
      returning d.subscription_id,d.attempts
    )
    select c.subscription_id,s.subscription,c.attempts from claimed c join public.push_subscriptions s on s.id=c.subscription_id;
end;
$$;
revoke all on function public.enqueue_push_broadcast(text),public.claim_push_broadcast(text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_push_broadcast(text),public.claim_push_broadcast(text,uuid) to service_role;

create function public.protect_push_broadcast_payload()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id or new.payload is distinct from old.payload or new.created_at is distinct from old.created_at then
    raise exception 'Campaign identity, message and audience cutoff are immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_push_broadcast_payload() from public,anon,authenticated;
create trigger protect_push_broadcast_payload before update on public.push_broadcast_campaigns
  for each row execute function public.protect_push_broadcast_payload();
grant execute on function public.protect_push_broadcast_payload() to service_role;


-- Source: supabase/migrations/20261002131723_medicine_dose_event_history.sql
grant select, insert, update, delete on public.medicines, public.medicine_doses to service_role;

-- Server-owned audit events. Clients may read only their own history, never edit it.
create schema if not exists medicine_audit_private;
revoke all on schema medicine_audit_private from public, anon, authenticated;

create table if not exists public.medicine_dose_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dose_id uuid not null,
  medicine_id uuid not null,
  medicine_name text not null,
  scheduled_date date not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  previous_value jsonb,
  next_value jsonb,
  actor_user_id uuid,
  recorded_at timestamptz not null default clock_timestamp()
);
-- Keep events when an individual dose/medicine is removed. Account deletion cascades
-- from auth.users to remove the user's entire audit history for privacy.
create index if not exists medicine_dose_events_user_recorded_idx
  on public.medicine_dose_events(user_id, recorded_at desc);
alter table public.medicine_dose_events enable row level security;
revoke all on public.medicine_dose_events from public, anon, authenticated;
grant select on public.medicine_dose_events to authenticated;
grant select, insert, update, delete on public.medicine_dose_events to service_role;
create policy "Users read own medicine event history" on public.medicine_dose_events
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function medicine_audit_private.record_medicine_dose_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_dose_id uuid;
  target_medicine_id uuid;
  target_date date;
  medicine_label text;
  before_value jsonb;
  after_value jsonb;
begin
  if tg_op = 'UPDATE' and
    row(old.status, old.food_answer, old.taken_at, old.scheduled_date, old.medicine_id, old.user_id)
      is not distinct from
    row(new.status, new.food_answer, new.taken_at, new.scheduled_date, new.medicine_id, new.user_id) then
    return new;
  end if;

  if tg_op = 'DELETE' then
    owner_id := old.user_id;
    target_dose_id := old.id;
    target_medicine_id := old.medicine_id;
    target_date := old.scheduled_date;
  else
    owner_id := new.user_id;
    target_dose_id := new.id;
    target_medicine_id := new.medicine_id;
    target_date := new.scheduled_date;
  end if;
  -- Trigger can also run for trusted server cron with no end-user JWT.
  if auth.uid() is not null and auth.uid() <> owner_id then
    raise exception 'Medicine event owner mismatch' using errcode = '42501';
  end if;
  -- Do not recreate audit records while the parent account is being deleted.
  if not exists (select 1 from auth.users where id = owner_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select name into medicine_label from public.medicines
    where id = target_medicine_id and user_id = owner_id;
  if tg_op in ('UPDATE', 'DELETE') then
    before_value := jsonb_build_object('status', old.status, 'food_answer', old.food_answer,
      'taken_at', old.taken_at, 'scheduled_date', old.scheduled_date, 'medicine_id', old.medicine_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    after_value := jsonb_build_object('status', new.status, 'food_answer', new.food_answer,
      'taken_at', new.taken_at, 'scheduled_date', new.scheduled_date, 'medicine_id', new.medicine_id);
  end if;
  insert into public.medicine_dose_events
    (user_id, dose_id, medicine_id, medicine_name, scheduled_date, operation, previous_value, next_value, actor_user_id)
  values (owner_id, target_dose_id, target_medicine_id, coalesce(medicine_label, 'Removed medicine'),
    target_date, tg_op, before_value, after_value, auth.uid());
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function medicine_audit_private.record_medicine_dose_event() from public, anon, authenticated;
drop trigger if exists record_medicine_dose_event on public.medicine_doses;
create trigger record_medicine_dose_event
  after insert or update or delete on public.medicine_doses
  for each row execute function medicine_audit_private.record_medicine_dose_event();


-- Source: supabase/meal_images_storage.sql
-- Run this in the Supabase SQL editor before using meal photo capture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-images', 'meal-images', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own meal images" on storage.objects;
create policy "Users upload own meal images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meal-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users read own meal images" on storage.objects;
create policy "Users read own meal images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meal-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );


NOTIFY pgrst, 'reload schema';
COMMIT;

select c.relname as table_name, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('server_rate_limits','email_announcement_opt_outs','email_announcement_deliveries','email_campaigns','device_reminder_deliveries','reminder_scheduler_runs','reminder_snoozes','push_broadcast_campaigns','push_broadcast_deliveries','medicine_dose_events') order by c.relname;
