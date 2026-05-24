alter table public.reminder_deliveries
  add column if not exists reminder_key text;

update public.reminder_deliveries
set reminder_key = kind
where reminder_key is null or reminder_key = '';

alter table public.reminder_deliveries
  alter column reminder_key set default '',
  alter column reminder_key set not null;

alter table public.reminder_deliveries
  drop constraint if exists reminder_deliveries_user_id_date_kind_key;

create unique index if not exists reminder_deliveries_user_date_key_idx
  on public.reminder_deliveries (user_id, date, reminder_key);
