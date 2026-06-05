# Dee Meal Monitor System UI Development Guide

Last updated: June 6, 2026

## 1. Purpose

This document is the UI development guide for Dee Meal Monitor System. Use it when designing, building, reviewing, or fixing screens in the app.

The app should feel simple, calm, clear, and caring. It is not a hospital dashboard, not a diet app, and not a marketing site. The user should always understand what to do next within a few seconds.

## 2. Visual Direction

The UI uses a warm mobile wellness direction inspired by the latest reference screens:

- Cream/off-white canvas.
- Deep green primary brand color.
- Soft peach/brown secondary action color.
- Frosted white and neumorphic surfaces.
- Soft shadows.
- Large rounded cards, often `24px` to `32px`.
- Circular score rings and water rings.
- Pill-shaped primary actions.
- Bottom mobile navigation.
- Clean spacing with no crowded text.

Core classes:

- `glass-shell`: large page containers and main sections.
- `glass-surface`: smaller panels, cards, timeline rows, and repeated blocks.
- `glass-dark`: dark highlight cards.
- `wellness-card`: primary soft rounded mobile wellness card.
- `soft-inset`: inset neumorphic treatment for quiet controls.
- `pill-nav`: selected mobile navigation pill.

Do not overuse nested cards. A page section can be a soft surface, but cards should be for repeated items, inputs, modals, or clearly framed controls.

The visual target should feel closer to a premium habit/wellness mobile app than a desktop admin dashboard.

## 3. Brand Assets

Use these assets consistently:

- Logo: `public/dee-logo.svg`
- Background: `public/dee-bg.svg`
- PWA icon: `public/icon-192.png`, `public/icon-512.png`
- Apple icon: `public/apple-touch-icon.png`
- Notification badge: `public/badge-72.png`
- Reschedule character: `public/reschedule-character.jpg`
- Notification sound: `public/reminder.wav`

Logo component:

- Use `components/brand-logo.tsx`.
- Do not manually recreate the logo in page code.
- Dashboard should stay lighter and less text-heavy.
- Other pages can show Dee branding in the fixed nav.

## 4. Component System

Use the local shadcn-style components from `components/ui`.

Available primitives:

- `Button`
- `Card`
- `Badge`
- `Input`
- `Label`
- `Textarea`
- `Progress`
- `Separator`
- `Tabs`
- `Toast`

Use `lucide-react` icons for buttons and section titles. Avoid custom inline SVG unless there is no suitable icon.

Buttons should feel clickable:

- Primary actions use `Button`.
- Secondary actions use `variant="outline"`.
- Destructive actions should be visually clear and rare.
- Disable buttons during saving/syncing to prevent double taps.
- Show toast feedback after important actions.

## 5. Navigation Rules

Use `components/app-nav.tsx` on every normal app page.

The nav should:

- Stay fixed/sticky where the page design requires it.
- Keep the hamburger menu accessible.
- Keep main actions inside the hamburger when possible.
- Avoid cluttering the page top with too much brand text.
- On mobile, include a bottom pill navigation with Today, History, Water/Notifications, and Profile.
- Top nav should feel like the reference: Dee logo/name on the left and notification/menu action on the right.

Hamburger menu should include:

- Notification status/action.
- Test push.
- Current meal page.
- History.
- Profile.
- Admin.
- Reset today.
- Sign out.

Meal camera fullscreen mode is an exception. When the live camera is open, the camera should be full screen and uncluttered.

## 6. Page Inventory

### 6.1 Auth

Path: `/auth`

Purpose:

- Sign in.
- Sign up.
- Magic link sign-in if enabled.
- Route existing users to dashboard.
- Route new users to onboarding.

UI requirements:

- Keep the form compact.
- Do not overload the user with explanations.
- Show clear loading states.
- Show friendly error messages.

Acceptance checks:

- User can sign in with email/password.
- User can create account.
- After sign-in, latest Supabase snapshot loads.
- If no onboarding data exists, user goes to onboarding.

### 6.2 Onboarding

Path: `/onboarding`

Purpose:

- Gather initial user details.
- Save routine, meal times, water goal, timezone, and reminder preference.

UI requirements:

- Steps should be side by side where possible:
  - You
  - Routine
  - Goals
  - Reminders
- User should not move forward until the current step is valid.
- Water goal should not start at zero.
- Use stepper/increase-decrease controls for numeric goals where possible.

Acceptance checks:

- Timezone is detected with `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- User cannot skip required fields.
- Profile snapshot saves to Supabase.
- User lands on dashboard after completion.

### 6.3 Dashboard

Path: `/`

Purpose:

- Main daily overview.
- Morning boost at the top.
- Meals, water, sleep, score, and next reminder.
- Simple entry points to daily actions.

UI requirements:

- Morning Boost must appear near the top.
- Keep dashboard uncluttered.
- Avoid repeating “Dee Meal Monitor System” in large text on the dashboard.
- No upload option. This app supports camera capture only.
- Sections should be collapsible where useful.
- Use the mobile wellness layout:
  - large greeting
  - daily health score ring
  - two compact Meals/Water cards
  - Track Progress card with Capture Meal and Add Water
  - sleep/progress cards below

Acceptance checks:

- Morning greeting changes by time.
- Meal cards show correct statuses.
- Water starts from the actual saved day value, not fake filled data.
- Old day images must never appear as today’s meals.

### 6.4 Meal Check-In

Path: `/meal/lunch`

Note: The path name is currently `/meal/lunch`, but the screen dynamically chooses breakfast, lunch, or dinner based on current time and saved routine.

Purpose:

- Open from notification.
- Let user capture the active meal.
- Let user reschedule if it is not meal time.
- Ask water intake after photo.
- Ask sleep if morning sleep check was skipped.
- Save meal description.

Initial screen must show only:

- Capture your meal.
- Not your meal time?

The preferred layout:

- Large centered meal icon.
- Large title such as `Time for Lunch`.
- One soft camera card.
- Big green `Open Camera` pill.
- Three soft snooze tiles: `+15m`, `+30m`, `+1h`.
- Small friendly tip pill at the bottom.

Camera rules:

- Camera must be full screen.
- No extra page chrome in fullscreen camera.
- Capture button must always be visible.
- Show live camera note: ask user to open the lid if closed.
- After capture, return to meal page.

Reschedule rules:

- Buttons: `+15`, `+30`, `+1hr`.
- After tapping, show large confirmation.
- Use `public/reschedule-character.jpg`.
- Do not use kissing emoji.
- Show emotional but clean message.
- Save rescheduled state.
- Cron should send based on the new planned time.

Save rules:

- Save photo and meal details.
- Await cloud sync.
- Disable buttons while syncing.
- Show success toast with green tick style.
- If cloud sync fails, say saved on device and cloud sync failed.

Acceptance checks:

- Capture button visible on mobile.
- Camera opens and closes correctly.
- Meal image saves after refresh.
- Reschedule does not duplicate old day meals.
- Old day images are not copied into a new day.

### 6.5 Morning

Path: `/morning`

Purpose:

- Show morning quote.
- Collect like/dislike feedback.
- Ask sleep rating/check-in.

UI requirements:

- Quote should be the focus.
- Like/dislike buttons should be obvious.
- After feedback, show clear thank-you state.
- Sleep rating should be simple and quick.

Acceptance checks:

- Quote feedback saves.
- Sleep check saves.
- Morning notification opens this page.

### 6.6 Profile

Path: `/profile`

Purpose:

- Edit routine.
- Edit meal times.
- Edit water goal.
- Edit timezone.
- See today’s reminder timeline.

UI requirements:

- Keep profile and schedule away from the dashboard clutter.
- Use collapsible sections.
- Use time inputs for schedule.
- Use stepper/increase-decrease controls for water/sleep-like numeric values.

Acceptance checks:

- Save waits for cloud sync.
- User timezone is preserved.
- Editing profile does not copy old day meal images into today.

### 6.7 History

Path: `/history`

Purpose:

- Show previous day summaries.
- Show meal images, water, sleep, quote feedback, and score.

UI requirements:

- Day cards should be collapsible.
- Meal image sections should be collapsible.
- Do not relabel old current data as today.
- Each day must show only that day’s actual saved meals.

Acceptance checks:

- Refresh does not change days.
- Images do not repeat across days unless the user truly captured the same image.
- Dates follow user timezone.

### 6.8 Admin

Path: `/admin`

Purpose:

- Admin monitoring for all users.
- Show each user’s daily summaries and meal images.

UI requirements:

- Admin reads only Supabase server snapshots.
- Do not merge admin browser `localStorage` into admin data.
- User cards should be expandable.
- Day cards should be expandable.
- Meal image logs should be expandable.

Acceptance checks:

- Admin email `kanil977690@gmail.com` can access.
- Non-admin users cannot access.
- Meal images match the correct user and date.
- Same images must not be invented across multiple days.

### 6.9 Notifications Doctor

Path: `/notifications`

Purpose:

- Diagnose notification setup.
- Stop guessing when push reminders fail.

UI requirements:

- Show simple pass/fail checks.
- Include actions:
  - Sync schedule.
  - Enable device.
  - Send test.
  - Refresh checks.

Acceptance checks:

- Saved schedule is visible.
- Saved push device is visible.
- Test push works when browser/device allows it.
- Cron and doctor logic agree on due reminders.

## 7. Data Display Rules

Never show stale daily data as current-day data.

Daily fields:

- meals
- meal images
- meal descriptions
- water
- sleep check status
- quote feedback

If the saved snapshot date is not today in the user’s timezone, reset daily fields before showing/saving the current day.

Long-term profile fields can carry forward:

- name
- meal times
- wake time
- sleep reminder
- water goal
- timezone

## 8. Notification UI Rules

Notifications should be short and action-oriented.

Morning:

- Opens `/morning`.
- Includes a quote.

Meals:

- Opens `/meal/lunch`.
- Message should mention the meal name.
- If late, say “You are late for breakfast/lunch/dinner.”

Sleep:

- Opens dashboard or sleep flow.

The UI must show notification setup clearly because iPhone and desktop behave differently.

## 9. Image Rules

Current MVP:

- Camera capture only.
- No media upload.
- Captured image is compressed before save.
- Image is stored with meal data in Supabase snapshots.

Production recommendation:

- Move images to Supabase Storage.
- Store only image path/public URL in the database.
- Admin should display from storage URL.

Do not add gallery upload unless the product requirement changes.

## 10. Responsive Rules

Mobile first:

- Buttons must remain visible.
- Camera controls must not fall below the viewport.
- Step buttons should sit side by side where requested.
- Avoid long text blocks.

Desktop:

- Use grids for metrics and cards.
- Keep content centered with max width.
- Avoid huge empty hero-style sections.

## 11. Interaction Feedback

Every important action should feel like it happened.

Use toast feedback for:

- Meal saved.
- Photo saved.
- Water saved.
- Sleep saved.
- Profile saved.
- Reschedule saved.
- Notification enabled.

Use disabled states during:

- Cloud sync.
- Sign in.
- Save.
- Camera capture.

## 12. Error And Empty States

Use plain language.

Good:

- “Saved on this device. Cloud sync failed.”
- “No image captured.”
- “No users to monitor yet.”

Avoid:

- Raw Supabase errors in user-facing screens.
- Long technical text.
- Blaming the user.

## 13. Launch UI Checklist

Before launch, check:

- Auth page loads.
- Onboarding blocks empty required fields.
- Dashboard does not show old meal images.
- Meal camera capture button is visible on mobile.
- Meal save survives refresh.
- Reschedule shows confirmation image.
- History shows correct day data.
- Admin shows only Supabase data.
- Notifications page shows saved schedule and device.
- Cron endpoint has no failures.
- iPhone PWA notification flow is tested from Home Screen.

## 14. Future UI Improvements

Recommended next UI upgrades:

- Dedicated `/meal/[type]` route instead of only `/meal/lunch`.
- Supabase Storage image gallery viewer.
- Admin filters by user/date.
- Better empty-state illustrations.
- Cleaner notification permission education for iPhone.
- Dark mode after core launch is stable.
