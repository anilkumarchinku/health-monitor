"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets } from "lucide-react";

type Props = { value: number; goal: number; busy: boolean; onChange: (amount: number) => Promise<boolean> };

/** Shared by the real Today screen and its interactive preview. */
export function WaterCheckIn({ value, goal, busy, onChange }: Props) {
  const [previous, setPrevious] = useState<{ before: number; after: number } | null>(null);
  const [total, setTotal] = useState(String(value));
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { setTotal(String(value)); }, [value]);
  async function record(amount: number, undo = false) {
    if (busy || inFlight.current) return;
    if (!Number.isInteger(amount) || amount < 0 || amount > 6000) { setNotice("Enter a total between 0 and 6,000 ml."); return; }
    inFlight.current = true; setSaving(true);
    try {
      if (await onChange(amount)) {
        setPrevious(undo ? null : { before: value, after: amount });
        setNotice(undo ? "Last water entry undone." : `Water total recorded: ${amount} ml.`);
      }
    } catch { setNotice("Could not save your water entry. Please retry."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  const disabled = busy || saving;
  return <div className="border-b border-border">
    <div className="health-row flex-wrap border-b-0">
      <span className="neo-icon peach"><Droplets size={24} /></span>
      <span className="min-w-0 flex-1 font-semibold">Water<small>{value} / {goal} ml</small></span>
      <button type="button" className="neo-secondary text-sm" disabled={disabled || value >= 6000} onClick={() => void record(Math.min(6000, value + 250))}>+250 ml</button>
      {previous && value === previous.after && <button className="ml-auto min-h-11 px-3 text-sm font-semibold text-primary underline" disabled={disabled} onClick={() => void record(previous.before, true)}>Undo last water entry</button>}
    </div>
    <details className="pb-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary">More water options</summary>
      <div className="mb-4 flex flex-wrap gap-2">{[100, 500, 750].map(amount => <button key={amount} className="neo-secondary text-sm" disabled={disabled || value >= 6000} onClick={() => void record(Math.min(6000, value + amount))}>+{amount} ml</button>)}</div>
      <form className="health-form" onSubmit={event => { event.preventDefault(); if (total.trim()) void record(Number(total)); }}>
        <label>Correct today&apos;s water total (ml)<input type="number" min="0" max="6000" step="1" required value={total} disabled={disabled} onChange={event => setTotal(event.target.value)} /></label>
        <button className="neo-secondary text-sm" disabled={disabled}>Save water total</button>
      </form>
    </details>
    {notice && <p role="status" className="health-notice mb-4">{notice}</p>}
  </div>;
}
