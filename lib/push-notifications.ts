"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PushStatus = "unsupported" | "blocked" | "enabled" | "signed-out" | "not-configured";

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

  await registration.showNotification("Notifications enabled", {
    body: "I will remind you for meals, water, sleep, and confidence boosts.",
    icon: "/icon.svg",
    tag: "notifications-enabled",
  });

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
  const labels: Record<string, string> = {
    breakfast: "breakfast",
    lunch: "lunch",
    dinner: "dinner",
  };

  meals.forEach((meal) => {
    if (meal.status === "logged" || !meal.plannedTime) return;
    const [hour, minute] = meal.plannedTime.split(":").map(Number);
    const reminderAt = new Date();
    reminderAt.setHours(hour, minute, 0, 0);
    const delay = reminderAt.getTime() - Date.now();
    if (delay < 0 || delay > 24 * 60 * 60 * 1000) return;

    window.setTimeout(() => {
      void registration.showNotification(`Is this your ${labels[meal.type] ?? "meal"} time?`, {
        body: "Tap to capture your meal and check in.",
        icon: "/icon.svg",
        tag: `${meal.type}-meal-reminder`,
        data: {
          url: meal.type === "lunch" ? "/meal/lunch" : "/",
        },
      });
    }, delay);
  });
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
