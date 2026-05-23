"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Moon,
  Save,
  Sun,
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
import { Separator } from "@/components/ui/separator";

type MealType = "breakfast" | "lunch" | "dinner";

type Profile = {
  name: string;
  wakeTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  sleepReminder: string;
  waterGoal: number;
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

type StoredAppState = {
  onboardingCompleted?: boolean;
  profile: Profile;
  meals: MealLog[];
  water: number;
  sleep: unknown;
  sleepCheckCompleted?: boolean;
  quoteIndex: number;
  quoteFeedback: unknown;
};

const storageKey = "daily-health-companion";

const defaultProfile: Profile = {
  name: "Sweetheart",
  wakeTime: "07:00",
  breakfastTime: "08:30",
  lunchTime: "13:00",
  dinnerTime: "20:00",
  sleepReminder: "22:30",
  waterGoal: 2500,
};

const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function createMeals(profile: Profile): MealLog[] {
  return [
    meal("breakfast", profile.breakfastTime),
    meal("lunch", profile.lunchTime),
    meal("dinner", profile.dinnerTime),
  ];
}

function meal(type: MealType, time: string): MealLog {
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [meals, setMeals] = useState<MealLog[]>(() => createMeals(defaultProfile));
  const [storedState, setStoredState] = useState<Partial<StoredAppState>>({});
  const [saved, setSaved] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    profileSchedule: true,
    todayTimeline: true,
  });

  useEffect(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return;

    try {
      const parsed = JSON.parse(savedState) as StoredAppState;
      setStoredState(parsed);
      setProfile(parsed.profile ?? defaultProfile);
      setMeals(parsed.meals ?? createMeals(parsed.profile ?? defaultProfile));
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, []);

  function toggleSection(section: keyof typeof expandedSections) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function updateMeal(type: MealType, plannedTime: string) {
    setMeals((current) =>
      current.map((item) =>
        item.type === type ? { ...item, plannedTime, actualTime: plannedTime } : item,
      ),
    );
    setSaved(false);
  }

  function saveProfile() {
    const nextState: StoredAppState = {
      profile,
      onboardingCompleted: true,
      meals,
      water: storedState.water ?? 0,
      sleep: storedState.sleep ?? {
        sleptAt: "23:15",
        wokeAt: "06:45",
        hours: 7,
        minutes: 30,
        quality: "Okay",
      },
      sleepCheckCompleted: storedState.sleepCheckCompleted ?? false,
      quoteIndex: storedState.quoteIndex ?? 0,
      quoteFeedback: storedState.quoteFeedback ?? null,
    };

    localStorage.setItem(storageKey, JSON.stringify(nextState));
    setStoredState(nextState);
    setSaved(true);
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <section className="glass-shell mx-auto max-w-5xl rounded-lg">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white shadow-soft">
                <User className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Daily Health Companion</p>
                <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                  Profile
                </h1>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="default" onClick={saveProfile}>
                <Save />
                Save
              </Button>
              <Button asChild variant="outline">
                <Link href="/">
                  <ArrowLeft />
                  Dashboard
                </Link>
              </Button>
            </div>
          </div>
          {saved && (
            <div className="rounded-lg border border-zinc-950/20 bg-white/70 p-3 text-sm font-medium text-zinc-950 backdrop-blur">
              Profile saved.
            </div>
          )}
        </div>
      </section>

      <div className="glass-shell mx-auto mt-5 w-full max-w-5xl space-y-5 rounded-lg p-3 sm:p-5">
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Name</Label>
                  <Input
                    id="profile-name"
                    value={profile.name}
                    onChange={(event) => updateProfile("name", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="water-goal">Daily water goal</Label>
                  <Input
                    id="water-goal"
                    type="number"
                    min={500}
                    step={100}
                    value={profile.waterGoal}
                    onChange={(event) =>
                      updateProfile("waterGoal", Number(event.target.value))
                    }
                  />
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <TimeField
                  id="wake"
                  label="Wake"
                  value={profile.wakeTime}
                  onChange={(value) => updateProfile("wakeTime", value)}
                />
                <TimeField
                  id="breakfast"
                  label="Breakfast"
                  value={profile.breakfastTime}
                  onChange={(value) => {
                    updateProfile("breakfastTime", value);
                    updateMeal("breakfast", value);
                  }}
                />
                <TimeField
                  id="lunch"
                  label="Lunch"
                  value={profile.lunchTime}
                  onChange={(value) => {
                    updateProfile("lunchTime", value);
                    updateMeal("lunch", value);
                  }}
                />
                <TimeField
                  id="dinner"
                  label="Dinner"
                  value={profile.dinnerTime}
                  onChange={(value) => {
                    updateProfile("dinnerTime", value);
                    updateMeal("dinner", value);
                  }}
                />
                <TimeField
                  id="sleep"
                  label="Sleep"
                  value={profile.sleepReminder}
                  onChange={(value) => updateProfile("sleepReminder", value)}
                />
              </div>
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
            <CardContent className="grid gap-3 md:grid-cols-2">
              <TimelineItem icon={<Sun />} title="Morning quote" time={profile.wakeTime} />
              {meals.map((item) => (
                <TimelineItem
                  key={item.type}
                  icon={<Utensils />}
                  title={mealLabels[item.type]}
                  time={item.plannedTime}
                  status={item.status}
                />
              ))}
              <TimelineItem icon={<Moon />} title="Sleep check-in" time={profile.sleepReminder} />
            </CardContent>
          )}
        </Card>
      </div>
    </main>
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
  status,
}: {
  icon: React.ReactElement;
  title: string;
  time: string;
  status?: string;
}) {
  return (
    <div className="glass-surface flex items-center gap-3 rounded-lg p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
      {status && <Badge variant="outline">{status}</Badge>}
    </div>
  );
}
