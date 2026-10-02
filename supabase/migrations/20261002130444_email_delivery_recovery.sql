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
