import { NextResponse } from "next/server";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type MealType = "breakfast" | "lunch" | "dinner";

type HealthSnapshotRow = {
  user_id: string | null;
  profile: {
    breakfastTime?: string;
    lunchTime?: string;
    dinnerTime?: string;
    sleepReminder?: string;
  } | null;
  meals:
    | {
        type: MealType;
        plannedTime?: string;
        status?: string;
      }[]
    | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  subscription: webpush.PushSubscription;
};

type ReminderKind = MealType | "sleep";

type DueReminder = {
  kind: ReminderKind;
  time: string;
  title: string;
  body: string;
  url: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: "Missing cron env vars. Add SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, and VAPID keys." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  webpush.setVapidDetails("mailto:hello@daily-health-companion.local", vapidPublicKey, vapidPrivateKey);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: snapshots, error: snapshotError } = await supabase
    .from("health_snapshots")
    .select("user_id, profile, meals")
    .not("user_id", "is", null)
    .eq("date", today);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const snapshot of (snapshots ?? []) as HealthSnapshotRow[]) {
    if (!snapshot.user_id) continue;

    const reminders = getDueReminders(snapshot, now);
    if (reminders.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, subscription")
      .eq("user_id", snapshot.user_id);

    for (const reminder of reminders) {
      const shouldSend = await reserveReminder(supabase, snapshot.user_id, today, reminder.kind);
      if (!shouldSend) continue;

      await Promise.all(
        ((subscriptions ?? []) as PushSubscriptionRow[]).map(async (subscriptionRow) => {
          try {
            await webpush.sendNotification(
              subscriptionRow.subscription,
              JSON.stringify({
                title: reminder.title,
                body: reminder.body,
                url: reminder.url,
                tag: `${today}-${reminder.kind}-reminder`,
              }),
            );
            sent += 1;
          } catch (error) {
            failures.push(`${subscriptionRow.id}: ${error instanceof Error ? error.message : "failed"}`);
          }
        }),
      );
    }
  }

  return NextResponse.json({ sent, skipped, failures });
}

function getDueReminders(snapshot: HealthSnapshotRow, now: Date): DueReminder[] {
  const profile = snapshot.profile ?? {};
  const mealTime = (type: MealType) =>
    snapshot.meals?.find((meal) => meal.type === type)?.plannedTime ??
    profile[`${type}Time` as keyof typeof profile];

  const candidates: DueReminder[] = [
    {
      kind: "breakfast",
      time: mealTime("breakfast") ?? "",
      title: "Is this your breakfast time?",
      body: "Tap to log breakfast and your water from morning.",
      url: "/",
    },
    {
      kind: "lunch",
      time: mealTime("lunch") ?? "",
      title: "Is this your lunch time?",
      body: "Tap to capture your lunch and check in.",
      url: "/meal/lunch",
    },
    {
      kind: "dinner",
      time: mealTime("dinner") ?? "",
      title: "Is this your dinner time?",
      body: "Tap to log dinner and finish strong.",
      url: "/",
    },
    {
      kind: "sleep",
      time: profile.sleepReminder ?? "",
      title: "Sleep check-in",
      body: "Tap to enter when you slept and protect tomorrow's energy.",
      url: "/",
    },
  ];

  return candidates.filter((reminder) => isWithinCronWindow(reminder.time, now));
}

function isWithinCronWindow(time: string, now: Date) {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;

  const [hour, minute] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  const diff = now.getTime() - target.getTime();
  return diff >= 0 && diff < 5 * 60 * 1000;
}

async function reserveReminder(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  kind: ReminderKind,
) {
  const { error } = await supabase.from("reminder_deliveries").insert({
    user_id: userId,
    date,
    kind,
  });

  return !error;
}
