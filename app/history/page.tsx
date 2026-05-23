"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Droplets,
  Moon,
  Sparkles,
  Utensils,
} from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BrandLogo } from "@/components/brand-logo";
import { requireSignedInUser } from "@/lib/auth";
import { loadSyncedHistory, saveHealthHistory, storageKey } from "@/lib/health-sync";

type MealType = "breakfast" | "lunch" | "dinner";
type QuoteFeedback = "liked" | "disliked" | null;

type Profile = {
  name: string;
  waterGoal: number;
};

type MealLog = {
  type: MealType;
  plannedTime: string;
  actualTime: string;
  description: string;
  image: string;
  status: "pending" | "logged" | "snoozed" | "skipped";
};

type SleepLog = {
  sleptAt: string;
  wokeAt: string;
  hours: number;
  minutes: number;
  quality: "Great" | "Okay" | "Poor";
};

type DaySummary = {
  date: string;
  profile: Profile;
  meals: MealLog[];
  water: number;
  sleep: SleepLog;
  quoteIndex: number;
  quoteFeedback: QuoteFeedback;
  updatedAt?: string;
};

const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const quoteTexts = [
  "Confidence grows when you keep promises to yourself, even the small ones.",
  "Begin gently. Courage does not need noise to be real.",
  "Your body listens to the way you care for it today.",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatWater(amount: number) {
  if (amount >= 1000) return `${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)} L`;
  return `${amount} ml`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default function HistoryPage() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadHistory() {
    const user = await requireSignedInUser();
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);
    const savedCurrent = localStorage.getItem(storageKey);
    let history = await loadSyncedHistory<DaySummary>();

    if (savedCurrent) {
      try {
        const current = JSON.parse(savedCurrent) as Omit<DaySummary, "date">;
        const todaySummary: DaySummary = {
          ...current,
          date: today,
          updatedAt: new Date().toISOString(),
        };
        history = [
          todaySummary,
          ...history.filter((day) => day.date !== today),
        ].slice(0, 30);
        await saveHealthHistory(todaySummary);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    setDays(history);
    setExpandedDays(
      history.reduce<Record<string, boolean>>((acc, day, index) => {
        acc[day.date] = index === 0;
        return acc;
      }, {}),
    );
    }

    void loadHistory();
  }, []);

  const totals = useMemo(() => {
    const latest = days[0];
    if (!latest) return null;
    const mealsLogged = latest.meals.filter((meal) => meal.status === "logged").length;
    const waterPercent = clamp(
      Math.round((latest.water / latest.profile.waterGoal) * 100),
      0,
      100,
    );
    const sleepMinutes = latest.sleep.hours * 60 + latest.sleep.minutes;
    const sleepPercent = clamp(Math.round((sleepMinutes / 480) * 100), 0, 100);
    const wellnessScore = Math.round(
      (mealsLogged / 3) * 40 + (waterPercent / 100) * 35 + (sleepPercent / 100) * 25,
    );
    return { mealsLogged, waterPercent, wellnessScore };
  }, [days]);

  function toggleDay(date: string) {
    setExpandedDays((current) => ({ ...current, [date]: !current[date] }));
  }

  function toggleSection(id: string) {
    setExpandedSections((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <AppNav title="Daily history" />
      <section className="glass-shell mx-auto max-w-6xl rounded-lg">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <BrandLogo compact />
              <div>
                <p className="text-sm text-muted-foreground">Stored health details</p>
                <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                  Daily history
                </h1>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft />
                Dashboard
              </Link>
            </Button>
          </div>

          {totals && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Latest meals" value={`${totals.mealsLogged}/3`} />
              <Metric label="Latest water" value={`${totals.waterPercent}%`} />
              <Metric label="Latest score" value={`${totals.wellnessScore}/100`} />
            </div>
          )}
        </div>
      </section>

      <div className="glass-shell mx-auto mt-5 w-full max-w-6xl space-y-4 rounded-lg p-3 sm:p-5">
        {days.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No stored details yet</CardTitle>
              <CardDescription>
                Log meals, water, sleep, or quote feedback from the dashboard first.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          days.map((day) => {
            const mealsLogged = day.meals.filter((meal) => meal.status === "logged").length;
            const waterPercent = clamp(
              Math.round((day.water / day.profile.waterGoal) * 100),
              0,
              100,
            );
            const sleepText = `${day.sleep.hours}h ${day.sleep.minutes}m`;

            return (
              <Card key={day.date}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{formatDate(day.date)}</CardTitle>
                      <CardDescription>
                        {mealsLogged}/3 meals, {formatWater(day.water)} water, {sleepText} sleep
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-expanded={expandedDays[day.date]}
                      title={expandedDays[day.date] ? "Collapse" : "Expand"}
                      onClick={() => toggleDay(day.date)}
                    >
                      <ChevronDown
                        className={`transition-transform ${
                          expandedDays[day.date] ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </div>
                </CardHeader>

                {expandedDays[day.date] && (
                  <CardContent className="space-y-3">
                    <Section
                      id={`${day.date}-total`}
                      icon={<Sparkles className="h-4 w-4" />}
                      title="Total summary"
                      expanded={expandedSections[`${day.date}-total`] ?? true}
                      onToggle={toggleSection}
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Metric label="Meals logged" value={`${mealsLogged}/3`} />
                        <Metric label="Water progress" value={`${waterPercent}%`} />
                        <Metric label="Sleep" value={sleepText} />
                      </div>
                    </Section>

                    <Section
                      id={`${day.date}-meals`}
                      icon={<Utensils className="h-4 w-4" />}
                      title="Meals"
                      expanded={expandedSections[`${day.date}-meals`] ?? false}
                      onToggle={toggleSection}
                    >
                      <div className="grid gap-3 md:grid-cols-3">
                        {day.meals.map((meal) => (
                          <div key={meal.type} className="glass-surface rounded-lg p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium">{mealLabels[meal.type]}</p>
                              <Badge variant={meal.status === "logged" ? "default" : "outline"}>
                                {meal.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {meal.description || "No meal description."}
                            </p>
                            {meal.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={meal.image}
                                alt={`${mealLabels[meal.type]} meal`}
                                className="mt-3 aspect-[4/3] w-full rounded-md object-cover"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </Section>

                    <Section
                      id={`${day.date}-water`}
                      icon={<Droplets className="h-4 w-4" />}
                      title="Water"
                      expanded={expandedSections[`${day.date}-water`] ?? false}
                      onToggle={toggleSection}
                    >
                      <div className="glass-surface rounded-lg p-4">
                        <div className="mb-3 flex items-center justify-between gap-4">
                          <p className="font-medium">{formatWater(day.water)}</p>
                          <Badge variant="secondary">Goal {formatWater(day.profile.waterGoal)}</Badge>
                        </div>
                        <Progress value={waterPercent} />
                      </div>
                    </Section>

                    <Section
                      id={`${day.date}-sleep`}
                      icon={<Moon className="h-4 w-4" />}
                      title="Sleep"
                      expanded={expandedSections[`${day.date}-sleep`] ?? false}
                      onToggle={toggleSection}
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Metric label="Slept at" value={day.sleep.sleptAt} />
                        <Metric label="Woke at" value={day.sleep.wokeAt} />
                        <Metric label="Quality" value={day.sleep.quality} />
                      </div>
                    </Section>

                    <Section
                      id={`${day.date}-quote`}
                      icon={<Sparkles className="h-4 w-4" />}
                      title="Morning quote"
                      expanded={expandedSections[`${day.date}-quote`] ?? false}
                      onToggle={toggleSection}
                    >
                      <div className="glass-surface rounded-lg p-4">
                        <p className="font-medium leading-7">
                          {quoteTexts[day.quoteIndex] ?? quoteTexts[0]}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Feedback: {day.quoteFeedback ?? "not reviewed"}
                        </p>
                      </div>
                    </Section>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-surface rounded-lg p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/55 bg-white/35 backdrop-blur-xl">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={expanded}
        onClick={() => onToggle(id)}
      >
        <span className="flex items-center gap-2 font-medium">
          {icon}
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <div className="space-y-3 border-t p-4">{children}</div>}
    </div>
  );
}
