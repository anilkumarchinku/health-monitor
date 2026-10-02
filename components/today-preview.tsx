"use client";

import { useState } from "react";
import { AppNav } from "@/components/app-nav";
import { TodayView } from "@/components/today-view";
import { normaliseDay } from "@/lib/daily-health";

export function TodayPreview() {
  const [state, setState] = useState(() => normaliseDay({ date: "2026-10-02", onboardingCompleted: true, profile: { name: "Anil", timezone: "Asia/Kolkata", waterGoal: 2000, lunchTime: "13:00" }, water: 750, meals: [{ type: "breakfast", status: "logged" }] }));
  return <main className="health-page"><AppNav /><TodayView state={state} busy={false} now={new Date("2026-10-02T07:30:00Z")} medicineSummary="Next reminder at 2:00 PM" onWater={async water => { setState(current => ({ ...current, water })); return true; }} onSnooze={async (type, minutes) => { const time = `13:${String(minutes % 60).padStart(2, "0")}`; setState(current => ({ ...current, meals: current.meals.map(meal => meal.type === type ? { ...meal, plannedTime: minutes === 60 ? "14:00" : time, status: "snoozed" } : meal) })); return true; }} /><p className="mx-auto max-w-[640px] px-5 text-xs text-muted-foreground">Design preview · sample data · changes stay in this preview. Account pages require sign-in.</p></main>;
}
