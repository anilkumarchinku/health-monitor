"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Moon, ThumbsDown, ThumbsUp } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { HealthSyncStatus } from "@/components/sync-status";
import { useDailyHealth } from "@/components/use-daily-health";
import { sleepDuration, type Sleep } from "@/lib/daily-health";
import { getMorningQuoteText } from "@/lib/morning-quotes";

export default function MorningPage() {
  const { state, busy, error, update, reload } = useDailyHealth();
  const [draft, setDraft] = useState<Sleep | null>(null);
  const [saved, setSaved] = useState(false);
  const draftDay = useRef<string | undefined>(undefined);
  useEffect(() => { if (state && (!draft || draftDay.current !== state.date)) { setDraft(state.sleep); setSaved(false); draftDay.current = state.date; } }, [state, draft]);
  const duration = draft ? sleepDuration(draft.sleptAt, draft.wokeAt) : null;
  return <main className="health-page"><AppNav /><div className="health-content">
    <span className="neo-icon sage mb-5"><Moon /></span><h1 className="health-heading">How did you sleep?</h1><p className="health-description">A moment to check in with yourself.</p>
    {error && <p role="alert" className="health-notice health-error mt-5">{error} <button className="underline" onClick={() => void reload()}>Retry</button></p>}
    {!state && !error && <p role="status" className="mt-5">Loading your check-in…</p>}
    {state && draft && <>
      <form className="health-form mt-7" onSubmit={async event => { event.preventDefault(); if (duration && await update({ sleep: { ...draft, ...duration }, sleepCheckCompleted: true })) setSaved(true); }}>
        <div className="grid grid-cols-2 gap-4"><label>Went to sleep<input required type="time" value={draft.sleptAt} onChange={event => { setDraft({ ...draft, sleptAt: event.target.value }); setSaved(false); }} /></label><label>Woke up<input required type="time" value={draft.wokeAt} onChange={event => { setDraft({ ...draft, wokeAt: event.target.value }); setSaved(false); }} /></label></div>
        {duration && <p className="text-sm text-muted-foreground">{duration.hours} hours {duration.minutes} minutes between these times.</p>}
        <fieldset><legend className="text-sm font-semibold">How rested do you feel?</legend><div className="health-segments mt-3">{(["Poor", "Okay", "Great"] as const).map(quality => <button key={quality} type="button" aria-pressed={draft.quality === quality} onClick={() => { setDraft({ ...draft, quality }); setSaved(false); }}>{quality}</button>)}</div></fieldset>
        <button className="neo-primary w-full" disabled={busy || !duration}>{busy ? "Saving…" : state.sleepCheckCompleted ? "Update sleep check-in" : "Save sleep check-in"}</button>
      </form>
      {saved && <div className="health-notice health-flip mt-5" role="status"><Check className="mr-2 inline h-4 w-4" />Sleep check-in recorded.</div>}
      <details className="mt-8 border-t py-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">A little encouragement (optional)</summary><blockquote className="my-4 border-l-2 border-primary pl-4 leading-7">{getMorningQuoteText(state.quoteIndex ?? 0)}</blockquote><div className="flex flex-wrap gap-3"><button className="neo-secondary text-sm" disabled={busy} aria-pressed={state.quoteFeedback === "liked"} onClick={() => void update({ quoteFeedback: "liked" })}><ThumbsUp size={16} />Helpful</button><button className="neo-secondary text-sm" disabled={busy} aria-pressed={state.quoteFeedback === "disliked"} onClick={() => void update({ quoteFeedback: "disliked" })}><ThumbsDown size={16} />Not for me</button></div></details>
      <Link href="/" className="mt-4 block min-h-11 py-3 text-center font-semibold text-primary">Back to Today</Link>
    </>}
  </div><HealthSyncStatus /></main>;
}
