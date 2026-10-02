"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Moon, Pill, Utensils } from "lucide-react";
import { WaterCheckIn } from "@/components/water-check-in";
import { formatTime, mealLabels, nextMeal, type DailyHealth, type MealType } from "@/lib/daily-health";

type Props = { state: DailyHealth; busy: boolean; onWater: (amount: number) => Promise<boolean>; onSnooze: (meal: MealType, minutes: number) => Promise<boolean>; medicineSummary?: string; now?: Date };
export function TodayView({ state, busy, onWater, onSnooze, medicineSummary = "View your daily checklist", now = new Date() }: Props) {
  const [snooze, setSnooze] = useState(false);
  const [notice, setNotice] = useState("");
  const meal = nextMeal(state);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: state.profile.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en", { timeZone: state.profile.timezone, weekday: "long", day: "numeric", month: "long" }).format(now);
  return <div className="health-content">
    <p className="mb-3 text-sm text-muted-foreground">{date}</p>
    <h1 className="health-heading">{greeting}{state.profile.name ? `, ${state.profile.name}` : ""}</h1>
    <p className="health-description">One small step at a time.</p>
    <section className="next-action mt-7" aria-labelledby="next-action-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{meal ? "Up next · Meals" : "Meals · All checked in"}</p>
          <h2 id="next-action-title" className="mt-4 text-[28px] font-bold leading-tight tracking-tight">{meal ? `Time for ${mealLabels[meal.type].toLowerCase()}` : "A little care, completed"}</h2>
          <p className="mt-2 text-sm text-foreground/75">{meal ? `Your ${meal.status === "snoozed" ? "reminder" : "usual time"} is ${formatTime(meal.plannedTime)}.` : "Your meal check-ins are recorded for today."}</p>
        </div>
        <span className="neo-icon sage mt-8" aria-hidden="true">{meal ? <Utensils size={26} /> : <Check size={26} />}</span>
      </div>
      <Link className="neo-primary mt-5 w-full" href={meal ? `/meals?meal=${meal.type}` : "/history"}>{meal ? `Log ${mealLabels[meal.type].toLowerCase()}` : "See today's progress"}</Link>
      {meal && <>
        <button type="button" className="mt-2 min-h-11 w-full text-sm font-semibold text-primary" aria-expanded={snooze} onClick={() => setSnooze(value => !value)}>Remind me later</button>
        {snooze && <div className="health-flip mt-3 flex flex-wrap gap-2">{[15, 30, 60].map(minutes => <button key={minutes} className="neo-secondary flex-1 text-sm" disabled={busy} onClick={async () => { if (await onSnooze(meal.type, minutes)) { setNotice(`Reminder moved by ${minutes} minutes.`); setSnooze(false); } }}>{minutes} min</button>)}</div>}
      </>}
    </section>
    {notice && <p role="status" className="health-notice health-flip mt-4">{notice}</p>}
    <section className="mt-6 border-t border-border pt-5" aria-labelledby="also-today">
      <h2 id="also-today" className="text-xl font-bold tracking-tight">Also today</h2>
      <Link className="health-row" href="/medicines"><span className="neo-icon"><Pill size={24} /></span><span className="min-w-0 flex-1 font-semibold">Medicines<small>{medicineSummary}</small></span><ChevronRight aria-hidden="true" size={20} /></Link>
      <WaterCheckIn value={state.water} goal={state.profile.waterGoal} busy={busy} onChange={onWater} />
      <Link className="health-row" href="/morning"><span className="neo-icon sage"><Moon size={24} /></span><span className="flex-1 font-semibold">Sleep<small>{state.sleepCheckCompleted ? "Checked in · View or correct" : "How did you sleep?"}</small></span><ChevronRight aria-hidden="true" size={20} /></Link>
    </section>
  </div>;
}
