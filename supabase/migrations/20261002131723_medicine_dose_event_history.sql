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
