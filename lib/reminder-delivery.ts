import type { SupabaseClient } from "@supabase/supabase-js";

/** Atomic leases prevent concurrent workers sending the same device reminder. */
export async function claimDeviceReminder(db: SupabaseClient, userId: string, subscriptionId: string, key: string) {
  const token = crypto.randomUUID();
  const { data, error } = await db.rpc("claim_device_reminder", {
    p_user_id: userId, p_subscription_id: subscriptionId, p_reminder_key: key, p_token: token,
  });
  if (error) throw new Error(`Reminder claim failed: ${error.message}`);
  return data === true ? token : null;
}

export async function finishDeviceReminder(db: SupabaseClient, subscriptionId: string, key: string, token: string, errorMessage?: string) {
  const { data, error } = await db.from("device_reminder_deliveries").update({
    status: errorMessage ? "retry" : "accepted",
    lease_until: null,
    next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
    last_error: errorMessage?.slice(0, 500) ?? null,
    updated_at: new Date().toISOString(),
  }).eq("subscription_id", subscriptionId).eq("reminder_key", key).eq("lease_token", token).select("subscription_id");
  if (error || !data?.length) throw new Error(`Reminder result could not be recorded: ${error?.message ?? "lease no longer owned"}`);
}

export function localClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, minutes: Number(value("hour")) * 60 + Number(value("minute")) };
}

/** Include yesterday's late-night dose when its retry window crosses midnight. */
export function dueMedicineDate(now: Date, timezone: string, time: string, windowMinutes: number) {
  if (!/^([01]\d|2[0-3]):[0-5]\d/.test(time)) return null;
  const local = localClock(now, timezone); // Invalid zones fail visibly, never silently shift a dose to UTC.
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  const diff = local.minutes - (hour * 60 + minute);
  if (diff >= 0 && diff <= windowMinutes) return local.date;
  if (diff < 0 && diff + 1440 <= windowMinutes) {
    return new Date(Date.parse(`${local.date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }
  return null;
}
