# PRD: Daily Health Companion Web App

## 1. Product Summary

Daily Health Companion is a web application that helps users build healthier daily routines through gentle meal check-ins, photo-based food journaling, hydration tracking, sleep check-ins, motivational morning messages, and end-of-day wellness summaries.

The app should feel warm, supportive, and personal. It should not feel like a strict diet app or a medical tool. The main goal is to help users become more aware of what they eat, when they eat, how much water they drink, and how their sleep and mood affect the day.

## 2. Problem Statement

Many people want to eat better, drink enough water, sleep well, and stay motivated, but they forget to track these habits during a busy day. Most health apps feel too serious, too data-heavy, or too focused on weight loss.

This app solves that by checking in at the right time with friendly notifications, asking quick questions, allowing the user to upload meal images, and giving them a simple daily reflection.

## 3. Target Users

- Students and working professionals who often forget meals or water intake.
- People trying to build healthier habits without complicated calorie counting.
- Users who want encouragement and confidence-building messages every morning.
- Users who prefer quick photo-based tracking instead of typing long food logs.
- Beginners who want habit awareness before advanced fitness or nutrition tracking.

## 4. Goals

- Help users log breakfast, lunch, and dinner with text and images.
- Notify users at their preferred meal times.
- Let users change the check-in time if it is not their actual meal time.
- Track daily water intake against a personal goal.
- Ask users what time they slept and optionally how well they slept.
- Send a morning greeting with a motivational quote.
- Collect quote feedback using like/dislike buttons.
- Create a simple end-of-day health summary.
- Make the app feel beautiful, calm, friendly, and easy to use.

## 5. Non-Goals

- The first version will not diagnose medical conditions.
- The first version will not replace doctors, nutritionists, or therapists.
- The first version will not require calorie counting.
- The first version will not use complex AI nutrition analysis unless added in a later phase.

## 6. Core User Journey

### 6.1 Onboarding

When the user first opens the app, they should set:

- Name or nickname.
- Wake-up time.
- Usual sleep time.
- Breakfast time.
- Lunch time.
- Dinner time.
- Daily water intake goal.
- Notification permission.
- Optional health goal, such as more energy, better sleep, improved discipline, or balanced eating.

### 6.2 Morning Check-In

At the user's wake-up time, the app sends a notification:

> Good morning, sweetheart. Today is yours to build.

The app then shows:

- A confidence-boosting quote.
- A short positive message.
- Like and dislike buttons for quote feedback.
- Optional mood check-in.
- Optional question: "What time did you sleep last night?"

### 6.3 Meal Check-In

At breakfast, lunch, and dinner times, the app sends a notification:

> Is it your breakfast time?

The user can choose:

- Yes, log my meal.
- Not now, remind me later.
- Change today's meal time.
- Skip this meal.

If the user logs a meal, the app asks:

- What did you have?
- Upload or take a photo of the meal.
- How hungry were you before eating?
- How full are you after eating?
- Optional notes.

### 6.4 Custom Meal Time Flow

If the user says it is not their meal time, the app asks:

> When are you planning to have this meal?

The user enters a new time. The app updates only that day's reminder unless the user chooses:

- Update only today.
- Make this my regular meal time.

### 6.5 Water Intake Flow

Throughout the day, the user can add water intake quickly:

- +100 ml
- +250 ml
- +500 ml
- Custom amount
- Increase/decrease stepper controls for precise adjustment.

At the end of the day, the app compares total water intake against the user's goal.

### 6.6 Sleep Check-In

The app asks:

- What time did you sleep last night?
- What time did you wake up?
- How many hours did you sleep?
- How was your sleep quality?

Sleep duration should support increase/decrease controls so users can quickly adjust sleep hours and minutes without typing.

Sleep quality options:

- Great
- Okay
- Poor

### 6.7 End-of-Day Summary

At night, the app shows a daily summary:

- Meals logged.
- Meal photos.
- Water intake vs goal.
- Sleep duration.
- Mood check-in if available.
- Quote feedback.
- Small encouraging message.
- Tomorrow's focus suggestion.

Example:

> You logged 3 meals, reached 85% of your water goal, and slept 6h 45m. Tomorrow, try drinking one glass of water before lunch. Small wins count.

## 7. Main Features

### 7.1 Smart Notifications

The app should send reminders for:

- Morning quote.
- Breakfast.
- Lunch.
- Dinner.
- Water intake nudges.
- Sleep check-in.
- End-of-day summary.

Notification behavior:

- Notifications must be friendly and short.
- Users can snooze reminders.
- Users can disable individual reminder types.
- Users can change meal times anytime.
- If browser notifications are blocked, the app should show in-app reminders.

### 7.2 Meal Logging

Each meal log should include:

- Meal type: breakfast, lunch, dinner, snack.
- Food description.
- Meal photo.
- Meal time.
- Optional hunger level.
- Optional fullness level.
- Optional mood.
- Optional notes.

Image upload requirements:

- Allow camera capture on mobile.
- Allow file upload on desktop.
- Show image preview before saving.
- Compress large images for faster upload.

### 7.3 Hydration Tracking

The app should:

- Let users set a daily water goal.
- Provide quick-add water buttons.
- Provide increase/decrease controls for current intake and daily goal adjustment.
- Show progress using a visual water meter.
- Send gentle reminders if the user is behind.
- Celebrate when the user reaches the goal.

### 7.4 Morning Motivation

Every morning, the app should show:

- Greeting using user's name or nickname.
- Motivational quote.
- Short confidence-building message.
- Like/dislike feedback.

Quote feedback should improve future quote selection.

### 7.5 Sleep Tracking

The app should:

- Ask sleep time.
- Ask wake-up time.
- Let users adjust sleep hours and minutes using increase/decrease controls.
- Calculate approximate sleep duration.
- Let user rate sleep quality.
- Show sleep trends over time.

### 7.6 Daily Review

At the end of each day, the app should show:

- Meal completion status.
- Water progress.
- Sleep data.
- Mood data if available.
- A simple wellness score.
- One personalized suggestion for tomorrow.

### 7.7 Streaks and Rewards

To keep users motivated, the app should include:

- Meal logging streak.
- Water goal streak.
- Sleep check-in streak.
- Weekly achievement badges.
- Gentle recovery messages when streaks are missed.

The app should avoid making users feel guilty.

### 7.8 Weekly Insights

The app should generate a weekly report showing:

- Most consistent meal time.
- Missed meal patterns.
- Average water intake.
- Average sleep duration.
- Best habit of the week.
- One improvement suggestion.

### 7.9 Profile and Preferences

Users should be able to edit:

- Name.
- Meal times.
- Wake-up time.
- Sleep reminder time.
- Water goal.
- Notification settings.
- Theme preference.
- Measurement unit: ml, liters, or ounces.

## 8. Suggested Extra Features

These additions would make the application stronger:

- Snack tracking.
- Mood before and after meals.
- Energy level check-in.
- Menstrual cycle or wellness notes as an optional private tracker.
- Medication or supplement reminder.
- Weekly PDF health summary export.
- AI-powered meal description from image in a future version.
- Family/caregiver mode for elderly users.
- Offline mode with sync when internet returns.
- Private journal section.
- Voice input for quick meal logging.
- Dark mode.
- Multi-language support.

## 9. Screens and Pages

### 9.1 Dashboard

The dashboard should show:

- Today's date.
- Greeting.
- Next upcoming reminder.
- Meal cards for breakfast, lunch, dinner.
- Water progress.
- Sleep status.
- Daily wellness score.

### 9.2 Meal Log Screen

The meal log screen should include:

- Meal type.
- Time.
- Food text input.
- Image upload/camera capture.
- Hunger/fullness selectors.
- Save button.

### 9.3 Water Tracker Screen

The water tracker should include:

- Daily goal.
- Current intake.
- Quick-add buttons.
- Plus and minus controls to increase or decrease logged water.
- Plus and minus controls to adjust the daily water target.
- Progress visual.
- History chart.

### 9.4 Sleep Screen

The sleep screen should include:

- Sleep time input.
- Wake-up time input.
- Sleep hours and minutes stepper with increase/decrease buttons.
- Sleep quality buttons.
- Sleep duration summary.
- Weekly sleep trend.

### 9.5 Quote Feedback Screen

The quote screen should include:

- Morning greeting.
- Quote.
- Like/dislike buttons.
- Optional "show another quote" action.

### 9.6 Insights Screen

The insights screen should include:

- Daily summary.
- Weekly trend cards.
- Habit streaks.
- Personalized suggestions.

### 9.7 Settings Screen

The settings screen should include:

- Profile details.
- Meal schedule.
- Notification settings.
- Water goal.
- Privacy settings.
- Data export/delete options.

## 10. Notification Schedule

Default schedule:

- Morning greeting: user wake-up time.
- Breakfast: user breakfast time.
- Lunch: user lunch time.
- Dinner: user dinner time.
- Water reminder: every 2 to 3 hours during waking hours.
- Sleep check-in: 30 minutes before usual sleep time or next morning.
- End-of-day summary: 1 hour before usual sleep time.

The user must be able to customize all times.

## 11. Data Model

### User

- id
- name
- email
- wakeUpTime
- usualSleepTime
- breakfastTime
- lunchTime
- dinnerTime
- waterGoal
- notificationPreferences
- createdAt
- updatedAt

### MealLog

- id
- userId
- mealType
- scheduledTime
- actualTime
- foodDescription
- imageUrl
- hungerLevel
- fullnessLevel
- mood
- notes
- skipped
- createdAt

### WaterLog

- id
- userId
- amount
- unit
- loggedAt

### SleepLog

- id
- userId
- sleepTime
- wakeTime
- durationMinutes
- quality
- notes
- createdAt

### QuoteLog

- id
- userId
- quoteText
- quoteAuthor
- feedback
- shownAt

### DailySummary

- id
- userId
- date
- mealsLogged
- waterTotal
- waterGoalMet
- sleepDuration
- sleepQuality
- wellnessScore
- suggestion

## 12. Functional Requirements

- Users can create and edit their profile.
- Users can set meal reminder times.
- Users can receive browser notifications.
- Users can snooze meal reminders.
- Users can change meal time for today or permanently.
- Users can log meals with text and images.
- Users can view today's meal history.
- Users can track water intake.
- Users can log sleep time and sleep quality.
- Users can receive a morning quote.
- Users can like or dislike quotes.
- Users can view daily and weekly summaries.
- Users can edit or delete their logs.
- Users can export their data.
- Users can delete their account and data.

## 13. Non-Functional Requirements

- The app should work well on mobile and desktop.
- The app should be fast on slow networks.
- The app should protect personal health data.
- Images should be optimized before upload.
- The UI should be accessible with keyboard and screen readers.
- Notifications should respect user preferences.
- The app should have graceful fallbacks if notifications are disabled.
- User data should be backed up securely.

## 14. Privacy and Safety

Because this app handles personal health habits, privacy matters.

Requirements:

- Store user data securely.
- Do not share meal photos or health data without consent.
- Provide clear privacy settings.
- Allow users to delete data permanently.
- Avoid medical claims.
- Add disclaimer: "This app is for habit tracking and wellness support, not medical advice."

## 15. UX Tone

The app should feel:

- Kind.
- Encouraging.
- Calm.
- Personal.
- Confident.
- Non-judgmental.

Avoid language like:

- "You failed."
- "Bad meal."
- "Unhealthy choice."
- "You broke your streak."

Use language like:

- "Let's try again tomorrow."
- "Small steps still count."
- "You showed up today."
- "One better choice is progress."

## 16. Success Metrics

Product success can be measured by:

- Daily active users.
- Meal log completion rate.
- Water goal completion rate.
- Notification response rate.
- Quote like/dislike engagement.
- Weekly retention.
- Number of users completing daily summaries.
- Average streak length.

## 17. MVP Scope

The first version should include:

- User onboarding.
- Custom meal times.
- Browser notifications.
- Breakfast/lunch/dinner check-ins.
- Meal logging with image upload.
- "Not my meal time" reschedule option.
- Water intake tracker.
- Morning quote with like/dislike.
- Sleep time question.
- End-of-day summary.
- Basic dashboard.
- Settings page.

## 18. Future Roadmap

### Phase 2

- Weekly insights.
- Streaks and badges.
- Mood and energy trends.
- Better notification personalization.
- Data export.

### Phase 3

- AI meal image recognition.
- AI-generated habit coaching.
- Wearable device integration.
- Multi-language support.
- Family or caregiver mode.

### Phase 4

- Nutrition recommendations.
- Meal planning.
- Grocery suggestions.
- Integration with fitness apps.

## 19. Recommended Tech Stack

Suggested stack for a modern web app:

- Frontend: Next.js or React.
- Styling: Tailwind CSS.
- Backend: Next.js API routes, Express, or NestJS.
- Database: PostgreSQL with Prisma.
- Authentication: Clerk, Supabase Auth, or NextAuth.
- File storage: Supabase Storage, Cloudinary, or S3.
- Notifications: Web Push API.
- Charts: Recharts.
- Deployment: Vercel.

## 20. Acceptance Criteria

The MVP is complete when:

- A new user can complete onboarding.
- The app sends or displays meal reminders at the configured times.
- The user can say "not now" and enter a new meal time.
- The user can log a meal with text and an image.
- The user can add, increase, and decrease water intake and see daily progress.
- The user receives a morning quote and can like/dislike it.
- The user can enter sleep time and adjust sleep hours using increase/decrease controls.
- The user can view an end-of-day summary.
- The app works smoothly on mobile and desktop.

## 21. Example App Personality

Morning message:

> Good morning, sweetheart. You do not need to be perfect today. Just be brave enough to begin.

Meal reminder:

> Is this your lunch time?

Water reminder:

> A small water break would be good right now.

End-of-day message:

> You made it through today. Let's carry one small win into tomorrow.

## 22. Product Decisions

- The MVP should require account login.
- Meal photos should be stored in the database-backed storage system, and users should be able to view their saved images in the app.
- Calorie tracking is not required in the MVP and can be decided later.
- Users should be able to share progress with a friend or family member.
- The quote generation approach should be decided later. Add a reminder to revisit whether quotes should be generated dynamically or selected from a curated quote library.
- The app should be designed as a mobile-first PWA.
