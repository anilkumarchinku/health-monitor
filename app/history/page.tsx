"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Utensils, Droplets, Moon } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { HealthReportExport } from "@/components/health-report-export";
import { MedicineProgress } from "@/components/medicine-progress";
import { HealthSyncStatus } from "@/components/sync-status";
import { MealImage } from "@/components/meal-image";
import { requireSignedInUser } from "@/lib/auth";
import { loadSyncedHistory, prepareLocalUserSession, isSupabaseConfigured, type HealthState } from "@/lib/health-sync";
import { normaliseDay, mealLabels, formatTime, type DailyHealth } from "@/lib/daily-health";

const filters = ["All", "Meals", "Water", "Sleep", "Medicines"] as const;
export default function HistoryPage() {
  const [days, setDays] = useState<DailyHealth[]>([]);
  const [filter, setFilter] = useState<typeof filters[number]>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (!isSupabaseConfigured()) throw new Error("Connect your account to see your progress.");
      const user = await requireSignedInUser(); if (!user) return;
      prepareLocalUserSession(user.id);
      setDays((await loadSyncedHistory<HealthState & { date: string }>()).map(normaliseDay));
    } catch { setError("Could not load your history. Your saved records are still available when your connection returns."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("filter") === "medicines") setFilter("Medicines"); void load(); }, [load]);
  return <main className="health-page"><AppNav /><div className="health-content">
    <h1 className="health-heading">Your progress</h1><p className="health-description">Small steps, saved over time.</p>
    <details className="my-6 rounded-2xl border border-border bg-white/50 p-4"><summary className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><Download size={20} />Download or share your report</summary><div className="mt-4"><HealthReportExport /></div></details>
    <div className="health-segments" aria-label="Filter records">{filters.map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    {filter === "Medicines" ? <MedicineProgress /> : <section className="health-flip" key={filter} aria-label={`${filter} history`}>
      {loading && <p role="status">Loading your records…</p>}
      {error && <p className="health-notice health-error" role="alert">{error} <button className="underline" onClick={() => void load()}>Retry</button></p>}
      {!loading && !error && days.length === 0 && <div className="health-notice"><p>No meal, water or sleep records yet. Start with one small step today.</p><Link className="mt-3 inline-block font-semibold underline" href="/">Go to Today</Link></div>}
      {days.map(day => <details key={day.date} className="border-b border-border py-2"><summary className="min-h-14 cursor-pointer py-4"><span className="font-semibold">{day.date ? new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "Saved day"}</span>{day.syncPending && <span className="ml-3 text-xs text-amber-800">Waiting to sync</span>}<span className="mt-1 block text-sm text-muted-foreground">{day.meals.filter(meal => meal.status === "logged").length} meals · {day.water} ml water{day.sleepCheckCompleted ? ` · ${day.sleep.hours}h ${day.sleep.minutes}m sleep` : ""}</span></summary><div className="space-y-5 pb-5">
        {(filter === "All" || filter === "Meals") && <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><Utensils size={17} />Meals</h3>{day.meals.map(meal => <div key={meal.type} className="border-b py-3 text-sm"><p className="font-semibold">{mealLabels[meal.type]} · {meal.status === "logged" ? "Logged" : meal.status === "skipped" ? "Skipped" : "Not logged"}</p>{meal.status === "logged" && <p className="mt-1">{formatTime(meal.actualTime)} · {meal.description || "Meal recorded"}</p>}{meal.notes && <p className="mt-1 text-muted-foreground">{meal.notes}</p>}{meal.image && <MealImage image={meal.image} alt={`${mealLabels[meal.type]} on ${day.date}`} className="mt-3 max-h-48 rounded-xl object-cover" />}</div>)}</section>}
        {(filter === "All" || filter === "Water") && <p className="flex items-center gap-2 text-sm"><Droplets size={17} />Water: {day.water} / {day.profile.waterGoal} ml</p>}
        {(filter === "All" || filter === "Sleep") && <p className="flex items-center gap-2 text-sm"><Moon size={17} />{day.sleepCheckCompleted ? `Sleep: ${day.sleep.hours}h ${day.sleep.minutes}m · ${day.sleep.quality}` : "Sleep: no check-in recorded"}</p>}
      </div></details>)}
    </section>}
    {filter === "All" && <div className="mt-8 border-t pt-6"><MedicineProgress /></div>}
  </div><HealthSyncStatus /></main>;
}
