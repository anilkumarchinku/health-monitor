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
