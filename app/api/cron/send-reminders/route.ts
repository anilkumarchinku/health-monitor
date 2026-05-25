import { NextResponse } from "next/server";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getMorningQuoteText } from "@/lib/morning-quotes";

type MealType = "breakfast" | "lunch" | "dinner";

type HealthSnapshotRow = {
  user_id: string | null;
  quote_index: number | null;
  profile: {
    wakeTime?: string;
    breakfastTime?: string;
    lunchTime?: string;
    dinnerTime?: string;
    sleepReminder?: string;
    timezone?: string;
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

type ReminderKind = MealType | "morning" | "sleep";

type DueReminder = {
  kind: ReminderKind;
  time: string;
  deliveryKey: string;
  localDate: string;
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
  const earliestDate = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: snapshots, error: snapshotError } = await supabase
    .from("health_snapshots")
    .select("user_id, profile, meals, quote_index")
    .not("user_id", "is", null)
    .gte("date", earliestDate);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let snapshotsChecked = 0;
  let dueReminders = 0;
  let subscriptionsFound = 0;
  const failures: string[] = [];

  for (const snapshot of (snapshots ?? []) as HealthSnapshotRow[]) {
    if (!snapshot.user_id) continue;
    snapshotsChecked += 1;

    const reminders = getDueReminders(snapshot, now);
    if (reminders.length === 0) {
      skipped += 1;
      continue;
    }
    dueReminders += reminders.length;

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, subscription")
      .eq("user_id", snapshot.user_id);
    subscriptionsFound += subscriptions?.length ?? 0;

    if (!subscriptions || subscriptions.length === 0) {
      skipped += reminders.length;
      continue;
    }

    for (const reminder of reminders) {
      const shouldSend = await reserveReminder(
        supabase,
        snapshot.user_id,
        reminder.localDate,
        reminder.kind,
        reminder.deliveryKey,
      );
      if (!shouldSend) continue;

      let reminderSent = 0;
      await Promise.all(
        ((subscriptions ?? []) as PushSubscriptionRow[]).map(async (subscriptionRow) => {
          try {
            await webpush.sendNotification(
              subscriptionRow.subscription,
              JSON.stringify({
                title: reminder.title,
                body: reminder.body,
                url: reminder.url,
                tag: `${reminder.localDate}-${reminder.kind}-reminder`,
                icon: "/icon-192.png",
                badge: "/badge-72.png",
              }),
            );
            sent += 1;
            reminderSent += 1;
          } catch (error) {
            failures.push(`${subscriptionRow.id}: ${error instanceof Error ? error.message : "failed"}`);
          }
        }),
      );

      if (reminderSent === 0) {
        await releaseReminder(supabase, snapshot.user_id, reminder.localDate, reminder.deliveryKey);
      }
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    failures,
    diagnostics: {
      now: now.toISOString(),
      earliestDate,
      snapshotsFetched: snapshots?.length ?? 0,
      snapshotsChecked,
      dueReminders,
      subscriptionsFound,
    },
  });
}

function getDueReminders(snapshot: HealthSnapshotRow, now: Date): DueReminder[] {
  const profile = snapshot.profile ?? {};
  const localNow = getLocalDateParts(now, profile.timezone || "UTC");

  const candidates: DueReminder[] = [
    {
      kind: "morning",
      time: profile.wakeTime ?? "",
      deliveryKey: `morning-${profile.wakeTime ?? ""}`,
      localDate: localNow.date,
      title: "Good morning, sweetheart",
      body: getMorningQuoteText(snapshot.quote_index ?? 0),
      url: "/morning",
    },
    ...getMealReminderCandidates(snapshot, profile, localNow.date),
    {
      kind: "sleep",
      time: profile.sleepReminder ?? "",
      deliveryKey: `sleep-${profile.sleepReminder ?? ""}`,
      localDate: localNow.date,
      title: "Sleep check-in",
      body: "Tap to enter when you slept and protect tomorrow's energy.",
      url: "/",
    },
  ];

  return candidates.filter((reminder) => isWithinCronWindow(reminder.time, localNow.minutes));
}

function getMealReminderCandidates(
  snapshot: HealthSnapshotRow,
  profile: NonNullable<HealthSnapshotRow["profile"]>,
  localDate: string,
): DueReminder[] {
  const mealCopy: Record<MealType, { title: string; body: string }> = {
    breakfast: {
      title: "You are late for breakfast",
      body: "Tap to log breakfast and your water from morning.",
    },
    lunch: {
      title: "You are late for lunch",
      body: "Tap to capture your lunch and check in.",
    },
    dinner: {
      title: "You are late for dinner",
      body: "Tap to log dinner and finish strong.",
    },
  };

  return (["breakfast", "lunch", "dinner"] as MealType[])
    .map((type) => {
      const meal = snapshot.meals?.find((item) => item.type === type);
      const time = meal?.plannedTime ?? profile[`${type}Time` as keyof typeof profile] ?? "";

      return {
        kind: type,
        time,
        deliveryKey: `${type}-${time}`,
        localDate,
        title: mealCopy[type].title,
        body: mealCopy[type].body,
        url: "/meal/lunch",
        status: meal?.status,
      };
    })
    .filter((reminder) => reminder.status !== "logged" && reminder.status !== "skipped")
    .map(({ status: _status, ...reminder }) => reminder);
}

function isWithinCronWindow(time: string, currentLocalMinutes: number) {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;

  const [hour, minute] = time.split(":").map(Number);
  const targetMinutes = hour * 60 + minute;
  const diff = currentLocalMinutes - targetMinutes;

  const windowMinutes = Number(process.env.REMINDER_WINDOW_MINUTES ?? 10);

  return diff >= 0 && diff < Math.max(1, windowMinutes);
}

function getLocalDateParts(date: Date, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
  }

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: hour * 60 + minute,
  };
}

async function reserveReminder(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  kind: ReminderKind,
  deliveryKey: string,
) {
  const { error } = await supabase.from("reminder_deliveries").insert({
    user_id: userId,
    date,
    kind,
    reminder_key: deliveryKey,
  });

  if (error && error.message.toLowerCase().includes("reminder_key")) {
    const { error: fallbackError } = await supabase.from("reminder_deliveries").insert({
      user_id: userId,
      date,
      kind,
    });

    return !fallbackError;
  }

  return !error;
}

async function releaseReminder(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  deliveryKey: string,
) {
  await supabase
    .from("reminder_deliveries")
    .delete()
    .eq("user_id", userId)
    .eq("date", date)
    .eq("reminder_key", deliveryKey);
}
