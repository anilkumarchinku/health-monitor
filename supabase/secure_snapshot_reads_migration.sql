drop policy if exists "Authenticated users can read health snapshots" on public.health_snapshots;

create policy "Authenticated users can read health snapshots"
  on public.health_snapshots
  for select
  to authenticated
  using (user_id = auth.uid());
