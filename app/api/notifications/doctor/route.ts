import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getMorningQuoteText } from "@/lib/morning-quotes";

type MealType = "breakfast" | "lunch" | "dinner";

type SnapshotRow = {
  date: string;
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
  quote_index: number | null;
  updated_at: string | null;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  subscription: webpush.PushSubscription;
  updated_at: string | null;
};

type DoctorReminder = {
  kind: string;
  time: string;
  title: string;
  body: string;
  url: string;
  status?: string;
};

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  const env = {
    supabaseUrl: Boolean(supabaseUrl),
    publishableKey: Boolean(publishableKey),
    serviceRoleKey: Boolean(serviceRoleKey),
    vapidPublicKey: Boolean(vapidPublicKey),
    vapidPrivateKey: Boolean(vapidPrivateKey),
  };

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, env, error: "Missing Supabase env vars." }, { status: 500 });
  }

  const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ ok: false, env, error: "Missing Supabase access token." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ ok: false, env, error: "Invalid Supabase user session." }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const [snapshotsResult, subscriptionsResult, deliveriesResult] = await Promise.all([
    adminClient
      .from("health_snapshots")
      .select("date, profile, meals, quote_index, updated_at")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(5),
    adminClient
      .from("push_subscriptions")
      .select("id, endpoint, subscription, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    adminClient
      .from("reminder_deliveries")
      .select("date, kind, reminder_key, delivered_at")
      .eq("user_id", user.id)
      .order("delivered_at", { ascending: false })
      .limit(10),
  ]);

  if (snapshotsResult.error || subscriptionsResult.error || deliveriesResult.error) {
    return NextResponse.json(
      {
        ok: false,
        env,
        errors: {
          snapshots: snapshotsResult.error?.message,
          subscriptions: subscriptionsResult.error?.message,
          deliveries: deliveriesResult.error?.message,
        },
      },
      { status: 500 },
    );
  }

  const latestSnapshot = (snapshotsResult.data?.[0] ?? null) as SnapshotRow | null;
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const now = new Date();
  const due = latestSnapshot ? getDueReminders(latestSnapshot, now) : [];
  const checks = {
    hasSnapshot: Boolean(latestSnapshot),
    hasSubscription: subscriptions.length > 0,
    hasVapid: Boolean(vapidPublicKey && vapidPrivateKey),
    hasDueReminderNow: due.length > 0,
  };
  const blockers = [
    !checks.hasSnapshot ? "No health snapshot/schedule saved for this signed-in user." : null,
    !checks.hasSubscription ? "No push subscription saved for this signed-in user/device." : null,
    !checks.hasVapid ? "VAPID push keys are missing on the server." : null,
    !checks.hasDueReminderNow ? "No reminder is currently inside the send window." : null,
  ].filter(Boolean);

  return NextResponse.json({
    ok: blockers.length === 0,
    env,
    user: { id: user.id, email: user.email },
    checks,
    blockers,
    counts: {
      snapshots: snapshotsResult.data?.length ?? 0,
      subscriptions: subscriptions.length,
      recentDeliveries: deliveriesResult.data?.length ?? 0,
    },
    latestSnapshot: latestSnapshot
      ? {
          date: latestSnapshot.date,
          updatedAt: latestSnapshot.updated_at,
          profile: latestSnapshot.profile,
          meals: latestSnapshot.meals,
          localNow: getLocalDateParts(now, latestSnapshot.profile?.timezone || "UTC"),
          dueNow: due,
        }
      : null,
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      endpointPreview: `${subscription.endpoint.slice(0, 48)}...`,
      updatedAt: subscription.updated_at,
    })),
    recentDeliveries: deliveriesResult.data ?? [],
  });
}

function getDueReminders(snapshot: SnapshotRow, now: Date) {
  const profile = snapshot.profile ?? {};
  const localNow = getLocalDateParts(now, profile.timezone || "UTC");
  const mealsForToday = snapshot.date === localNow.date ? snapshot.meals : null;
  const mealCopy: Record<MealType, { title: string; body: string; url: string }> = {
    breakfast: {
      title: "You are late for breakfast",
      body: "Tap to log breakfast and your water from morning.",
      url: "/meal/lunch",
    },
    lunch: {
      title: "You are late for lunch",
      body: "Tap to capture your lunch and check in.",
      url: "/meal/lunch",
    },
    dinner: {
      title: "You are late for dinner",
      body: "Tap to log dinner and finish strong.",
      url: "/meal/lunch",
    },
  };
  const reminders: DoctorReminder[] = [
    {
      kind: "morning",
      time: profile.wakeTime ?? "",
      title: "Good morning, sweetheart",
      body: getMorningQuoteText(snapshot.quote_index ?? 0),
      url: "/morning",
    },
    ...(["breakfast", "lunch", "dinner"] as MealType[]).map((type) => {
      const meal = mealsForToday?.find((item) => item.type === type);
      return {
        kind: type,
        time: meal?.plannedTime ?? profile[`${type}Time` as keyof typeof profile] ?? "",
        title: mealCopy[type].title,
        body: mealCopy[type].body,
        url: mealCopy[type].url,
        status: meal?.status,
      };
    }),
    {
      kind: "sleep",
      time: profile.sleepReminder ?? "",
      title: "Sleep check-in",
      body: "Tap to enter when you slept and protect tomorrow's energy.",
      url: "/",
    },
  ];

  return reminders.filter(
    (reminder) =>
      reminder.status !== "logged" &&
      reminder.status !== "skipped" &&
      isWithinCronWindow(reminder.time, localNow.minutes),
  );
}

function isWithinCronWindow(time: string, currentLocalMinutes: number) {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hour, minute] = time.split(":").map(Number);
  const diff = currentLocalMinutes - (hour * 60 + minute);
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
    time: `${value("hour")}:${value("minute")}`,
    timezone,
    minutes: hour * 60 + minute,
  };
}
