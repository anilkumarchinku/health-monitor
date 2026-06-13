"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSignedInUser } from "@/lib/auth";
import { syncCurrentLocalStateToSupabase } from "@/lib/health-sync";
import {
  enablePushNotifications,
  fetchNotificationDoctor,
  NotificationDoctorReport,
  sendTestPushNotification,
} from "@/lib/push-notifications";

export default function NotificationsPage() {
  const [report, setReport] = useState<NotificationDoctorReport | null>(null);
  const [message, setMessage] = useState("Run the checks to see the real notification status.");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function boot() {
      const user = await requireSignedInUser();
      if (!user) return;
      await runDoctor("Loaded notification doctor.");
    }

    void boot();
  }, []);

  async function runDoctor(successMessage = "Checks refreshed.") {
    setLoading(true);
    const nextReport = await fetchNotificationDoctor();
    setReport(nextReport);
    setMessage(nextReport?.error ?? successMessage);
    setLoading(false);
  }

  async function syncSchedule() {
    setLoading(true);
    await syncCurrentLocalStateToSupabase();
    setLoading(false);
    await runDoctor("Schedule synced to Supabase.");
  }

  async function enableFreshDevice() {
    setLoading(true);
    const result = await enablePushNotifications();
    if (result === "enabled") {
      const testResult = await sendTestPushNotification();
      setLoading(false);
      await runDoctor(testResult === "sent" ? "Device saved and server push reached this device." : `Device saved, but server test result: ${testResult}`);
      return;
    }
    setLoading(false);
    await runDoctor(`Enable result: ${result}`);
  }

  async function sendTest() {
    setLoading(true);
    const result = await sendTestPushNotification();
    setLoading(false);
    await runDoctor(result === "sent" ? "Test push sent." : `Test push result: ${result}`);
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <AppNav title="Notification Check" compactBrand />
      <section className="glass-shell mx-auto max-w-5xl rounded-lg p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge className="mb-3 bg-zinc-950 text-white">Launch blocker check</Badge>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
              Notification doctor
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              This checks the exact server path used by cron: saved schedule, saved device,
              VAPID keys, due reminder window, and recent deliveries.
            </p>
          </div>
          <StatusPill ok={Boolean(report?.ok)} label={report?.ok ? "Ready" : "Needs attention"} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button onClick={syncSchedule} disabled={loading}>
            <RefreshCw />
            Sync schedule
          </Button>
          <Button onClick={enableFreshDevice} disabled={loading}>
            <Bell />
            Enable device
          </Button>
          <Button onClick={sendTest} disabled={loading}>
            <Send />
            Send test
          </Button>
          <Button variant="outline" onClick={() => void runDoctor()} disabled={loading}>
            <ShieldCheck />
            Refresh checks
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-950/10 bg-white/75 p-3 text-sm font-medium">
          {loading ? "Checking..." : message}
        </div>
      </section>

      <section className="glass-shell mx-auto mt-5 max-w-5xl rounded-lg p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <CheckCard label="Saved schedule" ok={report?.checks?.hasSnapshot} />
          <CheckCard label="Saved push device" ok={report?.checks?.hasSubscription} />
          <CheckCard label="Server push keys" ok={report?.checks?.hasVapid} />
          <CheckCard label="Reminder due now" ok={report?.checks?.hasDueReminderNow} softFail />
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Blockers</CardTitle>
            <CardDescription>Fix these from top to bottom.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report?.blockers?.length ? (
              report.blockers.map((blocker) => (
                <div key={blocker} className="rounded-md border bg-white/70 p-3 text-sm">
                  {blocker}
                </div>
              ))
            ) : (
              <div className="rounded-md border bg-white/70 p-3 text-sm">
                No blocker found. If test push still does not appear, check phone/browser notification settings and Focus mode.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Server Details</CardTitle>
            <CardDescription>These numbers come from Supabase through the same server env as cron.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <Detail label="Snapshots" value={report?.counts?.snapshots ?? 0} />
            <Detail label="Devices" value={report?.counts?.subscriptions ?? 0} />
            <Detail label="Deliveries" value={report?.counts?.recentDeliveries ?? 0} />
            <Detail label="Local date" value={report?.latestSnapshot?.localNow?.date ?? "-"} />
            <Detail label="Local time" value={report?.latestSnapshot?.localNow?.time ?? "-"} />
            <Detail label="Timezone" value={report?.latestSnapshot?.localNow?.timezone ?? "-"} />
            <Detail
              label="Send window"
              value={`${report?.latestSnapshot?.reminderWindowMinutes ?? 30} min`}
            />
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Schedule Decision</CardTitle>
            <CardDescription>Shows why cron will send or wait for each saved reminder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report?.latestSnapshot?.reminders?.length ? (
              report.latestSnapshot.reminders.map((reminder) => (
                <div
                  key={`${reminder.kind}-${reminder.time}`}
                  className="flex flex-col gap-2 rounded-md border bg-white/70 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium capitalize">{reminder.kind}</p>
                    <p className="text-muted-foreground">
                      {reminder.time || "No time saved"}{reminder.status ? `, ${reminder.status}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{formatWindowStatus(reminder)}</Badge>
                </div>
              ))
            ) : (
              <div className="rounded-md border bg-white/70 p-3 text-sm">
                No reminders found in the saved schedule.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium ${
      ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
    }`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </div>
  );
}

function CheckCard({ label, ok, softFail = false }: { label: string; ok?: boolean; softFail?: boolean }) {
  const good = Boolean(ok);
  return (
    <div className="rounded-lg border border-zinc-950/10 bg-white/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{label}</p>
        <StatusPill ok={good || softFail} label={good ? "OK" : softFail ? "Not due" : "Missing"} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-950/10 bg-white/75 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function formatWindowStatus(reminder: {
  windowStatus?: string;
  minutesUntil?: number;
  minutesLate?: number;
  expiresIn?: number;
  expiredBy?: number;
}) {
  if (reminder.windowStatus === "due") {
    return `Due now, active for ${reminder.expiresIn ?? 0} min`;
  }
  if (reminder.windowStatus === "future") {
    return `In ${reminder.minutesUntil ?? 0} min`;
  }
  if (reminder.windowStatus === "expired") {
    return `Expired ${reminder.expiredBy ?? 0} min ago`;
  }
  return "Invalid time";
}
