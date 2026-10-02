import { reminderEnabled, reminderPreferences, type ReminderPreferences } from "@/lib/reminder-preferences";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getMorningQuoteText } from "@/lib/morning-quotes";
import { claimDeviceReminder, finishDeviceReminder, dueMedicineDate } from "@/lib/reminder-delivery";
import { sendSafePushNotification } from "@/lib/push-server";

type MealType = "breakfast" | "lunch" | "dinner";

type HealthSnapshotRow = {
  user_id: string | null;
  date: string;
  quote_index: number | null;
  profile: {
    wakeTime?: string;
    breakfastTime?: string;
    lunchTime?: string;
    dinnerTime?: string;
    sleepReminder?: string;
    timezone?: string;
    reminderPreferences?: ReminderPreferences;
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

type MedicineScheduleRow = {
  id: string;
  user_id: string;
  schedule_time: string;
  timezone: string;
  food_rule: "with_food" | "before_food" | "none";
};

const SUBSCRIPTION_PAGE_SIZE = 500;

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

type ReminderCandidate = DueReminder & {
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

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Cron secret is not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = process.env;
  if (!url || !key || !publicKey || !privateKey) return NextResponse.json({ error: "Missing scheduler configuration." }, { status: 503 });
  const db = createClient(url, key);
  const runId = crypto.randomUUID();
  const started = Date.now();
  const now = new Date();
  let sent = 0;
  let skipped = 0;
  let checked = 0;
  const failures: string[] = [];
  const ensureTime = () => { if (Date.now() - started > 20_000) throw new Error("Scheduler batch deadline reached; remaining work will retry on the next run."); };
  try {
    const { error: runError } = await db.from("reminder_scheduler_runs").insert({ id: runId, status: "running" });
    if (runError) throw new Error(`Scheduler heartbeat: ${runError.message}`);
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@health-monitor-amber.vercel.app", publicKey, privateKey);
    const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
    for (let offset = 0; ; offset += SUBSCRIPTION_PAGE_SIZE) {
      ensureTime();
      const { data, error } = await db.from("push_subscriptions").select("id,user_id,subscription").order("id").range(offset, offset + SUBSCRIPTION_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as PushSubscriptionRow[]) subscriptionsByUser.set(row.user_id, [...(subscriptionsByUser.get(row.user_id) ?? []), row]);
      if ((data?.length ?? 0) < SUBSCRIPTION_PAGE_SIZE) break;
    }
    const deliver = async (userId: string, reminderKey: string, payload: { title: string; body: string; url: string }) => {
      for (const sub of subscriptionsByUser.get(userId) ?? []) {
        ensureTime();
        const token = await claimDeviceReminder(db, userId, sub.id, reminderKey);
        if (!token) { skipped++; continue; }
        let sendError: unknown;
        try {
          await sendSafePushNotification(sub.subscription, JSON.stringify({ ...payload, tag: reminderKey, icon: "/icon-192.png", badge: "/badge-72.png" }));
        } catch (error) { sendError = error; }
        if (sendError) {
          const status = typeof sendError === "object" && "statusCode" in sendError ? Number(sendError.statusCode) : 0;
          if (status === 404 || status === 410) {
            const { error } = await db.from("push_subscriptions").delete().eq("id", sub.id);
            if (error) throw new Error(`Stale device cleanup failed: ${error.message}`);
            subscriptionsByUser.set(userId, (subscriptionsByUser.get(userId) ?? []).filter((device) => device.id !== sub.id));
          } else {
            await finishDeviceReminder(db, sub.id, reminderKey, token, sendError instanceof Error ? sendError.message : "Push failed");
            failures.push(`Device ${sub.id}: push failed (${status || "network"}).`);
          }
        } else {
          await finishDeviceReminder(db, sub.id, reminderKey, token);
          sent++;
        }
      }
    };
    const latestByUser = new Map<string, HealthSnapshotRow>();
    const userIds = [...subscriptionsByUser.keys()];
    for (let offset = 0; offset < userIds.length; offset += 500) {
      ensureTime();
      const { data, error } = await db.rpc("latest_reminder_snapshots", { p_user_ids: userIds.slice(offset, offset + 500) });
      if (error) throw new Error(`Latest schedules: ${error.message}`);
      for (const snapshot of (data ?? []) as HealthSnapshotRow[]) {
        if (!snapshot.user_id) continue;
        latestByUser.set(snapshot.user_id, snapshot);
        checked++;
        const set = getReminderCandidates(snapshot, now);
        for (const reminder of getDueRemindersFromCandidates(set.candidates, set.localNow.minutes)) {
          await deliver(snapshot.user_id, `${reminder.localDate}-${reminder.deliveryKey}`, reminder);
        }
      }
    }
    for (let offset = 0; ; offset += SUBSCRIPTION_PAGE_SIZE) {
      ensureTime();
      const { data, error } = await db.from("medicines").select("id,user_id,schedule_time,timezone,food_rule").eq("active", true).order("id").range(offset, offset + SUBSCRIPTION_PAGE_SIZE - 1);
      if (error) throw new Error(`Medicine schedules: ${error.message}`);
      for (const medicine of (data ?? []) as MedicineScheduleRow[]) {
        if (!subscriptionsByUser.has(medicine.user_id) || !reminderEnabled(latestByUser.get(medicine.user_id)?.profile?.reminderPreferences, "medicine", "")) continue;
        let date: string | null;
        try {
          date = dueMedicineDate(now, medicine.timezone, medicine.schedule_time, getReminderWindowMinutes());
        } catch {
          failures.push(`Medicine ${medicine.id}: invalid schedule; update its timezone.`);
          continue;
        }
        if (!date) continue;
        const { data: dose, error: doseError } = await db.from("medicine_doses").select("status").eq("medicine_id", medicine.id).eq("scheduled_date", date).maybeSingle();
        if (doseError) throw new Error(`Medicine dose: ${doseError.message}`);
        if (dose?.status === "taken" || dose?.status === "skipped") continue;
        await deliver(medicine.user_id, `${date}-${medicine.id}-medicine`, { title: "Medicine check-in", body: medicine.food_rule === "with_food" ? "Have you had a meal for your medicine? Open your checklist." : "It's time for your scheduled medicine. Open your checklist.", url: "/medicines" });
      }
      if ((data?.length ?? 0) < SUBSCRIPTION_PAGE_SIZE) break;
    }
    // Persisted snoozes remain available for retries for 30 minutes after due time.
    const { data: snoozes, error: snoozeError } = await db.from("reminder_snoozes").select("id,user_id,meal_type,due_at").lte("due_at", now.toISOString()).gte("due_at", new Date(now.getTime() - 30 * 60_000).toISOString()).order("due_at").limit(500);
    if (snoozeError) throw new Error(`Snoozes: ${snoozeError.message}`);
    for (const snooze of snoozes ?? []) {
      const snapshot = latestByUser.get(snooze.user_id);
      if (!reminderEnabled(snapshot?.profile?.reminderPreferences, snooze.meal_type, "")) continue;
      const localDate = snapshot ? getLocalDateParts(now, snapshot.profile?.timezone || "UTC").date : null;
      const meal = snapshot?.date === localDate ? snapshot.meals?.find((item) => item.type === snooze.meal_type) : null;
      if (meal?.status === "logged" || meal?.status === "skipped") continue;
      await deliver(snooze.user_id, `snooze-${snooze.id}-${snooze.due_at}`, { title: `Your ${snooze.meal_type} check-in`, body: "Tap to log your meal.", url: `/meals?meal=${snooze.meal_type}` });
    }
    if (failures.length) throw new Error(`${failures.length} reminder error(s); inspect failures before retrying.`);
    // Bound operational-history storage; expired reminders are never replayed.
    const retention = new Date(now.getTime() - 30 * 86400000).toISOString();
    for (const [table, column] of [["reminder_scheduler_runs", "started_at"], ["device_reminder_deliveries", "updated_at"], ["reminder_snoozes", "due_at"]]) {
      const { error } = await db.from(table).delete().lt(column, retention);
      if (error) throw new Error(`Reminder retention: ${error.message}`);
    }
    const { error: finishError } = await db.from("reminder_scheduler_runs").update({ status: "complete", finished_at: new Date().toISOString(), accepted: sent }).eq("id", runId);
    if (finishError) throw new Error(`Scheduler result: ${finishError.message}`);
    return NextResponse.json({ sent, skipped, failures: [], diagnostics: { now: now.toISOString(), snapshotsChecked: checked, subscribedUsers: subscriptionsByUser.size, reminderWindowMinutes: getReminderWindowMinutes() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduler failed";
    await db.from("reminder_scheduler_runs").update({ status: "failed", finished_at: new Date().toISOString(), accepted: sent, error: message.slice(0, 500) }).eq("id", runId);
    return NextResponse.json({ sent, skipped, error: message, failures: failures.slice(0, 10) }, { status: 503 });
  }
}

function getReminderCandidates(snapshot: HealthSnapshotRow, now: Date) {
  const profile = snapshot.profile ?? {};
  const localNow = getLocalDateParts(now, profile.timezone || "UTC");
  const isMonday = reminderPreferences(profile.reminderPreferences).monday && new Date(`${localNow.date}T12:00:00Z`).getUTCDay() === 1;
  const mealsForToday = snapshot.date === localNow.date ? snapshot.meals : null;
  const dailySnapshot = { ...snapshot, meals: mealsForToday };

  const candidates: ReminderCandidate[] = [
    {
      kind: "morning",
      time: profile.wakeTime ?? "",
      deliveryKey: `morning-${profile.wakeTime ?? ""}`,
      localDate: localNow.date,
      title: isMonday ? "Monday health check-in" : "Good morning",
      body: isMonday
        ? "Please be healthy. I'm here to help you out."
        : getMorningQuoteText(snapshot.quote_index ?? 0),
      url: "/morning",
      sendUntilMinutes: getSegmentEndMinutes(profile.wakeTime, profile.breakfastTime),
    },
    ...getMealReminderCandidates(dailySnapshot, profile, localNow.date),
    {
      kind: "sleep",
      time: profile.sleepReminder ?? "",
      deliveryKey: `sleep-${profile.sleepReminder ?? ""}`,
      localDate: localNow.date,
      title: "Sleep check-in",
      body: "Tap to enter when you slept and protect tomorrow's energy.",
      url: "/",
      sendUntilMinutes: 1439,
    },
  ];

  return { localNow, candidates: candidates.filter(reminder => reminderEnabled(profile.reminderPreferences, reminder.kind, localNow.date)) };
}

function getDueRemindersFromCandidates(
  candidates: ReminderCandidate[],
  currentLocalMinutes: number,
): DueReminder[] {
  return candidates
    .filter((reminder) =>
      isWithinCronWindow(reminder.time, currentLocalMinutes, reminder.sendUntilMinutes),
    )
    .map(({ status: _status, ...reminder }) => reminder);
}

function getMealReminderCandidates(
  snapshot: HealthSnapshotRow,
  profile: NonNullable<HealthSnapshotRow["profile"]>,
  localDate: string,
): ReminderCandidate[] {
  const mealCopy: Record<MealType, { title: string; body: string }> = {
    breakfast: {
      title: "Breakfast check-in",
      body: "A moment for breakfast? Tap to check in.",
    },
    lunch: {
      title: "Lunch check-in",
      body: "Ready for lunch? Tap to check in.",
    },
    dinner: {
      title: "Dinner check-in",
      body: "A moment for dinner? Tap to check in.",
    },
  };

  return (["breakfast", "lunch", "dinner"] as MealType[])
    .map((type) => {
      const meal = snapshot.meals?.find((item) => item.type === type);
      const time = meal?.plannedTime ?? profile[`${type}Time` as "breakfastTime" | "lunchTime" | "dinnerTime"] ?? "";

      return {
        kind: type,
        time,
        deliveryKey: `${type}-${time}`,
        localDate,
        title: mealCopy[type].title,
        body: mealCopy[type].body,
        url: `/meals?meal=${type}`,
        status: meal?.status,
        sendUntilMinutes: getMealSegmentEndMinutes(type, profile, time),
      };
    })
    // Persisted snoozes have their own delivery key and retry window.
    .filter((reminder) => reminder.status !== "logged" && reminder.status !== "skipped" && reminder.status !== "snoozed");
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
  return Math.min(180, Math.max(MIN_REMINDER_WINDOW_MINUTES, value));
}

function getMealSegmentEndMinutes(
  type: MealType,
  profile: NonNullable<HealthSnapshotRow["profile"]>,
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
      hourCycle: "h23",
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
      hourCycle: "h23",
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
