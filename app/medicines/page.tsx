"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, Pill, Plus, RotateCcw, Utensils } from "lucide-react";
import { HealthSyncStatus } from "@/components/sync-status";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireSignedInUser } from "@/lib/auth";
import { readLocalState } from "@/lib/health-sync";
import { loadMedicineDoseEvents } from "@/lib/medicine-history";
import { describeMedicineDoseEvent, type MedicineDoseEvent, foodRuleLabels, localDateInTimezone, type FoodRule, type Medicine, type MedicineDose } from "@/lib/medicines";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type MedicineForm = {
  name: string;
  dose_label: string;
  schedule_time: string;
  timezone: string;
  food_rule: FoodRule;
  notes: string;
};

const guide = [
  { title: "Keep food and medicine separate", text: "Your meal log stays where it is. Medicine has its own schedule and checklist.", icon: Utensils },
  { title: "Add the label instructions", text: "Enter the medicine, dose, time, and food instruction exactly as prescribed.", icon: Pill },
  { title: "Check in when it is time", text: "Get a reminder, answer the food question when needed, then record taken or skipped.", icon: Check },
];

function emptyForm(timezone: string): MedicineForm {
  return { name: "", dose_label: "", schedule_time: "08:00", timezone, food_rule: "none", notes: "" };
}

export default function MedicinesPage() {
  const dayKey = useRef("");
  const [view, setView] = useState<"today" | "manage" | "history">("today");
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [doseSaving, setDoseSaving] = useState(false);
  const [userId, setUserId] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [doseEvents, setDoseEvents] = useState<MedicineDoseEvent[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [doses, setDoses] = useState<MedicineDose[]>([]);
  const [form, setForm] = useState<MedicineForm>(() => emptyForm("UTC"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [foodAnswers, setFoodAnswers] = useState<Record<string, boolean | null>>({});
  const [guideStep, setGuideStep] = useState(0);
  const [hadMealHistory, setHadMealHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const reload = useCallback(async (id: string) => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("Supabase is not configured."); setLoading(false); return; }
    try {
    const medicinesResult = await supabase.from("medicines").select("*").eq("user_id", id).order("schedule_time");
    if (medicinesResult.error) {
      setMessage(`Could not load medicine schedules: ${medicinesResult.error.message}`);
      setLoading(false);
      return;
    }
    const rows = (medicinesResult.data ?? []) as Medicine[];
    setMedicines(rows);
    const dates = rows.map((medicine) => localDateInTimezone(medicine.timezone));
    const key = dates.join("|");
    if (dayKey.current !== key) { setFoodAnswers({}); dayKey.current = key; }
    if (dates.length) {
      const historyStart = new Date(`${[...dates].sort()[0]}T12:00:00Z`);
      historyStart.setUTCDate(historyStart.getUTCDate() - 30);
      const doseResult = await supabase.from("medicine_doses").select("*").eq("user_id", id)
        .gte("scheduled_date", historyStart.toISOString().slice(0, 10)).lte("scheduled_date", [...dates].sort().at(-1)!).order("scheduled_date", { ascending: false }).limit(1000);
      if (doseResult.error) setMessage(`Could not load today's checklist: ${doseResult.error.message}`);
      else setDoses((doseResult.data ?? []) as MedicineDose[]);
    } else setDoses([]);
    try { setDoseEvents(await loadMedicineDoseEvents(id)); setHistoryError(""); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : "Could not load medicine change history."); }
    } catch { setMessage("Could not load medicines. Please retry."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "history") setView("history");
    let local: { meals?: unknown[]; profile?: { timezone?: string } } | null = null;
    try { local = readLocalState(); } catch { local = null; }
    setHadMealHistory(Boolean(local?.meals?.length));
    setForm((current) => ({ ...current, timezone: local?.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }));
    void requireSignedInUser().then((user) => {
      if (!user) { setLoading(false); setMessage("Sign in to load your medicine checklist."); return; }
      setGuideDismissed(localStorage.getItem(`medicine-guide:${user.id}`) === "done");
      setUserId(user.id);
      void reload(user.id);
    }).catch(() => { setLoading(false); setMessage("Could not load medicines. Please retry."); });
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { if (document.visibilityState === "visible") void reload(userId); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [userId, reload]);

  async function correctDose(medicine: Medicine) {
    if (doseSaving || !window.confirm("Clear this recorded dose so you can correct today's checklist?")) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setDoseSaving(true);
    try {
      const { error } = await supabase.from("medicine_doses").update({ status: "reminded", food_answer: null, taken_at: null, updated_at: new Date().toISOString() })
        .eq("medicine_id", medicine.id).eq("user_id", userId).eq("scheduled_date", localDateInTimezone(medicine.timezone));
      if (error) setMessage(`Could not correct dose: ${error.message}`);
      else { setFoodAnswers((answers) => ({ ...answers, [`${medicine.id}:${localDateInTimezone(medicine.timezone)}`]: null })); setMessage("Dose reopened. Record the correct status."); await reload(userId); }
    } catch { setMessage("Could not correct dose. Please retry."); }
    finally { setDoseSaving(false); }
  }

  async function saveMedicine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    try { new Intl.DateTimeFormat("en", { timeZone: form.timezone }); }
    catch { setMessage("Enter a valid timezone such as Asia/Kolkata."); return; }
    setSaving(true);
    setMessage("");
    const values = {
      name: form.name.trim(), dose_label: form.dose_label.trim(), schedule_time: form.schedule_time,
      timezone: form.timezone.trim(), food_rule: form.food_rule, notes: form.notes.trim(), updated_at: new Date().toISOString(),
    };
    try {
    const result = editingId
      ? await supabase.from("medicines").update(values).eq("id", editingId).eq("user_id", userId)
      : await supabase.from("medicines").insert({ ...values, user_id: userId });
    if (result.error) { setMessage(`Could not save medicine: ${result.error.message}`); return; }
    setEditingId(null);
    setForm(emptyForm(form.timezone));
    setView("today");
    setGuideDismissed(true);
    localStorage.setItem(`medicine-guide:${userId}`, "done");
    setMessage("Medicine schedule saved.");
    await reload(userId);
    } catch { setMessage("Could not save medicine. Your entries are still here; please retry."); }
    finally { setSaving(false); }
  }

  async function setActive(medicine: Medicine, active: boolean) {
    if (saving) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    try {
    const { error } = await supabase.from("medicines").update({ active, updated_at: new Date().toISOString() })
      .eq("id", medicine.id).eq("user_id", userId);
    if (error) setMessage(error.message);
    else { setMessage(active ? "Medicine reminders resumed." : "Medicine reminders paused."); await reload(userId); }
    } catch { setMessage("Could not change the reminder. Please retry."); }
    finally { setSaving(false); }
  }

  async function markDose(medicine: Medicine, status: "taken" | "skipped") {
    if (doseSaving) return;
    if (medicine.food_rule === "with_food" && status === "taken" && foodAnswers[`${medicine.id}:${localDateInTimezone(medicine.timezone)}`] == null) {
      setMessage(`Answer the food question for ${medicine.name} before recording this dose.`);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setDoseSaving(true);
    try {
    const { error } = await supabase.from("medicine_doses").upsert({
      medicine_id: medicine.id, user_id: userId,
      scheduled_date: localDateInTimezone(medicine.timezone), status,
      food_answer: status === "taken" && medicine.food_rule === "with_food" ? foodAnswers[`${medicine.id}:${localDateInTimezone(medicine.timezone)}`] : null,
      taken_at: status === "taken" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "medicine_id,scheduled_date" });
    if (error) setMessage(`Could not record dose: ${error.message}`);
    else { setMessage(status === "taken" ? "Dose recorded as taken." : "Dose recorded as skipped."); await reload(userId); }
    } catch { setMessage("Could not record dose. Please retry."); }
    finally { setDoseSaving(false); }
  }

  const activeMedicines = medicines.filter((medicine) => medicine.active);
  const takenCount = activeMedicines.filter((medicine) =>
    doses.some((dose) => dose.medicine_id === medicine.id && dose.scheduled_date === localDateInTimezone(medicine.timezone) && dose.status === "taken"),
  ).length;

  return (
    <main className="health-page">
      <AppNav title="Medicine" compactBrand />
      <HealthSyncStatus />
      <div className="health-content space-y-5">
        <div className="space-y-2">

          <h1 className="health-heading">Medicines</h1>
          <p className="max-w-2xl text-foreground/70">Your prescribed routine, one check-in at a time.</p>
        </div>

        {message && <p role="status" className="health-notice">{message} {message.startsWith("Could not load") && userId && <button className="underline" onClick={() => void reload(userId)}>Retry</button>}</p>}
        <div className="health-segments" aria-label="Medicine views"><button aria-pressed={view === "today"} onClick={() => setView("today")}>Today&apos;s doses</button><button aria-pressed={view === "manage"} onClick={() => setView("manage")}>Manage medicines</button></div>
        {view === "today" && <Link className="inline-block min-h-11 py-3 text-sm font-semibold text-primary underline" href="/history?filter=medicines">View dose history in Progress</Link>}
        {!loading && medicines.length === 0 && !guideDismissed && view === "today" && (
          <Card className="health-flip overflow-hidden border-emerald-200 bg-white">
            <CardContent className="grid gap-6 p-6 sm:grid-cols-[120px_1fr] sm:items-center">
              <div className="neo-icon mx-auto grid h-28 w-28 place-items-center rounded-full bg-emerald-100 text-primary">
                {(() => { const Icon = guide[guideStep].icon; return <Icon className="h-12 w-12" />; })()}
              </div>
              <div key={guideStep} aria-live="polite" className="health-flip space-y-3">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">{hadMealHistory ? "Your meal routine is ready · " : "Get started · "}Step {guideStep + 1} of 3</p>
                <h2 className="text-2xl font-bold text-primary">{guide[guideStep].title}</h2>
                <p className="text-foreground/70">{guide[guideStep].text}</p>
                <div className="flex items-center gap-3 pt-2">
                  <Button variant="outline" size="sm" disabled={guideStep === 0} onClick={() => setGuideStep((step) => step - 1)}><ChevronLeft className="h-4 w-4" /> Back</Button>
                  <Button size="sm" onClick={() => { if (guideStep === 2) { setView("manage"); setGuideDismissed(true); localStorage.setItem(`medicine-guide:${userId}`, "done"); } else setGuideStep(step => step + 1); }}>{guideStep === 2 ? "Add first medicine" : "Next"}<ChevronRight className="h-4 w-4" /></Button>
                  <button className="min-h-11 text-sm underline" onClick={() => { setGuideDismissed(true); localStorage.setItem(`medicine-guide:${userId}`, "done"); }}>Skip guide</button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-5">
          <div className="space-y-5">
            {view === "today" && <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div><CardTitle>Today&apos;s medicine checklist</CardTitle><CardDescription>{takenCount} of {activeMedicines.length} active doses recorded as taken</CardDescription></div>
                <Pill className="h-6 w-6 text-primary" />
              </CardHeader>
              <CardContent className="space-y-4">
                {loading && <p>Loading your schedule…</p>}
                {!loading && activeMedicines.length === 0 && <p className="rounded-xl bg-emerald-50 p-4 text-foreground/70">No doses scheduled yet. Choose Manage medicines to add your first one.</p>}
                {activeMedicines.map((medicine) => {
                  const today = localDateInTimezone(medicine.timezone);
                  const dose = doses.find((item) => item.medicine_id === medicine.id && item.scheduled_date === today);
                  const answer = foodAnswers[`${medicine.id}:${localDateInTimezone(medicine.timezone)}`];
                  return (
                    <div key={medicine.id} className="rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><p className="text-lg font-bold text-primary">{medicine.name}</p><p className="text-sm text-foreground/70">{medicine.dose_label} · {medicine.schedule_time.slice(0, 5)} · {medicine.timezone}</p></div>
                        <Badge variant={dose?.status === "taken" ? "default" : "outline"}>{dose?.status === "taken" ? "Taken" : dose?.status === "skipped" ? "Skipped" : "Due today"}</Badge>
                      </div>
                      <p className="mt-3 text-sm font-medium">{foodRuleLabels[medicine.food_rule]}</p>
                      {medicine.notes && <p className="mt-1 text-sm text-foreground/65">{medicine.notes}</p>}
                      {medicine.food_rule === "with_food" && dose?.status !== "taken" && dose?.status !== "skipped" && (
                        <div className="mt-4 rounded-xl bg-amber-50 p-3">
                          <p className="font-semibold">Have you had a meal for this medicine?</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant={answer === true ? "default" : "outline"} aria-pressed={answer === true} onClick={() => setFoodAnswers((current) => ({ ...current, [`${medicine.id}:${localDateInTimezone(medicine.timezone)}`]: true }))}>Yes, I ate</Button>
                            <Button type="button" size="sm" variant={answer === false ? "default" : "outline"} aria-pressed={answer === false} onClick={() => setFoodAnswers((current) => ({ ...current, [`${medicine.id}:${localDateInTimezone(medicine.timezone)}`]: false }))}>Not yet</Button>
                          </div>
                          {answer === false && <p className="mt-2 text-sm text-amber-900">Follow your medicine label or ask your pharmacist about food timing. <Link className="underline" href="/meals">Open meal log</Link></p>}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" disabled={doseSaving || dose?.status === "taken" || dose?.status === "skipped"} onClick={() => void markDose(medicine, "taken")}><Check className="h-4 w-4" /> {dose?.status === "taken" ? "Taken today" : "Mark taken"}</Button>
                        <Button size="sm" variant="outline" disabled={doseSaving || dose?.status === "skipped" || dose?.status === "taken"} onClick={() => void markDose(medicine, "skipped")}>Mark skipped</Button>
                        {(dose?.status === "taken" || dose?.status === "skipped") && <Button size="sm" variant="outline" disabled={doseSaving} onClick={() => void correctDose(medicine)}>Correct entry</Button>}

                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>}
            {view === "history" && <><Card><CardHeader><CardTitle>Recent dose history</CardTitle><CardDescription>Recorded taken and skipped doses from the last 30 days.</CardDescription></CardHeader><CardContent className="space-y-2">
              {doses.filter((dose) => dose.status !== "reminded").length === 0 && <p>No recorded doses yet.</p>}
              {doses.filter((dose) => dose.status !== "reminded").map((dose) => <p key={dose.id} className="rounded-xl bg-white/70 p-3 text-sm">{dose.scheduled_date} · {medicines.find((medicine) => medicine.id === dose.medicine_id)?.name ?? "Medicine"} · {dose.status === "taken" ? "Taken" : "Skipped"}</p>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Dose change history</CardTitle><CardDescription>Your latest 100 recorded changes, including corrections. Times are shown in this device&apos;s timezone.</CardDescription></CardHeader><CardContent className="space-y-2">
              {historyError && <p role="status">{historyError} <button className="underline" onClick={() => void reload(userId)}>Retry</button></p>}
              {!historyError && doseEvents.length === 0 && <p>No changes recorded yet.</p>}
              {doseEvents.map((event) => <div key={event.id} className="rounded-xl border bg-white/70 p-3 text-sm"><p className="font-semibold">{event.medicine_name} · {event.scheduled_date}</p><p>{describeMedicineDoseEvent(event)}</p><time dateTime={event.recorded_at} className="text-muted-foreground">{new Date(event.recorded_at).toLocaleString()}</time></div>)}
            </CardContent></Card>
            </>}
            {view === "manage" && medicines.some((medicine) => !medicine.active) && <Card><CardHeader><CardTitle>Paused medicines</CardTitle></CardHeader><CardContent className="space-y-2">{medicines.filter((medicine) => !medicine.active).map((medicine) => <div key={medicine.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 p-3"><span>{medicine.name}</span><Button variant="outline" size="sm" disabled={saving} onClick={() => void setActive(medicine, true)}><RotateCcw className="h-4 w-4" /> Resume</Button></div>)}</CardContent></Card>}
          </div>

          {view === "manage" && <div className="space-y-5 health-flip">
            {activeMedicines.length > 0 && <section aria-label="Saved medicines">{activeMedicines.map(medicine => <div key={medicine.id} className="health-row flex-wrap"><div className="min-w-0 flex-1"><p className="font-semibold">{medicine.name}</p><small>{medicine.dose_label} · {medicine.schedule_time.slice(0, 5)}</small></div><Button variant="outline" size="sm" onClick={() => { setEditingId(medicine.id); setForm({ name: medicine.name, dose_label: medicine.dose_label, schedule_time: medicine.schedule_time.slice(0, 5), timezone: medicine.timezone, food_rule: medicine.food_rule, notes: medicine.notes }); document.getElementById("medicine-name")?.focus(); }}>Edit</Button><Button variant="ghost" size="sm" disabled={saving} onClick={() => void setActive(medicine, false)}>Pause</Button></div>)}</section>}
            <Card id="medicine-form">
              <CardHeader><CardTitle>{editingId ? "Edit medicine" : "Add a medicine"}</CardTitle><CardDescription>Copy your prescription or package label. One schedule time per entry; add another entry for a second daily time.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={(event) => void saveMedicine(event)}><fieldset disabled={saving} className="space-y-4">
                  <div><Label htmlFor="medicine-name">Medicine name</Label><Input id="medicine-name" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                  <div><Label htmlFor="medicine-dose">Prescribed dose / label</Label><Input id="medicine-dose" required maxLength={100} placeholder="As written on the label" value={form.dose_label} onChange={(event) => setForm({ ...form, dose_label: event.target.value })} /></div>
                  <div><Label htmlFor="medicine-time">Daily time</Label><Input id="medicine-time" type="time" required value={form.schedule_time} onChange={(event) => setForm({ ...form, schedule_time: event.target.value })} /></div>
                  <div><Label htmlFor="medicine-food">Food instruction on the label</Label><select id="medicine-food" className="mt-1 h-11 w-full rounded-xl border border-input bg-white px-3" value={form.food_rule} onChange={(event) => setForm({ ...form, food_rule: event.target.value as FoodRule })}><option value="none">No food requirement stated</option><option value="with_food">With food</option><option value="before_food">Before food</option></select></div>
                  <div><Label htmlFor="medicine-timezone">Timezone</Label><Input id="medicine-timezone" required maxLength={100} value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></div>
                  <div><Label htmlFor="medicine-notes">Label notes (optional)</Label><Textarea id="medicine-notes" maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
                  <Button className="w-full" type="submit" disabled={saving || !userId}>{editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Saving…" : editingId ? "Save changes" : "Add medicine"}</Button>
                  {editingId && <Button className="w-full" type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(emptyForm(form.timezone)); }}>Cancel edit</Button>}
                </fieldset></form>
              </CardContent>
            </Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Reminders</CardTitle><CardDescription>The server checks your schedule while the app is closed.</CardDescription></CardHeader><CardContent className="space-y-3"><Link className="neo-secondary inline-flex" href="/notifications">Reminder settings</Link><p className="text-sm text-foreground/65"><Clock3 className="mr-1 inline h-4 w-4" />Medicine reminders use the saved timezone and daily time. Follow your prescribed instructions; this checklist does not change a dose.</p></CardContent></Card>
          </div>}
        </div>

      </div>
    </main>
  );
}
