"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Droplets,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Save,
  TimerReset,
  Utensils,
} from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { requireSignedInUser } from "@/lib/auth";
import {
  loadLatestUserSnapshot,
  prepareLocalUserSession,
  saveHealthStateWithHistory,
  storageKey,
} from "@/lib/health-sync";
import { scheduleMealSnoozeReminder } from "@/lib/push-notifications";

type MealType = "breakfast" | "lunch" | "dinner";

type MealLog = {
  type: MealType;
  plannedTime: string;
  actualTime: string;
  description: string;
  image: string;
  hunger: number;
  fullness: number;
  notes: string;
  status: "pending" | "logged" | "snoozed" | "skipped";
  snoozeLabel?: string;
};

type StoredAppState = {
  onboardingCompleted?: boolean;
  profile?: {
    name?: string;
    wakeTime?: string;
    breakfastTime?: string;
    lunchTime?: string;
    dinnerTime?: string;
    sleepReminder?: string;
    waterGoal?: number;
  };
  meals?: MealLog[];
  water?: number;
  sleep?: SleepLog;
  sleepCheckCompleted?: boolean;
  quoteIndex?: number;
  quoteFeedback?: unknown;
  updatedAt?: string;
};

type SleepLog = {
  sleptAt: string;
  wokeAt: string;
  hours: number;
  minutes: number;
  quality: "Great" | "Okay" | "Poor";
};

const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const mealExamples: Record<MealType, string> = {
  breakfast: "Example: idli, sambar, chutney, banana, and milk",
  lunch: "Example: rice, dal, vegetables, curd, and salad",
  dinner: "Example: chapati, curry, dal, and vegetables",
};

const defaultMealTimes: Record<MealType, string> = {
  breakfast: "08:30",
  lunch: "13:00",
  dinner: "20:00",
};

function createFallbackMeal(type: MealType, time = defaultMealTimes[type]): MealLog {
  return {
    type,
    plannedTime: time,
    actualTime: time,
    description: "",
    image: "",
    hunger: 3,
    fullness: 3,
    notes: "",
    status: "pending",
  };
}

const fallbackMeal = createFallbackMeal("lunch");

function getProfileMealTime(profile: StoredAppState["profile"], type: MealType) {
  const key = `${type}Time` as "breakfastTime" | "lunchTime" | "dinnerTime";
  return profile?.[key] ?? defaultMealTimes[type];
}

function createDefaultMeals(profile: StoredAppState["profile"]) {
  return (["breakfast", "lunch", "dinner"] as MealType[]).map((type) =>
    createFallbackMeal(type, getProfileMealTime(profile, type)),
  );
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function selectMealTypeForNow(meals: MealLog[], profile: StoredAppState["profile"]): MealType {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const times = Object.fromEntries(
    (["breakfast", "lunch", "dinner"] as MealType[]).map((type) => {
      const meal = meals.find((item) => item.type === type);
      return [type, minutesFromTime(meal?.plannedTime ?? getProfileMealTime(profile, type))];
    }),
  ) as Record<MealType, number>;

  if (currentMinutes >= times.dinner) return "dinner";
  if (currentMinutes >= times.lunch) return "lunch";
  return "breakfast";
}

function mergeMealList(savedMeals: MealLog[] | undefined, profile: StoredAppState["profile"]) {
  return createDefaultMeals(profile).map((defaultMeal) => {
    const savedMeal = savedMeals?.find((meal) => meal.type === defaultMeal.type);
    return savedMeal ? { ...defaultMeal, ...savedMeal } : defaultMeal;
  });
}

const fallbackSleep: SleepLog = {
  sleptAt: "23:15",
  wokeAt: "06:45",
  hours: 7,
  minutes: 30,
  quality: "Okay",
};

async function loadMealState() {
  let localState: StoredAppState | null = null;
  const savedState = localStorage.getItem(storageKey);

  if (savedState) {
    try {
      localState = JSON.parse(savedState) as StoredAppState;
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  const remoteState = await loadLatestUserSnapshot<StoredAppState & { date: string }>();
  if (remoteState?.onboardingCompleted && isRemoteNewer(remoteState, localState)) {
    localStorage.setItem(storageKey, JSON.stringify(remoteState));
    return remoteState;
  }

  return localState;
}

function isRemoteNewer(remote: StoredAppState | null, local: StoredAppState | null) {
  if (!remote) return false;
  if (!local) return true;

  const remoteTime = new Date(remote.updatedAt ?? 0).getTime();
  const localTime = new Date(local.updatedAt ?? 0).getTime();

  return remoteTime > localTime;
}

export default function LunchMealPage() {
  const showToast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [appState, setAppState] = useState<StoredAppState>({});
  const [activeMealType, setActiveMealType] = useState<MealType>("lunch");
  const [meal, setMeal] = useState<MealLog>(fallbackMeal);
  const [sleep, setSleep] = useState<SleepLog>(fallbackSleep);
  const [view, setView] = useState<"prompt" | "camera" | "water" | "sleep" | "details">("prompt");
  const [cameraState, setCameraState] = useState<"idle" | "active" | "blocked">("idle");
  const [cameraMessage, setCameraMessage] = useState("Open the camera when your meal is ready.");
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [waterFromPrevious, setWaterFromPrevious] = useState(0);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function loadMeal() {
      const user = await requireSignedInUser();
      if (!user) return;
      prepareLocalUserSession(user.id);

      const parsed = await loadMealState();
      if (!parsed) {
        const mealType = selectMealTypeForNow(createDefaultMeals(undefined), undefined);
        setActiveMealType(mealType);
        setMeal(createFallbackMeal(mealType));
        return;
      }

      const meals = mergeMealList(parsed.meals, parsed.profile);
      const mealType = selectMealTypeForNow(meals, parsed.profile);
      const selectedMeal = meals.find((item) => item.type === mealType) ?? createFallbackMeal(mealType);
      setAppState(parsed);
      setActiveMealType(mealType);
      setMeal(selectedMeal);
      setSleep(parsed.sleep ?? fallbackSleep);
      setWaterFromPrevious(0);
    }

    void loadMeal();
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    const clearRescheduleMessage = () => setRescheduleMessage("");
    window.addEventListener("popstate", clearRescheduleMessage);

    return () => window.removeEventListener("popstate", clearRescheduleMessage);
  }, []);

  useEffect(() => {
    if (view === "camera" && cameraState === "idle") {
      void startCamera();
    }
  }, [cameraState, view]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraState("active");
      setCameraMessage("Please open the lid if it is closed, then capture your meal.");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraState("blocked");
      setCameraMessage("Camera permission is blocked or unavailable on this device.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function persistMealState(nextState: StoredAppState, successMessage?: string) {
    setSyncing(true);
    const synced = await saveHealthStateWithHistory(nextState).catch(() => false);
    setSyncing(false);
    setAppState(nextState);

    if (successMessage) {
      showToast(synced ? successMessage : `${successMessage} on this device. Cloud sync failed.`);
    } else if (!synced) {
      showToast("Saved on this device. Cloud sync failed.");
    }

    return synced;
  }

  async function captureImage() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    const maxSize = 960;
    const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedImage = canvas.toDataURL("image/jpeg", 0.72);
    const nextMeal = {
      ...meal,
      image: capturedImage,
    };
    const currentMeals = mergeMealList(appState.meals, appState.profile);
    const meals = currentMeals.map((item) =>
      item.type === activeMealType ? nextMeal : item,
    );
    const nextState = { ...appState, meals };

    await persistMealState(nextState, "Meal photo saved");
    setMeal(nextMeal);
    stopCamera();
    setCameraState("idle");
    setView("water");
    setSaved(false);
  }

  async function saveWaterAndContinue() {
    const nextWater = (appState.water ?? 0) + waterFromPrevious;
    const nextState = { ...appState, water: nextWater };
    await persistMealState(nextState, "Water check saved");
    setView(nextState.sleepCheckCompleted ? "details" : "sleep");
  }

  async function saveSleepAndContinue() {
    const nextState = { ...appState, sleep, sleepCheckCompleted: true };
    await persistMealState(nextState, "Sleep check saved");
    setView("details");
  }

  async function saveMeal() {
    const updatedMeal: MealLog = {
      ...meal,
      status: "logged",
      actualTime: meal.actualTime || meal.plannedTime,
    };

    const currentMeals = mergeMealList(appState.meals, appState.profile);
    const meals = currentMeals.map((item) =>
      item.type === activeMealType ? updatedMeal : item,
    );

    const nextState = {
      ...appState,
      meals,
    };

    await persistMealState(nextState, `${mealLabels[activeMealType]} has saved`);
    setMeal(updatedMeal);
    setSaved(true);
  }

  async function reschedule(minutes: number) {
    const snoozeLabel = minutes === 60 ? "+1hr" : `+${minutes} min`;
    const date = new Date(Date.now() + minutes * 60 * 1000);
    const plannedTime = `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;

    const nextMeal: MealLog = { ...meal, plannedTime, status: "snoozed", snoozeLabel };
    const currentMeals = mergeMealList(appState.meals, appState.profile);
    const meals = currentMeals.map((item) =>
      item.type === activeMealType ? nextMeal : item,
    );
    const nextState = { ...appState, meals };

    await persistMealState(nextState);
    void scheduleMealSnoozeReminder({
      mealType: activeMealType,
      delayMinutes: minutes,
    });
    setMeal(nextMeal);
    window.history.pushState({ mealRescheduled: true }, "", window.location.href);
    setRescheduleMessage(`Done, let's meet after ${snoozeLabel} 🥺`);
    showToast(`Reminder moved by ${minutes === 60 ? "1 hour" : `${minutes} minutes`}`);
    setSaved(false);
  }

  function openCamera() {
    setSaved(false);
    setMeal((current) => ({ ...current, image: "" }));
    setCameraState("idle");
    setCameraMessage("Starting camera...");
    setView("camera");
  }

  const waterGoal = appState.profile?.waterGoal ?? 2500;
  const currentWater = appState.water ?? 0;
  const previewWater = currentWater + waterFromPrevious;
  const waterPercent = Math.min(100, Math.round((previewWater / waterGoal) * 100));
  const mealLabel = mealLabels[activeMealType];
  const mealLabelLower = mealLabel.toLowerCase();

  if (view === "camera") {
    return (
      <main className="fixed inset-0 z-50 min-h-screen overflow-hidden bg-black text-white">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover"
        />

        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-lg border border-white/20 bg-black/65 p-4 shadow-soft backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-black">
              <Utensils className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">Meal check</p>
              <p className="mt-1 text-sm leading-6 text-white/85">
                Please open the lid if it is closed.
              </p>
            </div>
          </div>
        </div>

        {cameraState === "blocked" && (
          <div className="absolute inset-x-4 top-32 rounded-lg border border-red-200/40 bg-red-950/80 p-4 text-sm text-red-50 backdrop-blur">
            {cameraMessage}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <div
          className="fixed inset-x-0 z-20 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-6 pt-16"
          style={{ bottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="mx-auto grid max-w-sm grid-cols-[56px_1fr_56px] items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 border-white/40 bg-black/35 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              onClick={() => {
                stopCamera();
                setCameraState("idle");
                setView("prompt");
              }}
              title="Back"
            >
              <ArrowLeft />
            </Button>
            <Button
              className="mx-auto h-16 min-w-36 rounded-full border-4 border-white bg-white px-6 text-base font-semibold text-black shadow-soft hover:bg-white/90 disabled:opacity-60"
              onClick={captureImage}
              disabled={cameraState !== "active" || syncing}
              title="Capture meal"
            >
              <Camera className="h-7 w-7" />
              Capture
            </Button>
            <div aria-hidden />
          </div>
        </div>
      </main>
    );
  }

  if (rescheduleMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="glass-shell flex w-full max-w-md flex-col items-center gap-5 rounded-lg p-5 text-center">
          <div className="glass-surface overflow-hidden rounded-lg p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/reschedule-character.jpg"
              alt="Emotional reminder friend"
              className="h-64 w-64 object-cover"
            />
          </div>
          <p className="text-3xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
            {rescheduleMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <AppNav title={`${mealLabel} check-in`} />
      <div className="glass-shell mx-auto w-full max-w-3xl space-y-5 rounded-lg p-3 sm:p-5">
        {meal.status === "snoozed" && (
          <div className="glass-surface rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-center text-base font-semibold text-amber-950 shadow-soft">
            {mealLabel} is rescheduled to {meal.snoozeLabel ?? meal.plannedTime} 🥺
          </div>
        )}

        {view === "prompt" && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Camera className="h-5 w-5" />
                  Capture your meal
                </CardTitle>
                <CardDescription>
                  Open the camera and take a fresh {mealLabelLower} photo.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button className="w-full" onClick={openCamera} disabled={syncing}>
                  <Camera />
                  Open camera
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TimerReset className="h-5 w-5" />
                  Not your meal time?
                </CardTitle>
                <CardDescription>
                  Move the reminder and come back when {mealLabelLower} is ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => reschedule(15)} disabled={syncing}>
                  +15
                </Button>
                <Button variant="outline" size="sm" onClick={() => reschedule(30)} disabled={syncing}>
                  +30
                </Button>
                <Button variant="outline" size="sm" onClick={() => reschedule(60)} disabled={syncing}>
                  +1hr
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {view === "details" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Utensils className="h-5 w-5" />
                {mealLabel} info
              </CardTitle>
              <CardDescription>
                Add the {mealLabelLower} details after capturing the meal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {meal.image && (
                <div className="glass-surface overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={meal.image}
                    alt={`Captured ${mealLabelLower}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">What did you have for {mealLabelLower}?</Label>
                <Textarea
                  id="description"
                  placeholder={mealExamples[activeMealType]}
                  value={meal.description}
                  onChange={(event) => {
                    setMeal((current) => ({ ...current, description: event.target.value }));
                    setSaved(false);
                  }}
                />
              </div>

              {saved && (
                <div className="rounded-lg border border-zinc-950/20 bg-white/70 p-3 text-sm font-medium text-zinc-950 backdrop-blur">
                  {mealLabel} saved. The dashboard will show this meal as logged.
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" onClick={saveMeal} disabled={syncing}>
                <Save />
                Save {mealLabelLower}
              </Button>
              <Button className="w-full sm:w-auto" variant="outline" onClick={openCamera} disabled={syncing}>
                <RotateCcw />
                Retake
              </Button>
            </CardFooter>
          </Card>
        )}

        {view === "sleep" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Moon className="h-5 w-5 text-indigo-700" />
                Sleep check-in
              </CardTitle>
              <CardDescription>
                Looks like the morning sleep notification was skipped. Please answer it here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meal-slept-at">What time did you sleep?</Label>
                  <Input
                    id="meal-slept-at"
                    type="time"
                    value={sleep.sleptAt}
                    onChange={(event) =>
                      setSleep((current) => ({ ...current, sleptAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meal-woke-at">What time did you wake up?</Label>
                  <Input
                    id="meal-woke-at"
                    type="time"
                    value={sleep.wokeAt}
                    onChange={(event) =>
                      setSleep((current) => ({ ...current, wokeAt: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="glass-surface rounded-lg p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Label>Sleep hours</Label>
                    <p className="text-xl font-semibold">{sleep.hours} hr</p>
                  </div>
                  <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setSleep((current) => ({
                          ...current,
                          hours: Math.max(0, current.hours - 1),
                        }))
                      }
                    >
                      <Minus />
                    </Button>
                    <input
                      aria-label="Sleep hours"
                      type="range"
                      min={0}
                      max={14}
                      step={1}
                      value={sleep.hours}
                      onChange={(event) =>
                        setSleep((current) => ({
                          ...current,
                          hours: Number(event.target.value),
                        }))
                      }
                      className="h-2 w-full cursor-pointer accent-primary"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setSleep((current) => ({
                          ...current,
                          hours: Math.min(14, current.hours + 1),
                        }))
                      }
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>

                <div className="glass-surface rounded-lg p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Label>Sleep minutes</Label>
                    <p className="text-xl font-semibold">{sleep.minutes} min</p>
                  </div>
                  <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setSleep((current) => ({
                          ...current,
                          minutes: Math.max(0, current.minutes - 5),
                        }))
                      }
                    >
                      <Minus />
                    </Button>
                    <input
                      aria-label="Sleep minutes"
                      type="range"
                      min={0}
                      max={55}
                      step={5}
                      value={sleep.minutes}
                      onChange={(event) =>
                        setSleep((current) => ({
                          ...current,
                          minutes: Number(event.target.value),
                        }))
                      }
                      className="h-2 w-full cursor-pointer accent-primary"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setSleep((current) => ({
                          ...current,
                          minutes: Math.min(55, current.minutes + 5),
                        }))
                      }
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sleep quality</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Great", "Okay", "Poor"] as SleepLog["quality"][]).map((quality) => (
                    <Button
                      key={quality}
                      variant={sleep.quality === quality ? "default" : "outline"}
                      onClick={() => setSleep((current) => ({ ...current, quality }))}
                    >
                      {quality}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" onClick={saveSleepAndContinue} disabled={syncing}>
                <Moon />
                Save sleep
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => setView("details")}
              >
                Skip sleep
              </Button>
            </CardFooter>
          </Card>
        )}

        {view === "water" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Droplets className="h-5 w-5 text-cyan-700" />
                Water check
              </CardTitle>
              <CardDescription>
                How much water did you drink since the previous section?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {meal.image && (
                <div className="glass-surface overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={meal.image}
                    alt={`Captured ${mealLabelLower}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
                <div className="mx-auto flex h-72 w-32 items-end overflow-hidden rounded-b-[40px] rounded-t-lg border-4 border-white/70 bg-white/45 shadow-soft backdrop-blur-xl">
                  <div
                    className="w-full bg-cyan-500 transition-all duration-700 ease-out"
                    style={{ height: `${waterPercent}%` }}
                    aria-label={`Water bottle ${waterPercent}% full`}
                  />
                </div>

                <div className="space-y-4">
                  <div className="glass-surface rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Water from previous section</p>
                    <p className="mt-2 text-3xl font-semibold">{waterFromPrevious} ml</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Daily bottle preview: {previewWater} ml / {waterGoal} ml
                    </p>
                  </div>

                  <div className="glass-surface grid grid-cols-[48px_1fr_48px] items-center gap-3 rounded-lg p-4">
                    <Button
                      variant="outline"
                      size="icon"
                      title="Decrease water"
                      onClick={() =>
                        setWaterFromPrevious((current) => Math.max(0, current - 100))
                      }
                    >
                      <Minus />
                    </Button>
                    <input
                      aria-label="Water from previous section"
                      type="range"
                      min={0}
                      max={2000}
                      step={100}
                      value={waterFromPrevious}
                      onChange={(event) => setWaterFromPrevious(Number(event.target.value))}
                      className="h-2 w-full cursor-pointer accent-primary"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      title="Increase water"
                      onClick={() =>
                        setWaterFromPrevious((current) => Math.min(2000, current + 100))
                      }
                    >
                      <Plus />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[250, 500, 750].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        onClick={() => setWaterFromPrevious(amount)}
                      >
                        {amount} ml
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" onClick={saveWaterAndContinue} disabled={syncing}>
                <Droplets />
                Continue
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => setView(appState.sleepCheckCompleted ? "details" : "sleep")}
              >
                Skip water
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </main>
  );
}
