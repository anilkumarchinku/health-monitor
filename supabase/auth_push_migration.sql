alter table public.health_snapshots
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'health_snapshots_user_id_date_key'
  ) then
    alter table public.health_snapshots
      add constraint health_snapshots_user_id_date_key unique (user_id, date);
  end if;
end $$;

create index if not exists health_snapshots_user_date_idx
  on public.health_snapshots (user_id, date desc);

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

drop policy if exists "Authenticated users can insert own health snapshots" on public.health_snapshots;
drop policy if exists "Authenticated users can update own health snapshots" on public.health_snapshots;
drop policy if exists "Authenticated users can read health snapshots" on public.health_snapshots;
drop policy if exists "Demo users can insert health snapshots" on public.health_snapshots;
drop policy if exists "Demo users can read health snapshots" on public.health_snapshots;
drop policy if exists "Demo users can update health snapshots" on public.health_snapshots;
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
  using (true);

create policy "Users can manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
