# Health Monitor production remediation checklist

Started 2 October 2026. A checked item means the described implementation and its stated local check are complete. Production verification has separate entries and is not implied by a local pass.

## Data integrity and security

- [x] Make History read-only and hydrate Profile, Morning and Meal deep links from the correct account.
- [x] Preserve next-day Morning completion and feedback; validate profile settings.
- [x] Add atomic snapshot conflict detection and remove validation-bypassing DB fallback.
- [x] Restrict push destinations, bound outbound timeouts, rate-limit sends and fix endpoint ownership races.
- [x] Correct unsafe legacy RLS and prepare constraints/grants migration.
- [x] Paginate admin monitoring and bound image URL signing.

## Delivery and user flows

- [x] Add recoverable per-device reminder claims, truthful failure results and scheduler heartbeat.
- [x] Reduce repeated full-audience snapshot queries and define midnight catch-up.
- [x] Persist snoozes and cancel obsolete local timers without duplicate server reminders.
- [x] Recover email failures with stable payload/idempotency, leases, bounded retries and explicit review state.
- [x] Make unsubscribe GET read-only and use dedicated versioned signing secrets.
- [x] Improve sync error feedback and medicine day refresh/correction.

- [x] Add durable push campaign identity, per-device outcomes and bounded continuation.
- [x] Preserve medicine correction events in an immutable client-readable history.
- [x] Protect pending edits across midnight, async account switches and image upload races.
- [x] Add baseline anti-framing, MIME and CSP restrictions (not a full nonce-based script CSP).

## Verification and release

- [x] Add regression tests and CI for data integrity, delivery and security boundaries.
- [x] Pass regression tests, lint, type checks and production build.
- [x] Review graph impact/change analysis and preserve existing work (coverage limits below).
- [ ] Apply/verify migrations on the correct Supabase project and test two-account isolation.
- [ ] Deploy reviewed application and verify medicines/email production routes.
- [ ] Configure Resend key/domain, Auth SMTP, scheduler headers and production alerts.
- [ ] Verify real Android/iPhone PWA push, inbox receipt and authenticated E2E journeys.
- [ ] Establish storage cleanup/retention, restore drill and measured spending limits.

## External prerequisites

Resend API key and verified sender domain remain pending from the owner. Production Supabase access must target `avopjsfldiclrhardabs`; the connected account did not list that project during the audit. Retention durations and independent AWS S3 bucket details have not been supplied. Changes requiring those inputs will remain clearly marked until verified.

## Verification evidence

Final production build, ESLint and `git diff --check` pass; Next.js build also runs TypeScript validation. GitHub CI is configured but has not run remotely.

- 49 regression tests pass (`npm test`) across sync, data ownership, admin pagination, push/reminder/email recovery and medicine history.
- Isolated embedded PostgreSQL applies base scripts plus all seven versioned migrations. Permission, constraint, rate-limit, lease, campaign and medicine audit assertions pass. Auth is stubbed; hosted Storage, multi-connection races and production defaults require staging verification. Reproduce with `tests/sql/README.md`.
- Local HTTP smoke check: `/`, `/auth`, `/medicines`, `/admin/email` return200; protected email admin returns403, email cron401, invalid unsubscribe400. Basic security headers present. This does not prove authenticated browser journeys.
- Graph change review reports CRITICAL scope:170 indexed changed symbols,117 affected processes across29 tracked changed files. The graph omits newly untracked surfaces and is not a substitute for their source review/tests. Existing unrelated work remains in the checkout; no commit or deployment was made.

## Still open: production and follow-up work

| Item | What is needed |
| --- | --- |
| Hosted migrations and isolation | Connect the Supabase account owning `avopjsfldiclrhardabs`; stage and apply all pending migrations, verify grants and two-account access. |
| Production deployment | Release the reviewed checkout after database gates; verify actual deployment SHA/routes and scheduler. |
| Email availability | Resend key, test address, verified sender domain, Auth SMTP; inbox and bounce tests. Temporary sender is for testing only. |
| Delivery events | Implement authenticated provider delivery/bounce/complaint webhook and suppression processing; currently only API acceptance is recorded. |
| Large audiences | Replace full reminder audience scans with an indexed due-job queue/cursor and load-test time budgets. Snapshot reads are batched, but audience scan remains. |
| DST and delivery guarantees | Define spring-forward nonexistent-time behavior; validate fall-back transitions and real devices. Push provider acceptance before a crash remains ambiguous. |
| Storage and privacy | Agree retention and account export/delete workflow; inventory/orphan cleanup with reviewed deletion scope. Independent AWS S3 bucket details are still missing; current object storage is Supabase Storage. |
| Recovery and costs | Back up database and object bytes, perform restore drill, set provider quotas/budget alerts and observe real usage. |
| Frontend acceptance | Authenticated mobile, accessibility, offline/reconnect and installed iPhone/Android push tests. Offline app shell is not implemented. |

See `PRODUCTION_RELEASE_RUNBOOK.md` for order, acceptance gates and rollback implications. Local completion does not mean these production gates are complete.
