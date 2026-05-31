# Dee Meal Monitor System - End-to-End Project Documentation

Last updated: May 31, 2026

## 1. Project Summary

Dee Meal Monitor System is a web application that helps users track meals, water intake, sleep, and morning motivation. The app asks users at meal times to capture a fresh meal photo, enter what they ate, record water intake since the previous section, and optionally update sleep details if they missed the morning check-in.

The project is built as a Progressive Web App using Next.js, Supabase, Vercel, Web Push, and an external cron scheduler. It uses a clean shadcn-style UI with glassmorphism, fixed navigation, a dashboard, onboarding, profile setup, history, admin monitoring, notification diagnostics, and meal capture flows.

## 2. Core User Goals

- Ask the user what they had for breakfast, lunch, and dinner.
- Capture a fresh meal image through the camera only.
- Do not support media upload from the gallery.
- Ask at exact meal times using push notifications.
- Let the user reschedule reminders by 15 minutes, 30 minutes, or 1 hour.
- Ask for water intake after meal capture.
- Ask about sleep if the morning sleep check was skipped.
- Show a morning boost quote and collect like/dislike feedback.
- Store daily history and show previous day summaries.
- Allow an admin to view user health summaries and meal images.
- Support iPhone as much as a web app can, with PWA installation requirements.

## 3. Tech Stack

- Framework: Next.js 15
- UI: React 19, Tailwind CSS, shadcn-style local UI components
- Icons: lucide-react
- Backend data: Supabase
- Auth: Supabase email/password and magic link support
- Push notifications: Web Push with VAPID keys
- Deployment: Vercel
- Scheduler: cron-job.org calling the Vercel API route
- Local storage: Browser localStorage for instant UI persistence
- Server persistence: Supabase tables for authenticated users

## 4. Main Application Pages

### Dashboard

Path: `/`

Main file: `app/page.tsx`

Purpose:

- Shows morning boost at the top.
- Shows meals, water, sleep, and daily score.
- Lets users capture meals from the dashboard flow.
- Shows collapsible sections.
- Syncs current daily state to Supabase after loading.

### Auth

Path: `/auth`

Main file: `app/auth/page.tsx`

Purpose:

- Allows sign-in and sign-up using email/password.
- Supports magic link sign-in.
- Loads latest user snapshot after sign-in.
- Sends new users to onboarding.

### Onboarding

Path: `/onboarding`

Main file: `app/onboarding/page.tsx`

Purpose:

- Collects notification preference, name, routine times, goals, water target, and timezone.
- Detects timezone automatically using:

```ts
Intl.DateTimeFormat().resolvedOptions().timeZone
```

- Saves first profile and schedule snapshot to Supabase.

### Meal Check-In

Path: `/meal/lunch`

Main file: `app/meal/lunch/page.tsx`

Purpose:

- Dynamically chooses the active meal based on current time and/or requested meal query.
- Shows only two main sections first:
  - Capture your meal
  - Not your meal time?
- Opens full-screen camera for capture.
- Shows a live camera message asking the user to open the lid if closed.
- After capture, asks water intake since the previous section.
- If sleep check was skipped, asks sleep rating/details.
- Then asks what the user ate.
- Saves meal details and image.
- Reschedule options show a large emotional confirmation with the character image.

### Morning Check-In

Path: `/morning`

Main file: `app/morning/page.tsx`

Purpose:

- Shows the morning quote.
- Lets user like/dislike the quote.
- Saves quote review.
- Asks sleep rating.

### Profile

Path: `/profile`

Main file: `app/profile/page.tsx`

Purpose:

- Lets user set personal meal times.
- Lets user set wake time, sleep reminder, timezone, and water goal.
- Shows today's timeline.
- Saves profile to Supabase.

### History

Path: `/history`

Main file: `app/history/page.tsx`

Purpose:

- Shows previous daily summaries.
- Uses collapsible day cards.
- Shows meals, water, sleep, quote feedback, and daily score.

### Admin

Path: `/admin`

Main file: `app/admin/page.tsx`

Purpose:

- Admin monitoring for user health data.
- Shows all stored user snapshots.
- Shows meal images and summaries when available.
- Uses protected admin API route.

### Notification Doctor

Path: `/notifications`

Main file: `app/notifications/page.tsx`

Purpose:

- End-to-end notification troubleshooting page.
- Checks:
  - Saved schedule
  - Saved push device
  - Server push keys
  - Whether a reminder is due now
- Lets user run:
  - Sync schedule
  - Enable device
  - Send test
  - Refresh checks

This page was added to stop guessing during notification debugging.

## 5. Shared Components

### Fixed Navigation

File: `components/app-nav.tsx`

The app has a fixed top navigation bar with a hamburger menu. The hamburger contains:

- Enable notifications
- Test push
- Check notifications
- Notification doctor
- Dashboard
- Meal check-in
- History
- Profile
- Admin
- Reset today
- Sign out

### Brand Logo

File: `components/brand-logo.tsx`

Uses the Dee Meal Monitor logo assets from `public/`.

### Toasts

File: `components/ui/toast.tsx`

Small bottom popups are used for actions like saving meals, saving profile, and confirming state changes.

## 6. Public Assets

Important files in `public/`:

- `icon.svg`
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`
- `badge-72.png`
- `dee-logo.svg`
- `dee-bg.svg`
- `reminder.wav`
- `reschedule-character.jpg`
- `manifest.json`
- `sw.js`

`manifest.json` makes the app installable as a PWA. `sw.js` handles push notifications and notification clicks.

## 7. Data Storage Model

The app stores data in two places:

### Local Browser Storage

Used for instant UI responsiveness.

Main keys:

- `daily-health-companion`
- `daily-health-history`
- `daily-health-client-id`
- `daily-health-current-user`

Defined in:

```ts
lib/health-sync.ts
```

### Supabase

Used for authenticated persistence, admin monitoring, cron reminders, and push delivery.

Main tables:

- `health_snapshots`
- `push_subscriptions`
- `reminder_deliveries`

SQL files:

- `supabase/schema.sql`
- `supabase/auth_push_migration.sql`
- `supabase/cron_reminders_migration.sql`
- `supabase/morning_reminders_migration.sql`
- `supabase/rescheduled_reminders_migration.sql`
- `supabase/secure_snapshot_reads_migration.sql`

## 8. Supabase Tables

### health_snapshots

Stores one daily health state per user.

Important columns:

- `user_id`
- `client_id`
- `date`
- `profile`
- `meals`
- `water`
- `sleep`
- `sleep_check_completed`
- `quote_index`
- `quote_feedback`
- `onboarding_completed`
- `notification_preference`
- `payload`
- `updated_at`

Cron reads this table to decide what reminders are due.

### push_subscriptions

Stores browser push subscriptions.

Important columns:

- `user_id`
- `endpoint`
- `subscription`
- `created_at`
- `updated_at`

The server sends push notifications to the stored subscription payload.

### reminder_deliveries

Prevents duplicate reminders.

Important columns:

- `user_id`
- `date`
- `kind`
- `reminder_key`
- `delivered_at`

The `reminder_key` allows rescheduled reminders and exact meal times to be tracked separately.

## 9. API Routes

### `/api/sync/snapshot`

File: `app/api/sync/snapshot/route.ts`

Purpose:

- Saves authenticated user schedule and daily state to Supabase.
- Uses Supabase service role on the server after verifying the user token.
- Replaced fragile `upsert(onConflict: "user_id,date")` with safer lookup, then update or insert.
- Strips very large meal image data from server payload to avoid sync failures.

This route fixed the major blocker where `/api/sync/snapshot` was returning `500`.

### `/api/push/subscribe`

File: `app/api/push/subscribe/route.ts`

Purpose:

- Saves push subscriptions server-side.
- Verifies the signed-in user.
- Uses service role to avoid browser-side RLS and conflict issues.

### `/api/push/test`

File: `app/api/push/test/route.ts`

Purpose:

- Sends a test push notification to the signed-in user's saved subscriptions.
- Uses server-side Supabase access after verifying the user.
- Returns clear errors when there is no saved subscription.

### `/api/cron/send-reminders`

File: `app/api/cron/send-reminders/route.ts`

Purpose:

- Called every minute by cron-job.org.
- Checks all recent health snapshots.
- Calculates reminder due status in each user's saved timezone.
- Sends morning, meal, and sleep notifications.
- Records delivery in `reminder_deliveries`.
- Returns diagnostics:
  - `snapshotsFetched`
  - `snapshotsChecked`
  - `dueReminders`
  - `subscriptionsFound`
  - `sent`
  - `skipped`
  - `failures`

### `/api/notifications/doctor`

File: `app/api/notifications/doctor/route.ts`

Purpose:

- Checks the full notification pipeline for the signed-in user.
- Reports blockers:
  - No saved schedule
  - No saved push subscription
  - Missing VAPID keys
  - No reminder due now

### `/api/admin/snapshots`

File: `app/api/admin/snapshots/route.ts`

Purpose:

- Lets admin users read all health snapshots.
- Requires signed-in user and admin email allowlist.

## 10. Notification Architecture

The notification flow is:

1. User signs in.
2. User completes onboarding or profile schedule.
3. App saves schedule to localStorage.
4. App syncs schedule to Supabase through `/api/sync/snapshot`.
5. User taps Enable notifications.
6. Browser asks for permission.
7. App registers service worker `/sw.js`.
8. App creates a fresh push subscription using VAPID public key.
9. App sends subscription to `/api/push/subscribe`.
10. Server stores subscription in Supabase.
11. cron-job.org calls `/api/cron/send-reminders` every minute.
12. Cron reads `health_snapshots`.
13. Cron checks local time using the user's timezone.
14. Cron reads `push_subscriptions`.
15. Cron sends Web Push notification.
16. Service worker receives push event.
17. Service worker shows browser notification.
18. User taps notification.
19. Service worker opens the correct app page.

## 11. iPhone Notification Requirements

iPhone web push has strict limits.

For iPhone notifications to work:

- User must open the site in Safari.
- User must tap Share.
- User must choose Add to Home Screen.
- User must open the installed Home Screen app.
- User must enable notifications inside that installed app.

Normal Safari tab notification behavior is not the same as native apps.

Also:

- The app cannot force custom notification sounds on iOS.
- iOS notification sound behavior is controlled by the OS.
- Focus mode, DND, Low Power Mode, and notification settings can block delivery display.

## 12. Environment Variables

Required Vercel env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
REMINDER_WINDOW_MINUTES=
NEXT_PUBLIC_ADMIN_EMAILS=
ADMIN_EMAILS=
```

Important notes:

- `NEXT_PUBLIC_` values are safe for browser use.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-only.
- `VAPID_PRIVATE_KEY` must stay server-only.
- `CRON_SECRET` must stay server-only.

## 13. Cron Setup

External scheduler:

- Provider: cron-job.org
- Schedule: every 1 minute
- URL:

```text
https://health-monitor-amber.vercel.app/api/cron/send-reminders
```

Required header:

```text
Authorization: Bearer YOUR_CRON_SECRET
```

Without this cron job, notifications will not be sent while the app is closed.

## 14. Meal Reminder Logic

Meal reminders are generated from:

- `profile.breakfastTime`
- `profile.lunchTime`
- `profile.dinnerTime`
- `meals[].plannedTime`
- `profile.timezone`

Meal statuses:

- `pending`
- `logged`
- `snoozed`
- `skipped`

Cron does not send meal reminders for:

- `logged`
- `skipped`

Rescheduled meals update:

- `plannedTime`
- `status: "snoozed"`
- `snoozeLabel`

The updated state must sync to Supabase before cron can send the new reminder.

## 15. Water and Sleep Flow

After meal capture:

1. User enters water intake since the previous meal section.
2. Bottle animation reflects water progress toward daily goal.
3. If sleep check was missed, meal flow asks for sleep details/rating.
4. App saves updated state to localStorage and Supabase.

Water goal is set in profile/onboarding.

## 16. Morning Quote Flow

Morning notification opens `/morning`.

Morning page:

- Shows quote.
- Lets user like/dislike.
- Saves feedback.
- Asks sleep rating.

Quotes are defined in:

```ts
lib/morning-quotes.ts
```

## 17. Admin Monitoring

Admin page reads all Supabase health snapshots through:

```text
/api/admin/snapshots
```

Admin access is controlled by:

```env
ADMIN_EMAILS
NEXT_PUBLIC_ADMIN_EMAILS
```

Admin can see:

- Users
- Daily summaries
- Meal logs
- Meal images when stored in snapshot payload
- Water
- Sleep
- Quote feedback

## 18. Major Debugging History

The notification issue had multiple layers.

### Problem 1: Browser said enabled, server had no subscription

Fix:

- Status now verifies Supabase saved subscription.
- Test push now returns clear no-subscription failures.

Commit:

```text
c61d9e2 Verify saved push subscriptions
```

### Problem 2: Cron was running, but saw no schedule

Observed live response:

```json
{
  "sent": 0,
  "snapshotsFetched": 0,
  "dueReminders": 0,
  "subscriptionsFound": 0
}
```

Fix:

- Enabling notifications also syncs current schedule.

Commit:

```text
9071ca4 Sync reminder schedule when enabling push
```

### Problem 3: Client-side Supabase sync was unreliable

Fix:

- Added authenticated server snapshot sync API.

Commit:

```text
3ac4432 Add authenticated snapshot sync API
```

### Problem 4: Push subscription saving depended on browser RLS

Fix:

- Added server-side push subscribe API.
- Freshly resubscribes device when enabling notifications.
- Server-side test push uses same data path as cron.

Commit:

```text
d9c843c Audit and harden notification delivery
```

### Problem 5: No diagnostic UI existed

Fix:

- Added `/notifications` doctor page.

Commit:

```text
51c2bff Add notification doctor page
```

### Problem 6: Snapshot sync route returned 500

Observed logs:

```text
POST /api/sync/snapshot 500
```

Root issue:

- The route relied on Supabase `onConflict: "user_id,date"`, which can fail if the live database does not exactly match the expected unique constraint.

Fix:

- Replaced upsert conflict logic with lookup, then update or insert.
- Added step-specific error output.
- Stripped huge base64 images from server payload.

Commit:

```text
7f23adb Fix server snapshot sync failures
```

## 19. How To Verify Notifications End-to-End

Open:

```text
https://health-monitor-amber.vercel.app/notifications
```

Run these buttons in order:

1. Sync schedule
2. Enable device
3. Send test
4. Refresh checks

Expected state:

- Saved schedule: OK
- Saved push device: OK
- Server push keys: OK
- Reminder due now: OK only if current time is inside reminder window

If test push does not appear but first three checks are OK:

- Check browser notification settings.
- Check OS notification settings.
- Check Focus/DND.
- On iPhone, confirm app is installed to Home Screen.
- Confirm you opened the Home Screen app, not a Safari tab.

## 20. How To Verify Cron

Call cron manually with the secret:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://health-monitor-amber.vercel.app/api/cron/send-reminders
```

Healthy response should show:

```json
{
  "diagnostics": {
    "snapshotsFetched": 1,
    "subscriptionsFound": 1
  }
}
```

If `snapshotsFetched` is 0:

- Schedule is not saved to Supabase.
- Run Notification Doctor > Sync schedule.

If `subscriptionsFound` is 0:

- Device is not saved for push.
- Run Notification Doctor > Enable device.

If `dueReminders` is 0:

- No reminder is due at the current local minute.
- Set meal time 2 to 3 minutes ahead and wait.

If `failures` contains errors:

- Subscription may be stale.
- Run Enable device again to create a fresh subscription.

## 21. Local Development

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Start production build:

```bash
npm run start
```

## 22. Current Known Platform Limits

- Web apps cannot guarantee custom notification sounds on iOS.
- iPhone web push requires Home Screen PWA installation.
- Notifications can be blocked by OS settings even when app code is correct.
- Background notification delivery requires the external cron job.
- If Supabase schema is not fully migrated, sync can fail.
- If Vercel env vars are missing or stale, push will fail.

## 23. Recommended Launch Checklist

Before launch:

1. Run all Supabase SQL migrations.
2. Confirm Vercel env vars are set for Production and Preview.
3. Redeploy Vercel after env changes.
4. Confirm cron-job.org is active.
5. Open `/notifications`.
6. Run Sync schedule.
7. Run Enable device.
8. Run Send test.
9. Confirm test push appears.
10. Set lunch 2 to 3 minutes ahead.
11. Confirm cron sends the notification.
12. Test on Android Chrome.
13. Test on desktop Chrome.
14. Test on iPhone Home Screen PWA.

## 24. Important Files To Know

Core app:

- `app/page.tsx`
- `app/onboarding/page.tsx`
- `app/meal/lunch/page.tsx`
- `app/morning/page.tsx`
- `app/profile/page.tsx`
- `app/history/page.tsx`
- `app/admin/page.tsx`
- `app/notifications/page.tsx`

Notification system:

- `lib/push-notifications.ts`
- `public/sw.js`
- `app/api/push/subscribe/route.ts`
- `app/api/push/test/route.ts`
- `app/api/cron/send-reminders/route.ts`
- `app/api/notifications/doctor/route.ts`

Data sync:

- `lib/health-sync.ts`
- `app/api/sync/snapshot/route.ts`

Auth:

- `lib/auth.ts`
- `lib/supabase/client.ts`

Database:

- `supabase/schema.sql`
- `supabase/*.sql`

Branding/assets:

- `components/brand-logo.tsx`
- `public/icon.svg`
- `public/dee-logo.svg`
- `public/dee-bg.svg`
- `public/reschedule-character.jpg`

## 25. Final State

The project now has a complete web app flow:

- User authentication
- Onboarding
- Profile and schedule
- Dashboard
- Meal camera capture
- Water and sleep check-in
- Morning quote and feedback
- History summaries
- Admin monitoring
- Push notification infrastructure
- Cron reminder delivery
- Notification diagnostics

The biggest launch-critical area is still real-device notification verification. The `/notifications` page is now the official place to confirm whether the signed-in user and device are ready for scheduled push notifications.
