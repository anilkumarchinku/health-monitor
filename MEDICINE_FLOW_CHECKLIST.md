# Medicine flow checklist

## User flow

- [x] Meals and medicine have separate dashboard destinations and separate data tables.
- [x] Existing meal users see a three-step medicine guide with reduced-motion support.
- [x] User enters the medicine name, exact prescribed dose label, daily time, timezone, and label's food instruction.
- [x] User can edit or pause a medicine without changing meal history.
- [x] Medicine page shows today's taken/skipped checklist.
- [x] For a medicine marked **with food**, ask “Have you had a meal for this medicine?” before recording it as taken; accept and record either answer.
- [x] For **before food** and **no food requirement**, no meal question appears.
- [x] Show the meal log link when the user answers “Not yet”; avoid making dosing decisions for them.

## Reminder flow

- [x] Server cron uses active medicine schedules, each user's timezone, and a saved push subscription; it does not need the app to be open.
- [x] Push text is generic on the lock screen and opens the medicine checklist.
- [x] A dose already reminded, taken, or skipped is not pushed again that day.
- [x] If every push attempt fails, the reminder reservation is released so cron can retry within its reminder window.
- [x] Old meal snapshots do not prevent medicine reminders.

## Verification and release

- [x] TypeScript, lint, and production build pass.
- [x] Local cron integration test: 15-day-old meal snapshot, due medicine, one encrypted HTTPS push, duplicate prevented on second cron call.
- [x] Identify the production Supabase project: `avopjsfldiclrhardabs` (confirmed by the owner's dashboard screenshot and the deployed app's public configuration).
- [x] Check read-only production health: Auth returned HTTP 200 and `health_snapshots` was reachable before the migration.
- [x] Apply `supabase/migrations/20260928115906_medicine_schedule_and_doses.sql` to project `avopjsfldiclrhardabs` in the signed-in Supabase SQL Editor. The editor reported success, and both new tables are visible through the live REST schema.
- [x] Confirm anonymous REST reads of both medicine tables are denied with HTTP 401.
- [x] Confirm both tables have RLS enabled, four policies each, no anonymous SELECT grant, and authenticated SELECT grants in the production database.
- [ ] Verify RLS with two disposable users: each can manage only their own medicines and dose records.
- [ ] Deploy the app and confirm `CRON_SECRET`, VAPID keys, service-role key, and external cron-job.org schedule.
- [ ] On a test device, add a medicine for a few minutes ahead; enable push; close the app; confirm one notification and a successful taken/skipped log.
- [ ] Check with-food and before-food flows against the medicine's actual label with a pharmacist when instructions are unclear.

The production database migration is applied. The medicine feature remains local until the app is deployed and a real-device reminder flow is verified.
