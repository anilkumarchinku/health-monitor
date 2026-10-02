"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadHealthReport } from "@/lib/health-report-data";
import { reportFilename, reportLines, type ReportOptions } from "@/lib/health-report";
import { downloadReportFile, shareReportFile } from "@/lib/report-sharing";

function defaultDates() {
  const end = new Date();
  const start = new Date(end); start.setDate(start.getDate() - 29);
  const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { start: local(start), end: local(end) };
}

type Prepared = { pdf: File | null; text: File; owner: string; days: number; doses: number; preview: string[] };

export function HealthReportExport() {
  const [options, setOptions] = useState<ReportOptions>(() => ({ ...defaultDates(), includeName: true, includeMedicines: true }));
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const owner = useRef<string | null>(null);

  useEffect(() => {
    const counter = generation;
    const db = createSupabaseBrowserClient();
    const clear = () => { generation.current++; setPrepared(null); setBusy(false); setMessage(""); };
    const subscription = db?.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (owner.current !== next) { owner.current = next; clear(); }
    }).data.subscription;
    const accountChanged = (event: StorageEvent) => {
      if (event.key === null || (event.key === "daily-health-current-user" && event.newValue !== owner.current)) clear();
    };
    window.addEventListener("storage", accountChanged);
    return () => { counter.current++; subscription?.unsubscribe(); window.removeEventListener("storage", accountChanged); };
  }, []);

  function changeOptions(patch: Partial<ReportOptions>) {
    generation.current++; setOptions(current => ({ ...current, ...patch })); setPrepared(null); setMessage(""); setError("");
  }

  async function prepare() {
    const run = ++generation.current;
    setBusy(true); setPrepared(null); setError(""); setMessage("");
    try {
      const loaded = await loadHealthReport(options);
      if (!loaded.report.days.length && !loaded.report.doses.length) throw new Error("No saved records in this date range. Choose another period, or sync your latest entries first.");
      const text = new File([reportLines(loaded.report).join("\n")], reportFilename(options, "txt"), { type: "text/plain;charset=utf-8" });
      let pdf: File | null = null;
      let pdfError = "";
      try {
        const { createHealthReportPdf } = await import("@/lib/health-report-pdf");
        pdf = new File([await createHealthReportPdf(loaded.report)], reportFilename(options), { type: "application/pdf" });
      } catch { pdfError = "PDF preparation failed. Your text report is ready; try preparing again for a PDF."; }
      if (run !== generation.current || owner.current !== loaded.owner) return;
      setPrepared({ pdf, text, owner: loaded.owner, days: loaded.report.days.length, doses: loaded.report.doses.length, preview: reportLines(loaded.report) });
      setMessage(pdfError || "Your report is ready. Choose Download or Share.");
    } catch (failure) {
      if (run === generation.current) setError(failure instanceof Error ? failure.message : "Could not prepare your report. Please retry.");
    } finally { if (run === generation.current) setBusy(false); }
  }

  function validPrepared() {
    if (!prepared || prepared.owner !== owner.current || localStorage.getItem("daily-health-current-user") !== prepared.owner) {
      setPrepared(null); setError("Your account changed. Prepare a new report before downloading or sharing."); return null;
    }
    return prepared;
  }

  function download(textOnly = false) {
    const ready = validPrepared(); if (!ready) return;
    downloadReportFile(textOnly ? ready.text : ready.pdf ?? ready.text);
    setMessage("Download started. You can attach the file to an email or message.");
  }

  async function share() {
    const ready = validPrepared(); if (!ready) return;
    setSharing(true); setError("");
    try {
      const result = await shareReportFile(ready.pdf ?? ready.text);
      setMessage(result === "unsupported" ? "File sharing is unavailable in this browser. Download your report, then attach it in WhatsApp, email or another app." : result === "cancelled" ? "Sharing cancelled. Your report is still ready." : "Report handed to your chosen app.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Sharing failed. Download the report instead."); }
    finally { setSharing(false); }
  }

  return <section aria-labelledby="report-title" className="glass-surface rounded-lg border border-teal-900/15 p-4 sm:p-5">
    <div className="flex items-start gap-3"><FileText className="mt-1 h-5 w-5 text-teal-700" aria-hidden="true" /><div>
      <h2 id="report-title" className="text-lg font-semibold">Download your report</h2>
      <p className="mt-1 text-sm text-muted-foreground">Keep a copy of your meals, water and sleep, or share it with someone you choose.</p>
    </div></div>
    <fieldset disabled={busy || sharing} className="mt-4 space-y-3 disabled:opacity-60">
      <legend className="sr-only">Choose report contents</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span>From</span><input type="date" value={options.start} onChange={e => changeOptions({ start: e.target.value })} className="block min-h-11 w-full rounded-md border bg-white/70 px-3 text-foreground" /></label>
        <label className="space-y-1 text-sm"><span>To</span><input type="date" value={options.end} onChange={e => changeOptions({ end: e.target.value })} className="block min-h-11 w-full rounded-md border bg-white/70 px-3 text-foreground" /></label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={options.includeName} onChange={e => changeOptions({ includeName: e.target.checked })} />Include my name</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={options.includeMedicines} onChange={e => changeOptions({ includeMedicines: e.target.checked })} />Include medicine records</label>
      </div>
      <p className="text-xs text-muted-foreground">Up to 90 days. Uses saved cloud records; sync pending changes first. Photos and contact details are excluded.</p>
      <Button type="button" onClick={() => void prepare()} disabled={busy || sharing}>{busy ? <Loader2 className="animate-spin" /> : <FileText />}{busy ? "Preparing report…" : prepared ? "Refresh report" : "Prepare report"}</Button>
    </fieldset>
    {prepared && <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-sm">{prepared.days} days of health records{options.includeMedicines ? ` · ${prepared.doses} medicine entries` : ""}</p>
      <details className="rounded-xl border bg-white p-3"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Preview report contents</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{prepared.preview.join("\n")}</pre></details>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => download()} disabled={sharing}><Download />Download {prepared.pdf ? "PDF" : "text report"}</Button>
        <Button type="button" variant="outline" onClick={() => void share()} disabled={sharing}><Share2 />{sharing ? "Sharing…" : "Share report"}</Button>
        {prepared.pdf && <Button type="button" variant="ghost" onClick={() => download(true)} disabled={sharing}>Download text</Button>}
      </div>
      <p className="text-xs text-muted-foreground">The file includes the health details you selected. Share only with people you choose. No public link is created.</p>
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
