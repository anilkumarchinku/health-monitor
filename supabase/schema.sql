create extension if not exists pgcrypto;

create table if not exists public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  client_id text not null,
  date date not null,
  profile jsonb not null default '{}'::jsonb,
  meals jsonb not null default '[]'::jsonb,
  water integer not null default 0,
  sleep jsonb not null default '{}'::jsonb,
  sleep_check_completed boolean not null default false,
  quote_index integer not null default 0,
  quote_feedback text,
  onboarding_completed boolean not null default true,
  notification_preference text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, date),
  unique (client_id, date)
);

create index if not exists health_snapshots_client_date_idx
  on public.health_snapshots (client_id, date desc);

create index if not exists health_snapshots_user_date_idx
  on public.health_snapshots (user_id, date desc);

create index if not exists health_snapshots_updated_at_idx
  on public.health_snapshots (updated_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.health_snapshots enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Demo users can insert health snapshots" on public.health_snapshots;
drop policy if exists "Demo users can read health snapshots" on public.health_snapshots;
drop policy if exists "Demo users can update health snapshots" on public.health_snapshots;
drop policy if exists "Authenticated users can insert own health snapshots" on public.health_snapshots;
drop policy if exists "Authenticated users can update own health snapshots" on public.health_snapshots;
drop policy if exists "Authenticated users can read health snapshots" on public.health_snapshots;
drop policy if exists "Users can manage their own push subscriptions" on public.push_subscriptions;

create policy "Authenticated users can insert own health snapshots"
  on public.health_snapshots
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Authenticated users can update own health snapshots"
  on public.health_snapshots
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Authenticated users can read health snapshots"
  on public.health_snapshots
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('morning', 'breakfast', 'lunch', 'dinner', 'sleep')),
  reminder_key text not null default '',
  delivered_at timestamptz not null default now(),
  unique (user_id, date, reminder_key)
);

create index if not exists reminder_deliveries_user_date_idx
  on public.reminder_deliveries (user_id, date desc);

alter table public.reminder_deliveries enable row level security;

drop policy if exists "Users can read their own reminder deliveries" on public.reminder_deliveries;

create policy "Users can read their own reminder deliveries"
  on public.reminder_deliveries
  for select
  to authenticated
  using (user_id = auth.uid());
