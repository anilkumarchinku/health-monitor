"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { TodayView } from "@/components/today-view";
import { HealthSyncStatus } from "@/components/sync-status";
import { useDailyHealth } from "@/components/use-daily-health";
import { formatTime, type MealType } from "@/lib/daily-health";
import { scheduleMealSnoozeReminder } from "@/lib/push-notifications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function HomePage() {
  const { state, busy, error, update, reload } = useDailyHealth();
  const [message, setMessage] = useState("");
  const [medicineSummary, setMedicineSummary] = useState("View your daily checklist");
  const [snoozing, setSnoozing] = useState(false);
  const ready = Boolean(state);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const db = createSupabaseBrowserClient();
    void (async () => {
      const user = (await db?.auth.getUser())?.data.user;
      if (!db || !user) return;
      const result = await db.from("medicines").select("id").eq("user_id", user.id).eq("active", true);
      if (alive && !result.error) setMedicineSummary(result.data.length ? `${result.data.length} active ${result.data.length === 1 ? "medicine" : "medicines"} · Open checklist` : "Set up your first medicine");
    })().catch(() => {});
    return () => { alive = false; };
  }, [ready]);
  async function snooze(mealType: MealType, minutes: number) {
    if (!state || snoozing) return false;
    setSnoozing(true); setMessage("");
    try {
      await scheduleMealSnoozeReminder({ mealType, delayMinutes: minutes });
      const plannedTime = new Intl.DateTimeFormat("en-GB", { timeZone: state.profile.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + minutes * 60000));
      const saved = await update({ meals: state.meals.map(meal => meal.type === mealType ? { ...meal, plannedTime, status: "snoozed" } : meal) });
      if (!saved) setMessage(`Reminder scheduled for ${formatTime(plannedTime)}. The meal display could not be updated; reload to check.`);
      return saved;
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Could not move this reminder. Please retry."); return false; }
    finally { setSnoozing(false); }
  }
  return <main className="health-page"><AppNav />
    {(error || message) && <div className="health-content pb-0"><p role="alert" className="health-notice health-error">{error || message} {error && <button className="underline" onClick={() => void reload()}>Retry loading</button>}</p></div>}
    {state ? <TodayView key={state.date} state={state} busy={busy || snoozing} onWater={water => update({ water })} onSnooze={snooze} medicineSummary={medicineSummary} /> : !error && <div className="health-content" role="status">Loading your day…</div>}
    <HealthSyncStatus />
  </main>;
}
