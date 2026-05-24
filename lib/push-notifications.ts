"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMorningQuoteText } from "@/lib/morning-quotes";

type PushStatus = "unsupported" | "blocked" | "enabled" | "signed-out" | "not-configured";

type DeeNotificationOptions = NotificationOptions & {
  vibrate?: number[];
  badge?: string;
};

const mealLabels: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
};

export async function enablePushNotifications(): Promise<PushStatus> {
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

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return "not-configured";

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return "not-configured";

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

export async function sendTestPushNotification() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return "not-configured";

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return "signed-out";

  const response = await fetch("/api/push/test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  return response.ok ? "sent" : "failed";
}

export async function scheduleTodayLocalMealReminders(
  meals: { type: string; plannedTime: string; status: string }[],
) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;

  meals.forEach((meal) => {
    if (meal.status === "logged" || !meal.plannedTime) return;
    const [hour, minute] = meal.plannedTime.split(":").map(Number);
    const reminderAt = new Date();
    reminderAt.setHours(hour, minute, 0, 0);
    const delay = reminderAt.getTime() - Date.now();
    if (delay < 0 || delay > 24 * 60 * 60 * 1000) return;

    window.setTimeout(() => {
      const reminderOptions: DeeNotificationOptions = {
        body: "Tap to capture your meal and check in.",
        icon: "/icon-192.png",
        badge: "/badge-72.png",
        vibrate: [180, 90, 180],
        silent: false,
        tag: `${meal.type}-meal-reminder`,
        data: {
          url: "/meal/lunch",
        },
      };

      void registration.showNotification(
        `You are late for ${mealLabels[meal.type] ?? "your meal"}`,
        reminderOptions,
      );
    }, delay);
  });
}

export async function scheduleTodayLocalRoutineReminders({
  meals,
  wakeTime,
  sleepReminder,
  quoteIndex,
}: {
  meals: { type: string; plannedTime: string; status: string }[];
  wakeTime?: string;
  sleepReminder?: string;
  quoteIndex?: number;
}) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  const reminders = [
    {
      id: "morning",
      time: wakeTime,
      title: "Good morning, sweetheart",
      body: getMorningQuoteText(quoteIndex),
      url: "/",
    },
    ...meals
      .filter((meal) => meal.status !== "logged")
      .map((meal) => ({
        id: meal.type,
        time: meal.plannedTime,
        title: `You are late for ${mealLabels[meal.type] ?? "your meal"}`,
        body: "Tap to capture your meal and check in.",
        url: "/meal/lunch",
      })),
    {
      id: "sleep",
      time: sleepReminder,
      title: "Sleep check-in",
      body: "Tap to enter when you slept and protect tomorrow's energy.",
      url: "/",
    },
  ];

  reminders.forEach((reminder) => {
    if (!reminder.time || !/^\d{2}:\d{2}$/.test(reminder.time)) return;
    const [hour, minute] = reminder.time.split(":").map(Number);
    const reminderAt = new Date();
    reminderAt.setHours(hour, minute, 0, 0);
    const delay = reminderAt.getTime() - Date.now();
    if (delay < 0 || delay > 24 * 60 * 60 * 1000) return;

    window.setTimeout(() => {
      const reminderOptions: DeeNotificationOptions = {
        body: reminder.body,
        icon: "/icon-192.png",
        badge: "/badge-72.png",
        vibrate: [180, 90, 180],
        silent: false,
        tag: `${reminder.id}-routine-reminder`,
        data: {
          url: reminder.url,
        },
      };

      void registration.showNotification(reminder.title, reminderOptions);
    }, delay);
  });
}

export async function scheduleMealSnoozeReminder({
  mealType,
  delayMinutes,
}: {
  mealType: string;
  delayMinutes: number;
}) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  window.setTimeout(() => {
    const reminderOptions: DeeNotificationOptions = {
      body: "Tap to capture your meal and check in.",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      vibrate: [180, 90, 180],
      silent: false,
      tag: `${mealType}-snoozed-meal-reminder`,
      data: {
        url: "/meal/lunch",
      },
    };

    void registration.showNotification(
      `You are late for ${mealLabels[mealType] ?? "your meal"}`,
      reminderOptions,
    );
  }, delayMinutes * 60 * 1000);
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
