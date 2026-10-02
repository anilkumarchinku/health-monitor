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
