"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, ChevronRight, Check, LogOut, User } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { HealthSyncStatus } from "@/components/sync-status";
import { useDailyHealth } from "@/components/use-daily-health";
import { type Routine, mealTypes } from "@/lib/daily-health";
import { validateHealthProfile } from "@/lib/health-sync";
import { signOut } from "@/lib/auth";

export default function ProfilePage() {
  const { state, busy, error, update, reload } = useDailyHealth();
  const [draft, setDraft] = useState<Routine | null>(null);
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState("");
  useEffect(() => { if (state && !draft) setDraft(state.profile); }, [state, draft]);
  function edit(key: keyof Routine, value: string | number) { setDraft(current => current ? { ...current, [key]: value } : current); setMessage(""); }
  return <main className="health-page"><AppNav /><div className="health-content">
    <h1 className="health-heading">Settings</h1><p className="health-description">Your routine, your preferences.</p>
    {error && <p role="alert" className="health-notice health-error mt-5">{error} <button className="underline" onClick={() => void reload()}>Retry</button></p>}
    <Link className="health-row mt-4" href="/notifications"><span className="neo-icon sage"><Bell size={22} /></span><span className="flex-1 font-semibold">Reminders<small>Choose what you hear from us</small></span><ChevronRight size={20} /></Link>
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4" href="/onboarding?edit=1&next=%2Fprofile">Revisit setup preferences</Link>
    {!state && !error && <p role="status" className="mt-5">Loading your routine…</p>}
    {state && draft && <form className="health-form mt-7" onSubmit={async event => { event.preventDefault(); const problem = validateHealthProfile(draft); setValidation(problem ?? ""); if (problem) return; const meals = state.meals.map(meal => meal.status === "pending" ? { ...meal, plannedTime: draft[`${meal.type}Time`] } : meal); if (await update({ profile: { ...state.profile, name: draft.name, timezone: draft.timezone, wakeTime: draft.wakeTime, breakfastTime: draft.breakfastTime, lunchTime: draft.lunchTime, dinnerTime: draft.dinnerTime, sleepReminder: draft.sleepReminder, waterGoal: draft.waterGoal }, meals })) setMessage("Routine recorded. Your reminder settings use these times."); }}>
      <h2 className="flex items-center gap-2 text-lg font-bold"><User size={20} />About you</h2>
      <label>Name<input required autoComplete="given-name" maxLength={100} value={draft.name} onChange={event => edit("name", event.target.value)} /></label>
      <label>Timezone<input required value={draft.timezone} onChange={event => edit("timezone", event.target.value)} /><span className="text-xs font-normal text-muted-foreground">For example, Asia/Kolkata. All reminder times follow this timezone.</span></label>
      <h2 className="mt-3 text-lg font-bold">Your daily routine</h2>
      <div className="grid grid-cols-2 gap-4">{([{ key: "wakeTime", label: "Wake up" }, ...mealTypes.map(type => ({ key: `${type}Time`, label: type[0].toUpperCase() + type.slice(1) })), { key: "sleepReminder", label: "Wind down" }] as { key: "wakeTime" | "breakfastTime" | "lunchTime" | "dinnerTime" | "sleepReminder"; label: string }[]).map(field => <label key={field.key}>{field.label}<input type="time" required value={draft[field.key]} onChange={event => edit(field.key, event.target.value)} /></label>)}</div>
      <label>Daily water goal (ml)<input required type="number" min={500} max={6000} step={50} value={draft.waterGoal} onChange={event => edit("waterGoal", Number(event.target.value))} /></label>
      {validation && <p role="alert" className="health-notice health-error">{validation}</p>}
      <button className="neo-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save routine"}</button>
      {message && <p className="health-notice health-flip" role="status"><Check className="mr-2 inline h-4 w-4" />{message}</p>}
    </form>}
    <div className="mt-8 border-t pt-5"><button className="flex min-h-11 items-center gap-2 text-sm font-semibold" onClick={() => void signOut()}><LogOut size={18} />Sign out</button></div>
  </div><HealthSyncStatus /></main>;
}
