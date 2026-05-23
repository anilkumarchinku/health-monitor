alter table public.reminder_deliveries
  drop constraint if exists reminder_deliveries_kind_check;

alter table public.reminder_deliveries
  add constraint reminder_deliveries_kind_check
  check (kind in ('morning', 'breakfast', 'lunch', 'dinner', 'sleep'));
