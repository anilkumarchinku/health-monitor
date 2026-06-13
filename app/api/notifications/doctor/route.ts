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
  sendUntilMinutes?: number;
};

type ReminderTiming = {
  due: boolean;
  status: "invalid-time" | "future" | "due" | "expired";
  minutesUntil?: number;
  minutesLate?: number;
  expiresIn?: number;
  expiredBy?: number;
};

const DEFAULT_REMINDER_WINDOW_MINUTES = 30;
const MIN_REMINDER_WINDOW_MINUTES = 30;

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
  const reminderWindowMinutes = getReminderWindowMinutes();
  const reminderSet = latestSnapshot ? getReminderCandidates(latestSnapshot, now) : null;
  const due = reminderSet
    ? getDueRemindersFromCandidates(reminderSet.reminders, reminderSet.localNow.minutes)
    : [];
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
          localNow: reminderSet?.localNow ?? getLocalDateParts(now, latestSnapshot.profile?.timezone || "UTC"),
          dueNow: due,
          reminderWindowMinutes,
          reminders: reminderSet?.reminders.map((reminder) => {
            const timing = getReminderTiming(
              reminder.time,
              reminderSet.localNow.minutes,
              reminder.sendUntilMinutes,
            );
            return {
              kind: reminder.kind,
              time: reminder.time,
              status: reminder.status,
              windowStatus: timing.status,
              minutesUntil: timing.minutesUntil,
              minutesLate: timing.minutesLate,
              expiresIn: timing.expiresIn,
              expiredBy: timing.expiredBy,
            };
          }) ?? [],
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
  const reminderSet = getReminderCandidates(snapshot, now);
  return getDueRemindersFromCandidates(reminderSet.reminders, reminderSet.localNow.minutes);
}

function getReminderCandidates(snapshot: SnapshotRow, now: Date) {
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
      sendUntilMinutes: getSegmentEndMinutes(profile.wakeTime, profile.breakfastTime),
    },
    ...(["breakfast", "lunch", "dinner"] as MealType[]).map((type) => {
      const meal = mealsForToday?.find((item) => item.type === type);
      const time = meal?.plannedTime ?? profile[`${type}Time` as keyof typeof profile] ?? "";
      return {
        kind: type,
        time,
        title: mealCopy[type].title,
        body: mealCopy[type].body,
        url: mealCopy[type].url,
        status: meal?.status,
        sendUntilMinutes: getMealSegmentEndMinutes(type, profile, time),
      };
    }),
    {
      kind: "sleep",
      time: profile.sleepReminder ?? "",
      title: "Sleep check-in",
      body: "Tap to enter when you slept and protect tomorrow's energy.",
      url: "/",
      sendUntilMinutes: 1439,
    },
  ];

  return { localNow, reminders };
}

function getDueRemindersFromCandidates(reminders: DoctorReminder[], currentLocalMinutes: number) {
  return reminders.filter(
    (reminder) =>
      reminder.status !== "logged" &&
      reminder.status !== "skipped" &&
      isWithinCronWindow(reminder.time, currentLocalMinutes, reminder.sendUntilMinutes),
  );
}

function isWithinCronWindow(
  time: string,
  currentLocalMinutes: number,
  sendUntilMinutes?: number,
) {
  return getReminderTiming(time, currentLocalMinutes, sendUntilMinutes).due;
}

function getReminderTiming(
  time: string,
  currentLocalMinutes: number,
  sendUntilMinutes?: number,
): ReminderTiming {
  if (!/^\d{2}:\d{2}$/.test(time)) return { due: false, status: "invalid-time" };
  const [hour, minute] = time.split(":").map(Number);
  const targetMinutes = hour * 60 + minute;
  const diff = currentLocalMinutes - targetMinutes;
  const resolvedSendUntilMinutes =
    sendUntilMinutes && sendUntilMinutes > targetMinutes
      ? sendUntilMinutes
      : Math.min(1439, targetMinutes + getReminderWindowMinutes());

  if (diff < 0) {
    return { due: false, status: "future", minutesUntil: Math.abs(diff) };
  }

  if (currentLocalMinutes > resolvedSendUntilMinutes) {
    return {
      due: false,
      status: "expired",
      minutesLate: diff,
      expiredBy: currentLocalMinutes - resolvedSendUntilMinutes,
    };
  }

  return {
    due: true,
    status: "due",
    minutesLate: diff,
    expiresIn: resolvedSendUntilMinutes - currentLocalMinutes,
  };
}

function getReminderWindowMinutes() {
  const value = Number(process.env.REMINDER_WINDOW_MINUTES ?? DEFAULT_REMINDER_WINDOW_MINUTES);
  if (!Number.isFinite(value)) return DEFAULT_REMINDER_WINDOW_MINUTES;
  return Math.max(MIN_REMINDER_WINDOW_MINUTES, value);
}

function getMealSegmentEndMinutes(
  type: MealType,
  profile: NonNullable<SnapshotRow["profile"]>,
  fallbackTime: string,
) {
  if (type === "breakfast") return getSegmentEndMinutes(fallbackTime, profile.lunchTime);
  if (type === "lunch") return getSegmentEndMinutes(fallbackTime, profile.dinnerTime);
  return getSegmentEndMinutes(fallbackTime, profile.sleepReminder);
}

function getSegmentEndMinutes(startTime?: string, endTime?: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null) return undefined;
  if (endMinutes !== null && endMinutes > startMinutes) return endMinutes;

  return Math.min(1439, startMinutes + getReminderWindowMinutes());
}

function parseTimeToMinutes(time?: string) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function getLocalDateParts(date: Date, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  let resolvedTimezone = timezone;
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
    resolvedTimezone = "UTC";
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
    timezone: resolvedTimezone,
    minutes: hour * 60 + minute,
  };
}
