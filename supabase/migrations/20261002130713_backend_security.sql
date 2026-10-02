-- Apply before deploying the server rate limits and versioned snapshot writer.
-- Writes now pass through authenticated server handlers; direct reads remain owner-scoped.
alter table public.health_snapshots enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.health_snapshots, public.push_subscriptions from anon, authenticated;
grant select on public.health_snapshots, public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.health_snapshots, public.push_subscriptions to service_role;

drop policy if exists "Authenticated users can read health snapshots" on public.health_snapshots;
create policy "Authenticated users can read health snapshots" on public.health_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Authenticated users can insert own health snapshots" on public.health_snapshots;
drop policy if exists "Authenticated users can update own health snapshots" on public.health_snapshots;
drop policy if exists "Users can manage their own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- NOT VALID preserves legacy rows for a reviewed backfill, but enforces every new write.
alter table public.health_snapshots add constraint health_snapshot_shape check (
  user_id is not null and jsonb_typeof(profile) = 'object' and jsonb_typeof(sleep) = 'object'
  and jsonb_typeof(meals) = 'array' and jsonb_typeof(payload) = 'object'
  and case when jsonb_typeof(meals) = 'array' then jsonb_array_length(meals) <= 3 else false end
  and water between 0 and 100000 and quote_index >= 0
  and octet_length(payload::text) <= 131072
) not valid;

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
