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
