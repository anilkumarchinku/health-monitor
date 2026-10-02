create extension if not exists pgcrypto;

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  dose_label text not null check (char_length(trim(dose_label)) between 1 and 100),
  schedule_time time without time zone not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  food_rule text not null check (food_rule in ('with_food', 'before_food', 'none')),
  notes text not null default '' check (char_length(notes) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists medicines_active_time_idx
  on public.medicines (active, schedule_time) where active = true;
create index if not exists medicines_user_id_idx on public.medicines (user_id);

create table if not exists public.medicine_doses (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null,
  user_id uuid not null,
  scheduled_date date not null,
  status text not null check (status in ('reminded', 'taken', 'skipped')),
  food_answer boolean,
  taken_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (medicine_id, scheduled_date),
  foreign key (medicine_id, user_id) references public.medicines(id, user_id) on delete cascade
);

create index if not exists medicine_doses_user_date_idx
  on public.medicine_doses (user_id, scheduled_date desc);

alter table public.medicines enable row level security;
alter table public.medicine_doses enable row level security;

revoke all on public.medicines, public.medicine_doses from anon, authenticated;
grant select, insert, update, delete on public.medicines, public.medicine_doses to authenticated;

create policy "Users read own medicines" on public.medicines
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own medicines" on public.medicines
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own medicines" on public.medicines
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own medicines" on public.medicines
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read own medicine doses" on public.medicine_doses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own medicine doses" on public.medicine_doses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own medicine doses" on public.medicine_doses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own medicine doses" on public.medicine_doses
  for delete to authenticated using ((select auth.uid()) = user_id);
