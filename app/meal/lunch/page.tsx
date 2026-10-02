"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, ChevronLeft, ImagePlus, Utensils, X } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { MealImage } from "@/components/meal-image";
import { HealthSyncStatus } from "@/components/sync-status";
import { useDailyHealth } from "@/components/use-daily-health";
import { formatTime, mealLabels, mealTypes, nextMeal, type Meal, type MealType } from "@/lib/daily-health";
import { getLocalDateForState } from "@/lib/health-sync";
import { scheduleMealSnoozeReminder } from "@/lib/push-notifications";
import { uploadMealImage } from "@/lib/meal-images";

export default function LunchMealPage() {
  const { state, busy, error, update, reload } = useDailyHealth();
  const [selected, setSelected] = useState<MealType | null>(null);
  const [draft, setDraft] = useState<Meal | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [uploading, setUploading] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const draftDay = useRef<string | undefined>(undefined);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (state && draftDay.current && draftDay.current !== state.date) { setSelected(null); setDraft(null); setNotice(""); setCamera(false); }
    if (state) draftDay.current = state.date;
    if (!state || initialized.current) return;
    initialized.current = true;
    const requested = new URLSearchParams(window.location.search).get("meal") as MealType;
    const type = mealTypes.includes(requested) ? requested : null;
    if (type) { setSelected(type); setDraft(state.meals.find(meal => meal.type === type)!); }
  }, [state]);
  useEffect(() => {
    if (!camera) return;
    dialog.current?.showModal();
    let cancelled = false;
    setCameraError("");
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(media => {
      if (cancelled) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => setCameraError("Camera could not start. You can choose a photo instead.")); }
    }).catch(() => setCameraError("Camera unavailable. Choose a photo or continue without one."));
    if (!navigator.mediaDevices) setCameraError("Camera unavailable. Choose a photo instead.");
    return () => { cancelled = true; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
  }, [camera]);
  function choose(type: MealType) {
    if (!state) return;
    setSelected(type); setDraft({ ...state.meals.find(meal => meal.type === type)! }); setNotice(""); setFailure("");
  }
  async function addPhoto(file: Blob) {
    if (!state || !selected || uploading) return;
    setUploading(true); setFailure("");
    try { const image = await uploadMealImage(file, getLocalDateForState(state), selected); setDraft(current => current ? { ...current, image } : current); setCamera(false); }
    catch (error) { setFailure(error instanceof Error ? error.message : "Photo upload failed. You can still save without it."); }
    finally { setUploading(false); }
  }
  async function capture() {
    if (!video.current?.videoWidth || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 960 / Math.max(video.current.videoWidth, video.current.videoHeight));
      canvas.width = Math.round(video.current.videoWidth * scale); canvas.height = Math.round(video.current.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .75));
      if (blob) await addPhoto(blob); else setFailure("Could not capture the photo. Please retry.");
    } finally { setCapturing(false); }
  }
  async function save(status: "logged" | "skipped") {
    if (!state || !draft || busy) return;
    if (await update({ meals: state.meals.map(meal => meal.type === selected ? { ...draft, status } : meal) })) { setSelected(null); setDraft(null); setNotice(status === "logged" ? "Meal recorded. You're all set." : "Meal marked as skipped. You can change it anytime."); }
  }
  async function snooze(minutes: number) {
    if (!state || !selected || snoozing) return;
    setSnoozing(true); setFailure("");
    try {
      await scheduleMealSnoozeReminder({ mealType: selected, delayMinutes: minutes });
      const plannedTime = new Intl.DateTimeFormat("en-GB", { timeZone: state.profile.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + minutes * 60000));
      if (await update({ meals: state.meals.map(meal => meal.type === selected ? { ...meal, status: "snoozed", plannedTime } : meal) })) { setNotice(`Reminder moved to ${formatTime(plannedTime)}.`); setSelected(null); setDraft(null); }
    } catch (error) { setFailure(error instanceof Error ? error.message : "Could not move your reminder."); }
    finally { setSnoozing(false); }
  }
  const disabled = busy || uploading || snoozing || capturing;
  return <main className="health-page"><AppNav /><div className="health-content">
    <h1 className="health-heading">Meals</h1><p className="health-description">A quick check-in, at your own pace.</p>
    {error && <p role="alert" className="health-notice health-error mt-5">{error} <button className="underline" onClick={() => void reload()}>Retry</button></p>}
    {failure && <p role="alert" className="health-notice health-error mt-5">{failure}</p>}
    {notice && <p role="status" className="health-notice health-flip mt-5"><Check className="mr-2 inline h-4 w-4" />{notice}</p>}
    {!state && !error && <p role="status" className="mt-6">Loading your meals…</p>}
    {state && !selected && <section className="mt-5" aria-label="Today's meals">{state.meals.map(meal => <button className="health-row w-full text-left" key={meal.type} onClick={() => choose(meal.type)}><span className="neo-icon sage"><Utensils size={22} /></span><span className="flex-1 font-semibold">{mealLabels[meal.type]}<small>{formatTime(meal.plannedTime)} · {meal.status === "logged" ? "Recorded · Edit entry" : meal.status === "skipped" ? "Skipped · Edit entry" : meal.status === "snoozed" ? "Reminder moved" : "Not logged yet"}</small></span>{nextMeal(state)?.type === meal.type ? <span className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">Up next</span> : <span aria-hidden="true">→</span>}</button>)}</section>}
    {state && selected && draft && <section key={selected} className="health-flip mt-5">
      <button className="mb-5 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary" disabled={disabled} onClick={() => { setSelected(null); setDraft(null); }}><ChevronLeft size={18} /> All meals</button>
      <form className="health-form" onSubmit={event => { event.preventDefault(); void save("logged"); }}>
        <h2 className="text-2xl font-bold">{mealLabels[selected]} check-in</h2>
        <label>What did you eat?<textarea value={draft.description} maxLength={2000} placeholder="For example, rice, dal and vegetables" onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Meal time<input required type="time" value={draft.actualTime} onChange={event => setDraft({ ...draft, actualTime: event.target.value })} /></label>
        {draft.image && <div><MealImage image={draft.image} alt={`${mealLabels[selected]} photo`} className="max-h-64 w-full rounded-xl object-cover" /><button type="button" className="mt-2 min-h-11 text-sm underline" disabled={disabled} onClick={() => setDraft({ ...draft, image: "" })}>Remove photo from this entry</button></div>}
        <div><p className="mb-3 text-sm text-muted-foreground">Photo optional</p><div className="flex flex-wrap gap-3"><button className="neo-secondary text-sm" type="button" disabled={disabled} onClick={() => setCamera(true)}><Camera size={18} />Take photo</button><button className="neo-secondary text-sm" type="button" disabled={disabled} onClick={() => upload.current?.click()}><ImagePlus size={18} />{uploading ? "Uploading…" : "Choose photo"}</button></div><input ref={upload} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Choose meal photo" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; if (file) void addPhoto(file); event.target.value = ""; }} /></div>
        <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">More details (optional)</summary><div className="mt-3 grid gap-4"><label>Notes<textarea value={draft.notes} maxLength={2000} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label><label>Hunger before meal · {draft.hunger}/5<input type="range" min={1} max={5} value={draft.hunger} onChange={event => setDraft({ ...draft, hunger: Number(event.target.value) })} /></label><label>Fullness after meal · {draft.fullness}/5<input type="range" min={1} max={5} value={draft.fullness} onChange={event => setDraft({ ...draft, fullness: Number(event.target.value) })} /></label></div></details>
        <button className="neo-primary w-full" disabled={disabled}>{busy ? "Saving…" : draft.status === "logged" ? "Save changes" : `Save ${mealLabels[selected].toLowerCase()}`}</button>
        <button type="button" className="min-h-11 text-sm font-semibold text-primary" disabled={disabled} onClick={() => void save("skipped")}>Skip this meal today</button>
      </form>
      <details className="mt-5 border-t pt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Remind me later</summary><div className="mt-2 flex flex-wrap gap-3">{[15, 30, 60].map(minutes => <button className="neo-secondary flex-1 text-sm" key={minutes} disabled={disabled} onClick={() => void snooze(minutes)}>{minutes} min</button>)}</div></details>
    </section>}
    {!selected && state && <p className="mt-8 text-sm text-muted-foreground">Meal times changed? <Link className="font-semibold text-primary underline" href="/profile">Edit your routine</Link></p>}
  </div><HealthSyncStatus />
  {camera && <dialog ref={dialog} aria-label="Meal camera" onCancel={event => { if (disabled) event.preventDefault(); else setCamera(false); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-black p-5 text-white open:flex"><div className="flex items-center justify-between"><h2>Meal photo</h2><button className="icon-button" aria-label="Close camera" disabled={disabled} onClick={() => setCamera(false)}><X /></button></div><video ref={video} muted playsInline className="my-4 min-h-0 flex-1 rounded-xl object-contain" />{cameraError && <p role="alert">{cameraError}</p>}{failure && <p role="alert">{failure}</p>}<div className="flex flex-wrap justify-center gap-4 pb-8"><button className="neo-secondary" disabled={disabled || Boolean(cameraError)} onClick={() => void capture()}>{uploading || capturing ? "Saving photo…" : "Capture photo"}</button><button className="min-h-11 underline" disabled={disabled} onClick={() => setCamera(false)}>Continue without camera</button></div></dialog>}
  </main>;
}
