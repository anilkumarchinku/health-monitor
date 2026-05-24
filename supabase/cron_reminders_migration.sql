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
