"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Moon,
  Sparkles,
  Sun,
  Utensils,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";

type MealType = "breakfast" | "lunch" | "dinner";

type Profile = {
  name: string;
  wakeTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  sleepReminder: string;
  waterGoal: number;
  primaryGoal: string;
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

const storageKey = "daily-health-companion";

const defaultProfile: Profile = {
  name: "",
  wakeTime: "07:00",
  breakfastTime: "08:30",
  lunchTime: "13:00",
  dinnerTime: "20:00",
  sleepReminder: "22:30",
  waterGoal: 2500,
  primaryGoal: "More energy",
};

const goals = ["More energy", "Better sleep", "Balanced meals", "More discipline"];
const steps = ["You", "Routine", "Goals", "Reminders"];

function createMeals(profile: Profile): MealLog[] {
  return [
    createMeal("breakfast", profile.breakfastTime),
    createMeal("lunch", profile.lunchTime),
    createMeal("dinner", profile.dinnerTime),
  ];
}

function createMeal(type: MealType, time: string): MealLog {
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

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [notificationChoice, setNotificationChoice] = useState<"later" | "enabled">("later");

  const progress = Math.round(((step + 1) / 4) * 100);
  const currentStepComplete =
    (step === 0 && profile.name.trim().length > 0 && profile.primaryGoal.length > 0) ||
    (step === 1 &&
      Boolean(profile.breakfastTime) &&
      Boolean(profile.lunchTime) &&
      Boolean(profile.dinnerTime)) ||
    (step === 2 &&
      Boolean(profile.wakeTime) &&
      Boolean(profile.sleepReminder) &&
      profile.waterGoal >= 500) ||
    (step === 3 && Boolean(notificationChoice));

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotificationChoice("later");
      return;
    }

    const result = await Notification.requestPermission();
    setNotificationChoice(result === "granted" ? "enabled" : "later");
  }

  function finishOnboarding() {
    const completedProfile = {
      ...profile,
      name: profile.name.trim() || "Sweetheart",
    };

    const appState = {
      onboardingCompleted: true,
      profile: completedProfile,
      meals: createMeals(completedProfile),
      water: 0,
      sleep: {
        sleptAt: "23:15",
        wokeAt: completedProfile.wakeTime,
        hours: 7,
        minutes: 30,
        quality: "Okay",
      },
      sleepCheckCompleted: false,
      quoteIndex: 0,
      quoteFeedback: null,
      notificationPreference: notificationChoice,
    };

    localStorage.setItem(storageKey, JSON.stringify(appState));
    localStorage.setItem(
      "daily-health-history",
      JSON.stringify([
        {
          date: new Date().toISOString().slice(0, 10),
          ...appState,
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6">
      <div className="glass-shell mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-6xl flex-col gap-5 rounded-lg p-4 sm:p-6">
        <section className="glass-dark rounded-lg p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-black">
                <Sparkles className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal sm:text-3xl">
                Let&apos;s set up your companion.
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/70">
                A few details help the app ask the right questions at the right time.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 lg:min-w-[520px]">
              {steps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  disabled={index > step}
                  onClick={() => {
                    if (index <= step) setStep(index);
                  }}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition ${
                    index === step
                      ? "border-white bg-white text-black"
                      : "border-white/15 bg-white/5 text-white/70"
                  } ${index > step ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border text-xs">
                    {index < step ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className="text-xs font-medium sm:text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-between gap-6">
          <div className="glass-surface rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Onboarding</p>
              <p className="text-sm text-muted-foreground">{progress}%</p>
            </div>
            <Progress value={progress} />
          </div>

          <Card className="min-h-[520px]">
            {step === 0 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Sun className="h-6 w-6 text-amber-600" />
                    What should we call you?
                  </CardTitle>
                  <CardDescription>
                    This name appears in morning messages and check-ins.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name or nickname</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      placeholder="Example: Anil"
                      onChange={(event) => updateProfile("name", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Primary goal</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {goals.map((goal) => (
                        <Button
                          key={goal}
                          variant={profile.primaryGoal === goal ? "default" : "outline"}
                          onClick={() => updateProfile("primaryGoal", goal)}
                        >
                          {goal}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </>
            )}

            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Utensils className="h-6 w-6 text-primary" />
                    When do you usually eat?
                  </CardTitle>
                  <CardDescription>
                    These times drive breakfast, lunch, and dinner notifications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <TimeField
                    id="breakfast"
                    label="Breakfast"
                    value={profile.breakfastTime}
                    onChange={(value) => updateProfile("breakfastTime", value)}
                  />
                  <TimeField
                    id="lunch"
                    label="Lunch"
                    value={profile.lunchTime}
                    onChange={(value) => updateProfile("lunchTime", value)}
                  />
                  <TimeField
                    id="dinner"
                    label="Dinner"
                    value={profile.dinnerTime}
                    onChange={(value) => updateProfile("dinnerTime", value)}
                  />
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Moon className="h-6 w-6 text-indigo-700" />
                    Sleep and water basics
                  </CardTitle>
                  <CardDescription>
                    We use this for morning check-ins and daily hydration progress.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <TimeField
                    id="wake"
                    label="Wake time"
                    value={profile.wakeTime}
                    onChange={(value) => updateProfile("wakeTime", value)}
                  />
                  <TimeField
                    id="sleep"
                    label="Sleep reminder"
                    value={profile.sleepReminder}
                    onChange={(value) => updateProfile("sleepReminder", value)}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="water">Daily water goal</Label>
                    <div className="grid grid-cols-[44px_1fr_44px] gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          updateProfile("waterGoal", Math.max(500, profile.waterGoal - 100))
                        }
                      >
                        <Droplets className="h-4 w-4" />
                      </Button>
                      <Input
                        id="water"
                        type="number"
                        min={500}
                        step={100}
                        value={profile.waterGoal}
                        onChange={(event) =>
                          updateProfile("waterGoal", Number(event.target.value))
                        }
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          updateProfile("waterGoal", Math.min(6000, profile.waterGoal + 100))
                        }
                      >
                        <Droplets className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Bell className="h-6 w-6 text-primary" />
                    Reminders
                  </CardTitle>
                  <CardDescription>
                    Enable browser notifications now or keep using in-app reminders.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={requestNotifications}
                    className={`rounded-lg border p-5 text-left backdrop-blur-xl transition ${
                      notificationChoice === "enabled"
                        ? "border-primary bg-primary/10"
                        : "bg-white/55 hover:border-primary"
                    }`}
                  >
                    <Bell className="mb-4 h-6 w-6" />
                    <p className="font-semibold">Enable notifications</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Best for meal, water, quote, and sleep reminders.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotificationChoice("later")}
                    className={`rounded-lg border p-5 text-left backdrop-blur-xl transition ${
                      notificationChoice === "later"
                        ? "border-primary bg-primary/10"
                        : "bg-white/55 hover:border-primary"
                    }`}
                  >
                    <Sparkles className="mb-4 h-6 w-6" />
                    <p className="font-semibold">Maybe later</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The dashboard will still show your next reminder.
                    </p>
                  </button>
                </CardContent>
              </>
            )}

            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {currentStepComplete ? "Looks good. You can continue." : "Fill the current details to continue."}
              </p>
              <div className="flex w-full justify-between gap-3 sm:w-auto">
              <Button
                variant="outline"
                disabled={step === 0}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft />
                Back
              </Button>
              {step < 3 ? (
                <Button
                  disabled={!currentStepComplete}
                  onClick={() => setStep((current) => Math.min(3, current + 1))}
                >
                  Next
                  <ChevronRight />
                </Button>
              ) : (
                <Button onClick={finishOnboarding}>
                  Finish setup
                  <Check />
                </Button>
              )}
              </div>
            </CardFooter>
          </Card>
        </section>
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
