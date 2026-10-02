"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, ChevronLeft, RefreshCw } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { HealthSyncStatus } from "@/components/sync-status";
import { useDailyHealth } from "@/components/use-daily-health";
import { reminderPreferences, type ReminderPreferences } from "@/lib/reminder-preferences";
import { enablePushNotifications, getPushNotificationStatus, fetchNotificationDoctor, sendTestPushNotification, type NotificationDoctorReport } from "@/lib/push-notifications";

const labels: Record<string, string> = { enabled: "Notifications are enabled on this device.", "not-enabled": "Enable notifications to receive reminders on this device.", "ios-install-required": "On iPhone, add Health Monitor to your Home Screen in Safari, then open it from there to enable reminders.", blocked: "Notifications are blocked. Allow them in your browser or device settings, then try again.", unsupported: "This browser does not support notifications. Try another supported browser.", "signed-out": "Sign in to enable reminders.", "not-configured": "Reminders are temporarily unavailable. Please try again later." };
const options: { key: keyof ReminderPreferences; title: string; help: string }[] = [
  { key: "meals", title: "Meal reminders", help: "Breakfast, lunch and dinner at your saved times." },
  { key: "medicines", title: "Medicine reminders", help: "Your active medicine schedules. This does not change your prescription." },
  { key: "monday", title: "Monday encouragement", help: "A gentle check-in at your saved wake time, even when you haven't opened the app." },
  { key: "morning", title: "Morning check-in", help: "A daily invitation to check in after waking up." },
  { key: "sleep", title: "Evening reminder", help: "A gentle reminder at your saved wind-down time." },
];

export default function NotificationsPage() {
  const { state, busy, error, update, reload } = useDailyHealth();
  const [draft, setDraft] = useState<ReminderPreferences | null>(null);
  const [device, setDevice] = useState("Checking this device…");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<NotificationDoctorReport | null>(null);
  useEffect(() => { if (state && !draft) setDraft(reminderPreferences(state.profile.reminderPreferences)); }, [state, draft]);
  useEffect(() => { void getPushNotificationStatus().then(result => setDevice(labels[result] ?? "Could not check this device.")).catch(() => setDevice("Could not check this device. Try enabling notifications below.")); }, []);
  async function enable() {
    setWorking(true);
    try { const result = await enablePushNotifications(); setDevice(labels[result] ?? "Could not enable notifications."); }
    catch { setDevice("Could not enable notifications. Please retry."); }
    finally { setWorking(false); }
  }
  async function diagnose(test = false) {
    setWorking(true); setMessage("");
    try {
      if (test) { const result = await sendTestPushNotification(); setMessage(result === "sent" ? "Test accepted by the push service. Check whether it appeared on your device." : `Test could not be sent (${result}). Try enabling this device again.`); }
      else { const result = await fetchNotificationDoctor(); setReport(result); setMessage(result?.error ?? "Checks refreshed."); }
    } catch { setMessage("Could not check reminders. Please retry."); }
    finally { setWorking(false); }
  }
  return <main className="health-page"><AppNav /><div className="health-content">
    <Link href="/profile" className="mb-4 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ChevronLeft size={18} />Settings</Link>
    <h1 className="health-heading">Reminders</h1><p className="health-description">A little support, on your terms.</p>
    <section className="next-action mt-6"><div className="mb-3 flex items-center gap-3"><Bell size={22} /><h2 className="font-bold">This device</h2></div><p className="text-sm leading-6" role="status">{device}</p><button className="neo-primary mt-4" disabled={working} onClick={() => void enable()}>{working ? "Please wait…" : "Enable notifications"}</button></section>
    {error && <p className="health-notice health-error mt-5" role="alert">{error} <button className="underline" onClick={() => void reload()}>Retry</button></p>}
    {draft && state && <form className="mt-7" onSubmit={async event => { event.preventDefault(); if (await update({ profile: { ...state.profile, reminderPreferences: draft } })) setMessage("Preferences recorded. Check the sync status below to confirm they reached your account."); }}>
      <fieldset disabled={busy}><legend className="text-lg font-bold">What would you like reminders for?</legend>{options.map(option => <label key={option.key} className="health-row cursor-pointer"><span className="flex-1 font-semibold">{option.title}<small>{option.help}</small></span><input type="checkbox" role="switch" className="h-6 w-6 shrink-0 accent-primary" checked={draft[option.key]} onChange={event => { setDraft({ ...draft, [option.key]: event.target.checked }); setMessage(""); }} /></label>)}<button className="neo-primary mt-6 w-full" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button></fieldset>
      <p className="mt-4 text-sm text-muted-foreground">Monday encouragement replaces the usual morning message on Mondays when enabled. <Link className="underline" href="/profile">Change reminder times</Link></p>
    </form>}
    {message && <p className="health-notice mt-5" role="status">{message}</p>}
    <details className="mt-8 border-t py-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Help with reminders</summary><p className="my-3 text-sm text-muted-foreground">Keep device notifications allowed. Focus mode and browser settings can prevent a reminder from appearing.</p><div className="flex flex-wrap gap-3"><button className="neo-secondary text-sm" disabled={working} onClick={() => void diagnose(true)}>Send me a test</button><button className="neo-secondary text-sm" disabled={working} onClick={() => void diagnose()}><RefreshCw size={16} />Check delivery setup</button></div>{report && <div className="mt-4 text-sm"><p className="font-semibold">{report.ok ? "Delivery setup passed its checks" : "Some checks need attention"}</p>{report.blockers?.map(blocker => <p className="mt-2" key={blocker}>{blocker}</p>)}<details className="mt-4"><summary className="min-h-11 cursor-pointer py-3">Technical details</summary><ul className="space-y-3">{Object.entries(report.checks ?? {}).map(([key, value]) => <li key={key} className="flex gap-2"><Check size={16} />{key}: {String(value)}</li>)}</ul></details></div>}</details>
  </div><HealthSyncStatus /></main>;
}
