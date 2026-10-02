# Health Monitor UX redesign checklist

Updated 2026-10-02. Base: the selected first preview, with one clear next action.

## Implemented locally

- [x] Five clear destinations: Today, Meals, Medicines, Progress, Settings. Removes the incorrect Water → diagnostics destination.
- [x] Today focuses on the next meal, with separate medicine, water and sleep actions.
- [x] Meal logging follows one form: select meal → details → optional photo → save. The legacy meal URL remains compatible.
- [x] Water entry is independent, with undo for the latest unchanged entry.
- [x] Sleep entry is independent. Quote feedback is optional and never gates saving.
- [x] Profile, goals and routine editing live in Settings.
- [x] Medicines separates today's doses from management; food questions only apply to medicines marked with food.
- [x] Existing meal users can follow a dismissible three-step medicine introduction.
- [x] Medicine create/edit/pause errors preserve a retry path; dose correction remains available.
- [x] Reminder settings groups device setup and preferences. Troubleshooting stays collapsed under Help.
- [x] Server reminder candidates respect meal, medicine, morning, Monday and evening preferences. Monday uses the saved wake time.
- [x] Progress groups daily and medicine records, filters, report preview, download and sharing.
- [x] Sign-in and onboarding retain allowed notification destinations, including a specific meal.
- [x] Onboarding introduces notifications last, with an optional choice.
- [x] Warm ivory/sage surfaces, gentle raised shadows, firm button outlines/offset shadows, brief flip transitions and reduced-motion rules.
- [x] Clear loading/error/retry and local-versus-cloud save status. Day-boundary checks stop stale meal/sleep drafts being saved to a new day.

## Verified

- [x] 63 automated tests pass, including redirect safety, reminder preferences, real scheduler candidate generation, synchronization conflicts, report generation/sharing and delivery safeguards.
- [x] ESLint, TypeScript and production build pass.
- [x] Rendered Today preview inspected at 390 × 844 and 1280 × 900; navigation checked at 320 px.
- [x] Preview interactions: +250 ml, undo, snooze choices and confirmation, account menu/Escape, meal destination.
- [x] Medicine introduction steps and setup form navigation checked in the browser; save disabled without an account.
- [x] Account-unavailable meal and medicine states checked. They stop loading and show an explanation.
- [x] Required GitNexus impact checks and final change analysis performed. Final all-scope graph result: 175 changed symbols, 194 affected processes, 33 tracked changed files; critical risk, no partial/truncated result. This includes pre-existing backend changes. New untracked modules were indexed and checked in source/build/tests; the diff analysis does not include them as committed changes. Shared navigation/auth are high-impact changes; graph results do not replace runtime tests.

## Still required before production release

- [ ] Configure the local/preview Supabase environment. Only `.env.example` exists here; authenticated end-to-end verification is blocked.
- [ ] With a test account, verify sign-in → onboarding/notification destination; reload persisted meal, water, sleep and medicine records.
- [ ] Verify actual photo upload/access, medicine taken/skipped/correction and another user's isolation against deployed database policies.
- [ ] Verify real device push permissions, closed-app delivery and Monday local wake-time delivery. Unit tests verify scheduling logic, not device receipt.
- [ ] Exercise camera permission denial/capture and report download/native sharing on real iPhone and Android devices.
- [ ] Confirm existing users' cached and cloud records survive upgrade, offline retry and cross-device conflict recovery.
- [ ] Review and release the combined pending repository changes, then verify the deployed routes and migrations. This redesign has not been committed, pushed or deployed in this turn.

## Preview and evidence

- Local sample preview: http://127.0.0.1:3130/preview (development only; no account data; production returns 404).
- `artifacts/ux-redesign/today-mobile.png`
- `artifacts/ux-redesign/today-desktop.png`
- `design-qa.md`

The preview shares the production Today component, with sample data and in-memory callbacks. A successful preview action does not prove a backend write or notification send. The repository already contained pending audit/backend work before this redesign; it was preserved.
