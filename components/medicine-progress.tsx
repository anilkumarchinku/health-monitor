"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadMedicineDoseEvents } from "@/lib/medicine-history";
import { describeMedicineDoseEvent, type MedicineDose, type MedicineDoseEvent } from "@/lib/medicines";

export function MedicineProgress() {
  const [rows, setRows] = useState<MedicineDose[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<MedicineDoseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventError, setEventError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError(""); setEventError("");
    try {
      const db = createSupabaseBrowserClient();
      if (!db) throw new Error("Connect your account to see medicine history.");
      const user = (await db.auth.getUser()).data.user;
      if (!user) throw new Error("Sign in to see your medicine history.");
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [doses, medicines] = await Promise.all([
        db.from("medicine_doses").select("*").eq("user_id", user.id).gte("scheduled_date", since.toISOString().slice(0, 10)).in("status", ["taken", "skipped"]).order("scheduled_date", { ascending: false }).limit(1000),
        db.from("medicines").select("id,name").eq("user_id", user.id),
      ]);
      if (doses.error || medicines.error) throw new Error("Could not load medicine records. Please retry.");
      setRows(doses.data as MedicineDose[]); setNames(Object.fromEntries(medicines.data.map(row => [row.id, row.name])));
      try { setEvents(await loadMedicineDoseEvents(user.id)); } catch { setEventError("Change history could not load. Retry to check corrections."); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load medicine history."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section aria-labelledby="medicine-history-title" className="health-flip">
    <h2 id="medicine-history-title" className="text-xl font-bold">Medicine history</h2><p className="health-description text-sm">Recorded doses from the last 30 days, up to 1,000 entries.</p>
    {loading && <p role="status" className="mt-5">Loading medicine records…</p>}
    {error && <p className="health-notice health-error mt-5" role="alert">{error} <button className="underline" onClick={() => void load()}>Retry</button></p>}
    {!loading && !error && rows.length === 0 && <p className="health-notice mt-5">No doses recorded yet. They will appear here after a check-in.</p>}
    {!error && rows.map(row => <div className="health-row" key={row.id}><div className="flex-1"><p className="font-semibold">{names[row.medicine_id] ?? "Medicine"}</p><small>{row.scheduled_date}</small></div><span className="text-sm font-semibold">{row.status === "taken" ? "Taken" : "Skipped"}</span></div>)}
    {!loading && !error && <details className="mt-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Corrections and changes</summary><p className="mb-3 text-xs text-muted-foreground">Latest 100 changes. Times use this device&apos;s timezone.</p>{eventError && <p role="status">{eventError} <button className="underline" onClick={() => void load()}>Retry</button></p>}{!eventError && events.length === 0 && <p className="text-sm">No changes recorded.</p>}{events.map(event => <div key={event.id} className="border-b py-3 text-sm"><p className="font-semibold">{event.medicine_name} · {event.scheduled_date}</p><p>{describeMedicineDoseEvent(event)}</p><time className="text-muted-foreground" dateTime={event.recorded_at}>{new Date(event.recorded_at).toLocaleString()}</time></div>)}</details>}
  </section>;
}
