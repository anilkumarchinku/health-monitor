"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Camera,
  ChevronDown,
  Check,
  Clock,
  Droplets,
  History,
  Home,
  ImagePlus,
  LogOut,
  Minus,
  Moon,
  Plus,
  Save,
  Share2,
  Shield,
  Sparkles,
  Sun,
  ThumbsDown,
  ThumbsUp,
  TimerReset,
  Utensils,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { BrandLogo } from "@/components/brand-logo";
import { requireSignedInUser, signOut } from "@/lib/auth";
import { saveHealthStateWithHistory, storageKey } from "@/lib/health-sync";
import {
  enablePushNotifications,
  scheduleTodayLocalMealReminders,
  sendTestPushNotification,
} from "@/lib/push-notifications";

type MealType = "breakfast" | "lunch" | "dinner";
type QuoteFeedback = "liked" | "disliked" | null;

type Profile = {
  name: string;
  wakeTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  sleepReminder: string;
  waterGoal: number;
  timezone: string;
};

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
};

type SleepLog = {
  sleptAt: string;
  wokeAt: string;
  hours: number;
  minutes: number;
  quality: "Great" | "Okay" | "Poor";
};

const defaultProfile: Profile = {
  name: "Sweetheart",
  wakeTime: "07:00",
  breakfastTime: "08:30",
  lunchTime: "13:00",
  dinnerTime: "20:00",
  sleepReminder: "22:30",
  waterGoal: 2500,
  timezone: "Asia/Kolkata",
};

const quotes = [
  {
    text: "Confidence grows when you keep promises to yourself, even the small ones.",
    author: "Dee Meal Monitor System",
  },
  {
    text: "Begin gently. Courage does not need noise to be real.",
    author: "Dee Meal Monitor System",
  },
  {
    text: "Your body listens to the way you care for it today.",
    author: "Dee Meal Monitor System",
  },
];

const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

type StoredHomeState = {
  onboardingCompleted?: boolean;
  profile?: Profile;
  meals?: MealLog[];
  water?: number;
  sleep?: SleepLog;
  sleepCheckCompleted?: boolean;
  quoteIndex?: number;
  quoteFeedback?: QuoteFeedback;
};

function createMeals(profile: Profile): MealLog[] {
  return [
    {
      type: "breakfast",
      plannedTime: profile.breakfastTime,
      actualTime: profile.breakfastTime,
      description: "",
      image: "",
      hunger: 3,
      fullness: 3,
      notes: "",
      status: "pending",
    },
    {
      type: "lunch",
      plannedTime: profile.lunchTime,
      actualTime: profile.lunchTime,
      description: "",
      image: "",
      hunger: 3,
      fullness: 3,
      notes: "",
      status: "pending",
    },
    {
      type: "dinner",
      plannedTime: profile.dinnerTime,
      actualTime: profile.dinnerTime,
      description: "",
      image: "",
      hunger: 3,
      fullness: 3,
      notes: "",
      status: "pending",
    },
  ];
}

function mergeMeals(savedMeals: MealLog[] | undefined, profile: Profile) {
  const defaults = createMeals(profile);
  return defaults.map((defaultMeal) => {
    const savedMeal = savedMeals?.find((meal) => meal.type === defaultMeal.type);
    return savedMeal ? { ...defaultMeal, ...savedMeal } : defaultMeal;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatWater(amount: number) {
  if (amount >= 1000) return `${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)} L`;
  return `${amount} ml`;
}

export default function HomePage() {
  const showToast = useToast();
  const [isReady, setIsReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [meals, setMeals] = useState<MealLog[]>(() => createMeals(defaultProfile));
  const [water, setWater] = useState(900);
  const [sleep, setSleep] = useState<SleepLog>({
    sleptAt: "23:15",
    wokeAt: "06:45",
    hours: 7,
    minutes: 30,
    quality: "Okay",
  });
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteFeedback, setQuoteFeedback] = useState<QuoteFeedback>(null);
  const [sleepCheckCompleted, setSleepCheckCompleted] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("Not enabled");
  const [activeMeal, setActiveMeal] = useState<MealType>("breakfast");
  const [expandedSections, setExpandedSections] = useState({
    morningBoost: true,
    todaysCheckIn: true,
    profileSchedule: false,
    todayTimeline: false,
  });

  useEffect(() => {
    async function boot() {
      const user = await requireSignedInUser();
      if (!user) return;
      loadStoredState({ redirectIfMissing: true });
    }

    void boot();

    function refreshFromStorage() {
      loadStoredState();
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        loadStoredState();
      }
    }

    window.addEventListener("focus", refreshFromStorage);
    window.addEventListener("pageshow", refreshFromStorage);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshFromStorage);
      window.removeEventListener("pageshow", refreshFromStorage);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  function loadStoredState(options?: { redirectIfMissing?: boolean }) {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      if (options?.redirectIfMissing) window.location.href = "/onboarding";
      return;
    }

    try {
      const parsed = JSON.parse(saved) as StoredHomeState;
      if (!parsed.onboardingCompleted) {
        if (options?.redirectIfMissing) window.location.href = "/onboarding";
        return;
      }

      const nextProfile = { ...defaultProfile, ...(parsed.profile ?? {}) };
      setProfile(nextProfile);
      setMeals(mergeMeals(parsed.meals, nextProfile));
      setWater(parsed.water ?? 0);
      setSleep(parsed.sleep ?? {
        sleptAt: "23:15",
        wokeAt: "06:45",
        hours: 7,
        minutes: 30,
        quality: "Okay",
      });
      setSleepCheckCompleted(parsed.sleepCheckCompleted ?? false);
      setQuoteIndex(parsed.quoteIndex ?? 0);
      setQuoteFeedback(parsed.quoteFeedback ?? null);
      setIsReady(true);
    } catch {
      localStorage.removeItem(storageKey);
      if (options?.redirectIfMissing) window.location.href = "/onboarding";
    }
  }

  useEffect(() => {
    if (!isReady) return;

    void saveHealthStateWithHistory({
      profile,
      onboardingCompleted: true,
      meals,
      water,
      sleep,
      sleepCheckCompleted,
      quoteIndex,
      quoteFeedback,
    });
  }, [isReady, profile, meals, water, sleep, sleepCheckCompleted, quoteIndex, quoteFeedback]);

  useEffect(() => {
    if (!isReady) return;
    void scheduleTodayLocalMealReminders(meals);
  }, [isReady, meals]);

  const activeMealLog = meals.find((meal) => meal.type === activeMeal) ?? meals[0];
  const loggedMeals = meals.filter((meal) => meal.status === "logged").length;
  const waterPercent = clamp(Math.round((water / profile.waterGoal) * 100), 0, 100);
  const sleepMinutes = sleep.hours * 60 + sleep.minutes;
  const sleepPercent = clamp(Math.round((sleepMinutes / 480) * 100), 0, 100);
  const wellnessScore = Math.round(
    (loggedMeals / 3) * 40 + (waterPercent / 100) * 35 + (sleepPercent / 100) * 25,
  );

  const nextReminder = useMemo(() => {
    const pending = meals.find((meal) => meal.status === "pending");
    if (pending) return `${mealLabels[pending.type]} at ${pending.plannedTime}`;
    return `Sleep check-in at ${profile.sleepReminder}`;
  }, [meals, profile.sleepReminder]);

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateMeal(type: MealType, patch: Partial<MealLog>) {
    setMeals((current) =>
      current.map((meal) => (meal.type === type ? { ...meal, ...patch } : meal)),
    );
  }

  function toggleSection(section: keyof typeof expandedSections) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function updateSleep(patch: Partial<SleepLog>) {
    setSleep((current) => ({ ...current, ...patch }));
    setSleepCheckCompleted(true);
  }

  function handleImageUpload(type: MealType, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      updateMeal(type, { image: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  async function enableNotifications() {
    const result = await enablePushNotifications();
    const labels: Record<typeof result, string> = {
      blocked: "Blocked",
      enabled: "Push enabled",
      "not-configured": "Setup needed",
      "signed-out": "Sign in first",
      unsupported: "Unsupported",
    };
    setNotificationStatus(labels[result]);
    showToast(result === "enabled" ? "Push notifications enabled" : labels[result]);
  }

  async function sendTestNotification() {
    const result = await sendTestPushNotification();
    setNotificationStatus(result === "sent" ? "Test sent" : "Enable first");
    showToast(result === "sent" ? "Test push sent" : "Enable notifications first");
  }

  function rescheduleMeal(type: MealType, minutes: number) {
    const meal = meals.find((item) => item.type === type);
    if (!meal) return;

    const [hour, minute] = meal.plannedTime.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute + minutes, 0, 0);
    const nextTime = `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
    updateMeal(type, { plannedTime: nextTime, status: "snoozed" });
    showToast(`${mealLabels[type]} reminder moved`);
  }

  function resetToday() {
    setMeals(createMeals(profile));
    setWater(0);
    setQuoteFeedback(null);
    showToast("Today has been reset");
  }

  const quote = quotes[quoteIndex];

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-sm text-center">
          <CardHeader>
            <CardTitle>Setting things up</CardTitle>
            <CardDescription>Taking you to onboarding.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <section className="glass-shell mx-auto max-w-7xl rounded-lg">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <BrandLogo />
              <div>
                <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                  Good morning, {profile.name}
                </h1>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="bg-white/65 backdrop-blur" variant="outline" onClick={enableNotifications}>
                <Bell />
                {notificationStatus}
              </Button>
              <Button className="bg-white/65 backdrop-blur" variant="outline" onClick={sendTestNotification}>
                <Bell />
                Test push
              </Button>
              <Button asChild className="bg-white/65 backdrop-blur" variant="outline">
                <Link href="/meal/lunch">
                  <Utensils />
                  Lunch page
                </Link>
              </Button>
              <Button asChild className="bg-white/65 backdrop-blur" variant="outline">
                <Link href="/history">
                  <History />
                  History
                </Link>
              </Button>
              <Button asChild className="bg-white/65 backdrop-blur" variant="outline">
                <Link href="/profile">
                  <User />
                  Profile
                </Link>
              </Button>
              <Button asChild className="bg-white/65 backdrop-blur" variant="outline">
                <Link href="/admin">
                  <Shield />
                  Admin
                </Link>
              </Button>
              <Button className="bg-zinc-950 text-white hover:bg-zinc-800" variant="secondary" onClick={resetToday}>
                <TimerReset />
                Reset today
              </Button>
              <Button className="bg-white/65 backdrop-blur" variant="outline" onClick={() => void signOut()}>
                <LogOut />
                Sign out
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<Clock className="h-4 w-4" />}
              label="Next reminder"
              value={nextReminder}
              dark
            />
            <MetricCard
              icon={<Utensils className="h-4 w-4" />}
              label="Meals logged"
              value={`${loggedMeals}/3`}
            />
            <MetricCard
              icon={<Droplets className="h-4 w-4" />}
              label="Water"
              value={`${waterPercent}%`}
            />
            <MetricCard
              icon={<Sparkles className="h-4 w-4" />}
              label="Wellness score"
              value={`${wellnessScore}/100`}
              dark
            />
          </div>
        </div>
      </section>

      <div className="glass-shell mx-auto mt-5 grid w-full max-w-7xl gap-5 rounded-lg p-3 sm:p-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sun className="h-5 w-5 text-amber-600" />
                    Morning boost
                  </CardTitle>
                  <CardDescription>
                    A confidence note to start the day with steadiness.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Quote review pending</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-expanded={expandedSections.morningBoost}
                    title={expandedSections.morningBoost ? "Collapse" : "Expand"}
                    onClick={() => toggleSection("morningBoost")}
                  >
                    <ChevronDown
                      className={`transition-transform ${
                        expandedSections.morningBoost ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {expandedSections.morningBoost && (
              <CardContent className="space-y-4">
                <blockquote className="border-l-4 border-primary pl-4 text-lg font-medium leading-8">
                  {quote.text}
                </blockquote>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">{quote.author}</p>
                  <div className="flex gap-2">
                    <Button
                      variant={quoteFeedback === "liked" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setQuoteFeedback("liked")}
                      title="Like quote"
                    >
                      <ThumbsUp />
                      Like
                    </Button>
                    <Button
                      variant={quoteFeedback === "disliked" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setQuoteFeedback("disliked")}
                      title="Dislike quote"
                    >
                      <ThumbsDown />
                      Dislike
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQuoteIndex((current) => (current + 1) % quotes.length);
                        setQuoteFeedback(null);
                      }}
                    >
                      <Sparkles />
                      Another
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Utensils className="h-5 w-5" />
                    Today&apos;s check-in
                  </CardTitle>
                  <CardDescription>
                    Expand this to log meals, water, sleep, and your end-of-day review.
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-expanded={expandedSections.todaysCheckIn}
                  title={expandedSections.todaysCheckIn ? "Collapse" : "Expand"}
                  onClick={() => toggleSection("todaysCheckIn")}
                >
                  <ChevronDown
                    className={`transition-transform ${
                      expandedSections.todaysCheckIn ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </div>
            </CardHeader>
            {expandedSections.todaysCheckIn && (
              <CardContent>
                <Tabs defaultValue="meals" className="w-full">
                  <TabsList className="grid h-auto w-full grid-cols-4 border border-white/50 bg-white/45 backdrop-blur-xl">
                    <TabsTrigger value="meals">
                      <Utensils className="mr-2 h-4 w-4" />
                      Meals
                    </TabsTrigger>
                    <TabsTrigger value="water">
                      <Droplets className="mr-2 h-4 w-4" />
                      Water
                    </TabsTrigger>
                    <TabsTrigger value="sleep">
                      <Moon className="mr-2 h-4 w-4" />
                      Sleep
                    </TabsTrigger>
                    <TabsTrigger value="summary">
                      <Home className="mr-2 h-4 w-4" />
                      Review
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="meals">
              <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
                <div className="grid gap-3">
                  {meals.map((meal) => (
                    <button
                      key={meal.type}
                      type="button"
                      onClick={() => setActiveMeal(meal.type)}
                      className={`glass-surface rounded-lg p-4 text-left transition hover:border-primary ${
                        activeMeal === meal.type ? "border-primary bg-white/85 ring-2 ring-primary/20" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{mealLabels[meal.type]}</p>
                          <p className="text-sm text-muted-foreground">
                            Planned for {meal.plannedTime}
                          </p>
                        </div>
                        <Badge variant={meal.status === "logged" ? "default" : "outline"}>
                          {meal.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Camera className="h-5 w-5" />
                      {mealLabels[activeMeal]} check-in
                    </CardTitle>
                    <CardDescription>
                      Log what you ate, add a photo, or move the reminder if this is not your meal time.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="meal-time">Meal time</Label>
                        <Input
                          id="meal-time"
                          type="time"
                          value={activeMealLog.actualTime}
                          onChange={(event) =>
                            updateMeal(activeMeal, { actualTime: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="planned-time">Reminder time</Label>
                        <Input
                          id="planned-time"
                          type="time"
                          value={activeMealLog.plannedTime}
                          onChange={(event) =>
                            updateMeal(activeMeal, {
                              plannedTime: event.target.value,
                              status: "snoozed",
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="food">What did you have?</Label>
                      <Textarea
                        id="food"
                        placeholder="Example: idli, sambar, coconut chutney, and one banana"
                        value={activeMealLog.description}
                        onChange={(event) =>
                          updateMeal(activeMeal, { description: event.target.value })
                        }
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                      <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 p-4 text-center transition hover:border-primary">
                        <ImagePlus className="h-8 w-8 text-primary" />
                        <span className="text-sm font-medium">Upload or capture meal image</span>
                        <span className="text-xs text-muted-foreground">
                          The saved preview stays visible in this app.
                        </span>
                        <Input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(event) => handleImageUpload(activeMeal, event)}
                        />
                      </label>
                      <div className="glass-surface flex h-44 items-center justify-center overflow-hidden rounded-lg">
                        {activeMealLog.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={activeMealLog.image}
                            alt={`${mealLabels[activeMeal]} preview`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <p className="px-4 text-center text-sm text-muted-foreground">
                            Meal image preview
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Stepper
                        label="Hunger before meal"
                        value={activeMealLog.hunger}
                        min={1}
                        max={5}
                        suffix="/5"
                        onChange={(value) => updateMeal(activeMeal, { hunger: value })}
                      />
                      <Stepper
                        label="Fullness after meal"
                        value={activeMealLog.fullness}
                        min={1}
                        max={5}
                        suffix="/5"
                        onChange={(value) => updateMeal(activeMeal, { fullness: value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        placeholder="Mood, energy, cravings, or anything worth remembering"
                        value={activeMealLog.notes}
                        onChange={(event) =>
                          updateMeal(activeMeal, { notes: event.target.value })
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        onClick={() => {
                          updateMeal(activeMeal, { status: "logged" });
                          showToast(`${mealLabels[activeMeal]} has saved`);
                        }}
                      >
                        <Save />
                        Save meal
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => rescheduleMeal(activeMeal, 30)}
                      >
                        <Clock />
                        Not now, +30 min
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          updateMeal(activeMeal, { status: "skipped" });
                          showToast(`${mealLabels[activeMeal]} skipped`);
                        }}
                      >
                        Skip today
                      </Button>
                      {activeMeal === "lunch" && (
                        <Button asChild variant="outline">
                          <Link href="/meal/lunch">
                            <Camera />
                            Open lunch camera
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="water">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Droplets className="h-5 w-5 text-cyan-700" />
                    Water intake
                  </CardTitle>
                  <CardDescription>
                    Use quick buttons or the increase/decrease controls to keep the total accurate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="glass-surface rounded-lg p-5">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Today</p>
                        <p className="text-3xl font-semibold">{formatWater(water)}</p>
                      </div>
                      <Badge variant={water >= profile.waterGoal ? "default" : "secondary"}>
                        Goal {formatWater(profile.waterGoal)}
                      </Badge>
                    </div>
                    <Progress value={waterPercent} />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {waterPercent}% of your daily target
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Stepper
                      label="Current water"
                      value={water}
                      min={0}
                      max={6000}
                      step={100}
                      suffix=" ml"
                      onChange={setWater}
                    />
                    <Stepper
                      label="Daily water goal"
                      value={profile.waterGoal}
                      min={500}
                      max={6000}
                      step={100}
                      suffix=" ml"
                      onChange={(value) => updateProfile("waterGoal", value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[100, 250, 500, 750].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        onClick={() => setWater((current) => clamp(current + amount, 0, 6000))}
                      >
                        <Plus />
                        {amount} ml
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sleep">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Moon className="h-5 w-5 text-indigo-700" />
                    Sleep check-in
                  </CardTitle>
                  <CardDescription>
                    Enter the times or tune the duration with the plus and minus buttons.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="slept-at">What time did you sleep?</Label>
                      <Input
                        id="slept-at"
                        type="time"
                        value={sleep.sleptAt}
                        onChange={(event) =>
                          updateSleep({ sleptAt: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="woke-at">What time did you wake up?</Label>
                      <Input
                        id="woke-at"
                        type="time"
                        value={sleep.wokeAt}
                        onChange={(event) =>
                          updateSleep({ wokeAt: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Stepper
                      label="Sleep hours"
                      value={sleep.hours}
                      min={0}
                      max={14}
                      suffix=" hr"
                      onChange={(value) => updateSleep({ hours: value })}
                    />
                    <Stepper
                      label="Sleep minutes"
                      value={sleep.minutes}
                      min={0}
                      max={59}
                      step={5}
                      suffix=" min"
                      onChange={(value) => updateSleep({ minutes: value })}
                    />
                  </div>

                  <div className="glass-surface rounded-lg p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Sleep duration</p>
                      <p className="text-2xl font-semibold">
                        {sleep.hours}h {sleep.minutes}m
                      </p>
                    </div>
                    <Progress value={sleepPercent} />
                    <p className="mt-2 text-sm text-muted-foreground">
                      8 hours is used as the reference goal.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Sleep quality</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Great", "Okay", "Poor"] as SleepLog["quality"][]).map((quality) => (
                        <Button
                          key={quality}
                          variant={sleep.quality === quality ? "default" : "outline"}
                          onClick={() => updateSleep({ quality })}
                        >
                          {sleep.quality === quality && <Check />}
                          {quality}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="summary">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5 text-rose-700" />
                    End-of-day review
                  </CardTitle>
                  <CardDescription>
                    A simple close for today and one clear focus for tomorrow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryTile label="Meals" value={`${loggedMeals}/3 logged`} />
                    <SummaryTile label="Water" value={`${waterPercent}% complete`} />
                    <SummaryTile
                      label="Sleep"
                      value={`${sleep.hours}h ${sleep.minutes}m, ${sleep.quality}`}
                    />
                  </div>

                  <div className="glass-surface rounded-lg p-5">
                    <p className="text-sm text-muted-foreground">Today&apos;s note</p>
                    <p className="mt-2 text-lg font-medium leading-8">
                      You logged {loggedMeals} meals, reached {waterPercent}% of your water goal,
                      and slept {sleep.hours}h {sleep.minutes}m. Tomorrow, keep one glass of water
                      near your first meal and make the next choice easier.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {meals.map((meal) => (
                      <div key={meal.type} className="glass-surface rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{mealLabels[meal.type]}</p>
                          <Badge variant={meal.status === "logged" ? "default" : "outline"}>
                            {meal.status}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {meal.description || "No meal description yet."}
                        </p>
                      </div>
                    ))}
                  </div>

                  <Button variant="outline">
                    <Share2 />
                    Share progress with family
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
                </Tabs>
              </CardContent>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Profile and schedule</CardTitle>
                  <CardDescription>
                    Set your personal meal times and daily targets.
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-expanded={expandedSections.profileSchedule}
                  title={expandedSections.profileSchedule ? "Collapse" : "Expand"}
                  onClick={() => toggleSection("profileSchedule")}
                >
                  <ChevronDown
                    className={`transition-transform ${
                      expandedSections.profileSchedule ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </div>
            </CardHeader>
            {expandedSections.profileSchedule && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(event) => updateProfile("name", event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TimeField
                    id="wake"
                    label="Wake"
                    value={profile.wakeTime}
                    onChange={(value) => updateProfile("wakeTime", value)}
                  />
                  <TimeField
                    id="sleep-reminder"
                    label="Sleep"
                    value={profile.sleepReminder}
                    onChange={(value) => updateProfile("sleepReminder", value)}
                  />
                  <TimeField
                    id="breakfast"
                    label="Breakfast"
                    value={profile.breakfastTime}
                    onChange={(value) => {
                      updateProfile("breakfastTime", value);
                      updateMeal("breakfast", { plannedTime: value });
                    }}
                  />
                  <TimeField
                    id="lunch"
                    label="Lunch"
                    value={profile.lunchTime}
                    onChange={(value) => {
                      updateProfile("lunchTime", value);
                      updateMeal("lunch", { plannedTime: value });
                    }}
                  />
                  <TimeField
                    id="dinner"
                    label="Dinner"
                    value={profile.dinnerTime}
                    onChange={(value) => {
                      updateProfile("dinnerTime", value);
                      updateMeal("dinner", { plannedTime: value });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dashboard-timezone">Timezone</Label>
                  <Input
                    id="dashboard-timezone"
                    value={profile.timezone}
                    onChange={(event) => updateProfile("timezone", event.target.value)}
                  />
                </div>
                <Separator />
                <p className="text-sm text-muted-foreground">
                  Browser notifications depend on permission and the app being available in the
                  browser. In-app reminders stay visible on the dashboard.
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Today&apos;s timeline</CardTitle>
                  <CardDescription>Friendly reminders for your routine.</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-expanded={expandedSections.todayTimeline}
                  title={expandedSections.todayTimeline ? "Collapse" : "Expand"}
                  onClick={() => toggleSection("todayTimeline")}
                >
                  <ChevronDown
                    className={`transition-transform ${
                      expandedSections.todayTimeline ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </div>
            </CardHeader>
            {expandedSections.todayTimeline && (
              <CardContent className="space-y-3">
                <TimelineItem icon={<Sun />} title="Morning quote" time={profile.wakeTime} />
                {meals.map((meal) => (
                  <TimelineItem
                    key={meal.type}
                    icon={<Utensils />}
                    title={mealLabels[meal.type]}
                    time={meal.plannedTime}
                    href={meal.type === "lunch" ? "/meal/lunch" : undefined}
                  />
                ))}
                <TimelineItem icon={<Moon />} title="Sleep check-in" time={profile.sleepReminder} />
              </CardContent>
            )}
          </Card>
        </aside>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  dark = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div
      className={
        dark
          ? "glass-dark rounded-lg p-4"
          : "glass-surface rounded-lg p-4"
      }
    >
      <div className={`flex items-center gap-2 text-sm ${dark ? "text-white/70" : "text-muted-foreground"}`}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="glass-surface rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <p className="text-xl font-semibold">
          {value}
          {suffix}
        </p>
      </div>
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - step, min, max))}
        >
          <Minus />
        </Button>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer accent-primary"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={`Increase ${label}`}
          onClick={() => onChange(clamp(value + step, min, max))}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TimelineItem({
  icon,
  title,
  time,
  href,
}: {
  icon: React.ReactElement;
  title: string;
  time: string;
  href?: string;
}) {
  const content = (
    <div className="glass-surface flex items-center gap-3 rounded-lg p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition hover:border-primary hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-surface rounded-lg p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
