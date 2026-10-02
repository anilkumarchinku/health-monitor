# Database repair checklist

Target: health monitor, Supabase project `avopjsfldiclrhardabs`.
Verified 2 October 2026. The user applied the repair bundle in the production project. All ten new tables are accessible, and the supplied SQL results show RLS enabled on all ten. Authenticated tests against live Supabase passed using the local application API and two temporary test accounts. The accounts, sessions, photo objects and rate-limit counters were cleaned up. This is not verification of a Vercel deployment.

## Completed live

- [x] Verify the URL, public API key and server key work with the target project.
- [x] Keep local credentials in `.env.local`, excluded from Git with permissions 600.
- [x] Confirm existing health snapshots, medicines, doses, push subscriptions and reminder deliveries are accessible through the server API.
- [x] Create `meal-images` as a private bucket, limited to JPEG images up to 5 MB.
- [x] Verify the local sync endpoint rejects requests without a user access token with HTTP 401.

## Applied and verified live

- [x] Add `server_rate_limits` and the server-only `consume_rate_limit` function.
- [x] Add medicine dose history, its audit trigger and owner-only read policy.
- [x] Add device delivery recovery, scheduler run tracking and saved snoozes.
- [x] Add email opt-outs, campaigns, delivery queue and retry functions.
- [x] Add durable push announcement campaigns and delivery recovery.
- [x] Add owner-only photo upload and read policies; verified upload, signed download, and rejection of cross-user access.
- [x] Confirm RLS on all ten new tables from the SQL result, service-role access to all ten, and rejection of anonymous access to all ten.
- [x] Verify authenticated app API save/update/reload, stale-version rejection, medicine change/history, and photo upload/read against live Supabase.
- [x] Verify cross-user snapshot, medicine-history and photo isolation.
- [x] Remove temporary test accounts, revoke their sessions, and remove test photos/counters.
- [ ] Verify the complete browser journey and the deployed Vercel version.
- [ ] Coordinate the remaining snapshot/push permission cutover with deployment and reconcile migration history.
- [ ] Verify scheduled push delivery and configured-provider email delivery separately; no messages were sent during these checks.

## Repair application record

The user has already applied this bundle successfully. Do not rerun it. The original application instructions are retained for context:

Open `artifacts/database-repair/repair.sql`, copy the entire file, and run it once in the SQL Editor of the target project. It runs in a transaction and stops before changing anything if prerequisite tables are absent or one of the new tables already exists. On an error, stop and inspect the error; do not run individual fragments. Run `ROLLBACK;` if the SQL session remains in an aborted transaction.

The bundle reuses the existing migrations, but includes only the additive rate-limit section of `20261002130713_backend_security.sql`. The snapshot/push permission cutover and snapshot constraint are deliberately deferred until the matching app is deployed: applying those now could break older clients. Existing health records are not rewritten, and no email or push campaign is started.

All ten result rows showed `rls_enabled = true`; API and authenticated data-flow checks passed. Reconcile Supabase migration history against the original migration files before a future CLI push. Do not mark the entire backend-security migration applied: its permission cutover remains outstanding.

## Verification performed locally

A temporary PGlite PostgreSQL database was bootstrapped with the repository's base schema and medicine schema plus simulated Supabase roles, `auth.uid`, and Storage tables. The unmodified repair bundle passed:

- SQL execution and all 15 public tables having RLS enabled.
- Rate limiter allowing two requests and rejecting the third.
- Medicine insert/update producing audit events.
- Another user seeing neither the first user's medicine history nor photo records.
- Another user being unable to upload into the first user's photo folder.
- Authenticated clients being unable to execute the server rate-limit function.
- A second application stopping at the preflight guard.

This verifies SQL behavior in the local harness, not the live Supabase platform or an end-to-end browser session.

## Live verification evidence

See `artifacts/database-repair/live-verification.json` for the timestamped checks and cleanup results. The live tests used the real Supabase Auth, Data and Storage APIs. The snapshot writes went through the running local app's `/api/sync/snapshot` route. Other checks exercised the same Supabase APIs used by medicine and image components. No existing users' health records were changed.

The email and push claim functions were checked against nonexistent test campaigns, so nothing was enqueued or sent. Successful database checks do not prove provider delivery or the scheduler configuration.

## SQL administration access

The user applied the script through the owning account's SQL Editor. The connected Supabase MCP and CLI accounts still return permission denied for SQL administration. The service-role key works for app Data and Storage APIs; it is not a substitute for a database-management credential.
