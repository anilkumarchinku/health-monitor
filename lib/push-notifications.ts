"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncCurrentLocalStateToSupabase } from "@/lib/health-sync";

type PushStatus =
  | "unsupported"
  | "blocked"
  | "enabled"
  | "not-enabled"
  | "signed-out"
  | "not-configured"
  | "ios-install-required";

type DeeNotificationOptions = NotificationOptions & {
  vibrate?: number[];
  badge?: string;
};

export type NotificationDoctorReport = {
  ok?: boolean;
  blockers?: string[];
  checks?: {
    hasSnapshot?: boolean;
    hasMedicineSchedule?: boolean;
    schedulerFresh?: boolean;
    hasSubscription?: boolean;
    hasVapid?: boolean;
    hasDueReminderNow?: boolean;
  };
  counts?: {
    snapshots?: number;
    subscriptions?: number;
    recentDeliveries?: number;
  };
  latestSnapshot?: {
    date?: string;
    updatedAt?: string | null;
    localNow?: {
      date?: string;
      time?: string;
      timezone?: string;
    };
    reminderWindowMinutes?: number;
    dueNow?: unknown[];
    reminders?: {
      kind?: string;
      time?: string;
      status?: string;
      windowStatus?: string;
      minutesUntil?: number;
      minutesLate?: number;
      expiresIn?: number;
      expiredBy?: number;
    }[];
  } | null;
  subscriptions?: unknown[];
  recentDeliveries?: unknown[];
  error?: string;
};

const localReminderTimers = new Map<string, number>();

export async function enablePushNotifications(): Promise<PushStatus> {
  if (isIosDevice() && !isStandaloneApp()) {
    return "ios-install-required";
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "blocked";

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return "not-configured";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "signed-out";
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return "signed-out";

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return "not-configured";

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe().catch(() => undefined);
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subscribeResponse = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      subscription,
    }),
  });

  if (!subscribeResponse.ok) return "not-configured";

  await syncCurrentLocalStateToSupabase();

  const enabledOptions: DeeNotificationOptions = {
    body: "I will remind you for meals, water, sleep, and confidence boosts.",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    vibrate: [180, 90, 180],
    silent: false,
    tag: "notifications-enabled",
    data: {
      url: "/",
    },
  };

  await registration.showNotification("Notifications enabled", enabledOptions);

  return "enabled";
}

export async function getPushNotificationStatus(): Promise<PushStatus> {
  if (isIosDevice() && !isStandaloneApp()) {
    return "ios-install-required";
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "not-enabled";

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return "not-enabled";

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return "not-configured";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "signed-out";

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("endpoint", subscription.endpoint)
    .limit(1);

  if (error) return "not-configured";

  return data?.length ? "enabled" : "not-enabled";
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export async function sendTestPushNotification() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return "not-configured";

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return "signed-out";

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return "no-subscription";

  const response = await fetch("/api/push/test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
    }),
  });
  const payload = (await response.json().catch(() => null)) as { sent?: number } | null;

  if (response.status === 404 || payload?.sent === 0) return "no-subscription";

  return response.ok && (payload?.sent ?? 0) > 0 ? "sent" : "failed";
}

export async function checkNotificationDoctor() {
  const payload = await fetchNotificationDoctor();

  if (!payload) return "Doctor check failed";
  if (payload.ok) return "Notifications ready";
  if (payload.blockers?.[0]?.includes("snapshot")) return "No saved schedule";
  if (payload.blockers?.[0]?.includes("subscription")) return "No saved device";
  if (payload.blockers?.[0]?.includes("send window")) return "Saved, waiting for time";
  return payload.blockers?.[0] ?? payload.error ?? "Check notification setup";
}

export async function fetchNotificationDoctor() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Sign in first" } satisfies NotificationDoctorReport;

  const response = await fetch("/api/notifications/doctor", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as NotificationDoctorReport | null;

  if (!payload) return null;
  return payload;
}

// Scheduled reminders are delivered by the server even when the app is closed.
// Clear legacy page timers on each state change so logged/skipped meals cannot fire.
function clearLocalReminderTimers() {
  for (const timer of localReminderTimers.values()) window.clearTimeout(timer);
  localReminderTimers.clear();
}

export async function scheduleTodayLocalMealReminders(_meals: { type: string; plannedTime: string; status: string }[]) {
  clearLocalReminderTimers();
}

export async function scheduleTodayLocalRoutineReminders(_schedule: {
  meals: { type: string; plannedTime: string; status: string }[];
  wakeTime?: string;
  sleepReminder?: string;
  quoteIndex?: number;
}) {
  clearLocalReminderTimers();
}

export async function scheduleMealSnoozeReminder({ mealType, delayMinutes }: { mealType: string; delayMinutes: number }) {
  const supabase = createSupabaseBrowserClient();
  const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } };
  if (!session) throw new Error("Sign in to save a reminder that works when the app is closed.");
  const response = await fetch("/api/notifications/snooze", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mealType, delayMinutes }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not save your snooze.");
  return result as { ok: true; dueAt: string };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
