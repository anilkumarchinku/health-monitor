# Production release runbook

Prepared 2 October 2026. This is a release gate, not a deployment record. Production project: `avopjsfldiclrhardabs`. The user applied the additive database repair bundle; live API, access-control and storage checks passed. See `DATABASE_REPAIR_CHECKLIST.md` for the exact application record. The snapshot/push permission cutover and migration-history reconciliation remain pending; do not replay all migrations against this project.

## 1. Confirm target and backup

- Connect the account that owns the target project. The currently connected Supabase account lists other projects only.
- Inspect current schema/migration history first. Do not blindly replay manually applied SQL from the dashboard.
- Export an encrypted database backup and separately inventory/private-backup meal photos; a database dump does not contain Storage object bytes.
- Use a staging Supabase project and test accounts for isolation, concurrency and delivery tests. Record deployment SHA, database version, migration versions and rollback owner.

## 2. Database ordering

Existing deployments may already have the legacy SQL files. Verify their effects before any new changes. A fresh environment needs `supabase/schema.sql`, `auth_push_migration.sql`, `secure_snapshot_reads_migration.sql`, `cron_reminders_migration.sql`, `morning_reminders_migration.sql`, `rescheduled_reminders_migration.sql` and `meal_images_storage.sql` before the versioned migrations. Storage SQL expects Supabase's built-in storage schema; use a Supabase environment.

For a fresh database, apply versioned files from `supabase/migrations/` in timestamp order. For the existing production database, inspect and reconcile the manually applied repair bundle first; use only the verified remaining statements. The September medicine and email migrations must precede the October recovery/security migrations. Deploy the application only after all migrations succeed. New sync, subscription and email routes fail closed when the rate-limit RPC is unavailable.

- Verify RLS and grants as anonymous, user A, user B and service role. Anonymous access must fail; A must not read or mutate B's snapshots, medicines, doses, photos, subscriptions or logs.
- Verify direct authenticated writes to snapshots and push subscriptions fail; authenticated reads remain owner-scoped.
- Run simultaneous initial snapshot insert and stale-update requests; one wins, stale writes return 409, no data silently disappears.
- Run concurrent reminder/email claims, expired leases and guarded completions. No accepted recipient should be reclaimed.
- Review legacy rows before validating `health_snapshot_shape` (added NOT VALID). This constraint immediately checks new writes; it does not certify old rows.

## 3. Environment and schedulers

Use `.env.example` as the inventory, without committing actual secrets. Confirm VAPID keypair and subject, Supabase keys, admin allowlist, public URL and email settings. See `EMAIL_SETUP.md` for Resend setup.

Configure cron-job.org or the existing scheduler:

| Route | Schedule | Required header | Purpose |
| --- | --- | --- | --- |
| `/api/cron/send-reminders` | Every minute | `Authorization: Bearer <CRON_SECRET>` | Meals, sleep, Monday wake, medicine, snooze |
| `/api/cron/send-email` | Every minute when a campaign is active | Same header | Continue already-enqueued email |

Keep jobs enabled, turn on alerts for failed/missing executions, and confirm actual run history. HTTP 503 means incomplete/failed processing and requires attention. The notification doctor shows the most recent scheduler result; it does not replace an independent missing-run alert. Never trigger a broadcast as a smoke test.

### One-time push announcement

`POST /api/push/broadcast` now uses a durable campaign. The default is `health-monitor-back-live-2026-09`. Custom messages must specify a stable `campaignId`; continue with that ID rather than starting new campaigns. Each call enqueues up to 50 audience members and sends up to 10 due records. Check `audienceComplete`, `pending`, `failed` and `mayHaveMore`; wait at least 30 seconds before continuing. Accepted devices are not resent, but provider acceptance before a process crash can still yield a repeated push on recovery. Inspect earlier live campaign history before the first use of this new table because earlier untracked sends cannot be inferred.

## 4. Release verification

Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` in CI. Deploy staging, then run these authenticated journeys:

- Signup/sign-in → onboarding → profile → meal/photo → medicine → history → sign-out.
- Direct deep links on a second device and stale simultaneous saves.
- Offline save → reconnect/retry, including crossing local midnight and account switching.
- Morning answers as the first action of a new day.
- Medicine food-required prompt, no-food medicine, dose correction and local midnight refresh.
- Signed-out notification click; permission revoke/re-enable; Android and installed iPhone PWA with the app closed.
- Monday reminder at saved wake time for an inactive test account; no app visit required.
- Saved server snooze, meal logged before snooze expires, expired push endpoint and one failing device among multiple devices.
- Test email received in inbox, retry handling, unsubscribe confirmation, opt-out suppression and provider delivery status.

After staging passes, deploy the exact reviewed SHA. Verify `/medicines`, `/admin/email`, protected routes, security headers, and migrations on production. Observe one scheduler window and use owner-controlled test recipients before authorizing a real audience campaign.

## 5. Rollback and operating gates

The old app performs direct DB writes that this release revokes. Rolling back only the application can break saves/subscriptions. Prefer a forward fix; any emergency grant rollback must be explicitly reviewed because it restores validation bypasses. Avoid deleting delivery records or changing campaign IDs to force retries.

Remaining gates: Resend key/verified domain and SMTP, provider delivery webhooks, selected photo retention/account deletion/export policy, independent AWS S3 configuration if required, backup restore drill, measured load/queue capacity, regional DST gap policy, mobile/accessibility acceptance and spending alerts. Full-audience reminder scans still need a due-job queue before large-scale usage. Browser push acceptance cannot guarantee display or exactly-once delivery.

No paid plan upgrade or destructive retention cleanup is authorized by this runbook. Select budgets and retention periods with the owner, then verify them in the actual provider accounts.
