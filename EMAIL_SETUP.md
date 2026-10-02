# Health Monitor email setup

App announcements use Resend. Supabase Auth emails use a separate SMTP configuration. Provider acceptance is recorded; inbox delivery is not implied.

## Prepare the database and environment

Follow `PRODUCTION_RELEASE_RUNBOOK.md` for migration order. At minimum, email requires the September email tables, October email recovery migration and October backend security/rate-limit migration. Apply all release migrations before deploying this version.

Set server environment variables in the deployment environment:

- `RESEND_API_KEY`: your secret Resend API key.
- `EMAIL_FROM`: `Health Monitor <onboarding@resend.dev>` for initial testing. Replace with your verified domain sender for users.
- `EMAIL_TEST_TO`: your Resend account email while using the temporary sender.
- `EMAIL_PUBLIC_URL`: the production HTTPS app URL, without query, credentials or fragment.
- `EMAIL_UNSUBSCRIBE_SECRET`: dedicated random secret of at least 32 characters. It is separate from `CRON_SECRET`.
- `EMAIL_UNSUBSCRIBE_PREVIOUS_SECRET`: optional previous secret during rotation; retain it while old links must work.
- Existing Supabase server credentials and `CRON_SECRET` remain required. Never expose server secrets through `NEXT_PUBLIC_` variables.

## Test, then start the campaign

1. Deploy, sign in as an admin, open `/admin/email`, and check setup status.
2. Press **Send test email**. This emails only `EMAIL_TEST_TO`. Verify inbox and Resend delivery events.
3. Verify a sending domain in Resend and replace the temporary sender before broadcasting. Broadcasts using `resend.dev` are blocked.
4. Configure an external scheduler to call `GET /api/cron/send-email` every minute, with `Authorization: Bearer <CRON_SECRET>`. Enable failure alerts. This endpoint only processes an explicitly enqueued campaign; it does not create one.
5. Press **Send to eligible users** to enqueue the fixed back-live campaign once. The audience is confirmed accounts that have not opted out at enqueue time. Accounts created afterwards are not automatically added to the campaign.
6. Each dispatch handles up to three records, with a database-backed 30-second dispatch limit. The scheduler continues pending work. A repeated admin click can also continue the same queue.

## Failure and unsubscribe behavior

Each recipient stores an immutable payload and stable provider idempotency key. A lease prevents concurrent claims. Temporary failures back off; attempts are limited to five and a 23-hour retry window. Resend currently retains idempotency keys for 24 hours, so older ambiguous attempts move to `review` rather than being automatically resent. Existing attempts without a frozen payload also require review. Check provider logs before any manual replay; do not change the campaign ID to bypass deduplication.

A GET of the signed unsubscribe link shows a confirmation form and does not modify subscription state. Signed POST confirms the opt-out and supports one-click unsubscribe headers. Queued opted-out users are cancelled before sending. Signing secret rotation preserves existing links through the optional previous secret.

The app records `accepted`, not delivered. Delivery/bounce/complaint webhooks and automated suppression are still a release follow-up. Review Resend events until those are implemented.

## Supabase Auth email

Configure Supabase Authentication SMTP separately after the verified sender and key are ready: Resend SMTP host `smtp.resend.com`, port `465`, username `resend`, password the API key. Validate settings against Resend's current documentation at setup time. Test signup, sign-in and password recovery with an owner-controlled test account. Announcement API configuration does not configure Auth SMTP.
