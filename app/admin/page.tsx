"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Droplets,
  Moon,
  Shield,
  Sparkles,
  Utensils,
  Users,
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  snoozeLabel?: string;
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
  clientId?: string;
  date: string;
  profile: Profile;
  meals: MealLog[];
  water: number;
  sleep: SleepLog;
  quoteIndex: number;
  quoteFeedback: QuoteFeedback;
  updatedAt?: string;
};

type AdminUser = {
  id: string;
  name: string;
  days: DaySummary[];
};

const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

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

function dayStats(day: DaySummary) {
  const mealsLogged = day.meals.filter((meal) => meal.status === "logged").length;
  const mealImages = day.meals.filter((meal) => meal.image).length;
  const waterPercent = clamp(Math.round((day.water / day.profile.waterGoal) * 100), 0, 100);
  const sleepMinutes = day.sleep.hours * 60 + day.sleep.minutes;
  const sleepPercent = clamp(Math.round((sleepMinutes / 480) * 100), 0, 100);
  const wellnessScore = Math.round(
    (mealsLogged / 3) * 40 + (waterPercent / 100) * 35 + (sleepPercent / 100) * 25,
  );

  return { mealsLogged, mealImages, waterPercent, sleepMinutes, wellnessScore };
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadUsers() {
      const user = await requireSignedInUser();
      if (!user) return;

      const remoteDays = await loadAdminSnapshots();
      const remoteUsers = remoteDays.reduce<Record<string, DaySummary[]>>((acc, day) => {
        const id = day.clientId ?? "supabase-user";
        acc[id] = [...(acc[id] ?? []), day];
        return acc;
      }, {});

      const adminUsers = Object.entries(remoteUsers).map(([id, days]) => ({
        id,
        name: days[0]?.profile?.name || "Supabase user",
        days: days
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date)),
      }));

      setUsers(adminUsers);
      setExpandedUsers(
        adminUsers.reduce<Record<string, boolean>>((acc, user, index) => {
          acc[user.id] = index === 0;
          return acc;
        }, {}),
      );
      setExpandedDays(
        adminUsers.reduce<Record<string, boolean>>((acc, user) => {
          user.days.forEach((day, index) => {
            acc[`${user.id}-${day.date}`] = index === 0;
          });
          return acc;
        }, {}),
      );
      setExpandedMeals(
        adminUsers.reduce<Record<string, boolean>>((acc, user) => {
          user.days.forEach((day, index) => {
            acc[`${user.id}-${day.date}-meals`] = index === 0;
          });
          return acc;
        }, {}),
      );
    }

    void loadUsers();
  }, []);

  const monitorStats = useMemo(() => {
    const allDays = users.flatMap((user) => user.days);
    const allMeals = allDays.flatMap((day) => day.meals);
    const mealImages = allMeals.filter((meal) => meal.image).length;
    const averageScore =
      allDays.length === 0
        ? 0
        : Math.round(
            allDays.reduce((sum, day) => sum + dayStats(day).wellnessScore, 0) / allDays.length,
          );

    return {
      users: users.length,
      days: allDays.length,
      mealImages,
      averageScore,
    };
  }, [users]);

  function toggleUser(id: string) {
    setExpandedUsers((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleDay(id: string) {
    setExpandedDays((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleMeals(id: string) {
    setExpandedMeals((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <AppNav title="Admin dashboard" />
      <section className="glass-shell mx-auto max-w-7xl rounded-lg">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <BrandLogo compact />
              <div>
                <p className="text-sm text-muted-foreground">Health monitoring</p>
                <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                  Admin dashboard
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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={<Users className="h-4 w-4" />} label="Users" value={`${monitorStats.users}`} dark />
            <Metric icon={<Sparkles className="h-4 w-4" />} label="Tracked days" value={`${monitorStats.days}`} />
            <Metric icon={<Camera className="h-4 w-4" />} label="Meal images" value={`${monitorStats.mealImages}`} />
            <Metric icon={<Shield className="h-4 w-4" />} label="Avg score" value={`${monitorStats.averageScore}/100`} dark />
          </div>
        </div>
      </section>

      <div className="glass-shell mx-auto mt-5 w-full max-w-7xl space-y-4 rounded-lg p-3 sm:p-5">
        {users.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No users to monitor yet</CardTitle>
              <CardDescription>
                Complete onboarding and log meals first. Admin monitoring reads stored app data.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{user.name}</CardTitle>
                    <CardDescription>
                      {user.days.length} tracked day{user.days.length === 1 ? "" : "s"}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-expanded={expandedUsers[user.id]}
                    title={expandedUsers[user.id] ? "Collapse user" : "Expand user"}
                    onClick={() => toggleUser(user.id)}
                  >
                    <ChevronDown
                      className={`transition-transform ${
                        expandedUsers[user.id] ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </div>
              </CardHeader>

              {expandedUsers[user.id] && (
                <CardContent className="space-y-4">
                  {user.days.map((day) => {
                    const stats = dayStats(day);
                    const dayId = `${user.id}-${day.date}`;
                    const mealSectionId = `${dayId}-meals`;

                    return (
                      <div key={dayId} className="rounded-lg border border-white/55 bg-white/35 backdrop-blur-xl">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 p-4 text-left"
                          aria-expanded={expandedDays[dayId]}
                          onClick={() => toggleDay(dayId)}
                        >
                          <div>
                            <p className="font-semibold">{formatDate(day.date)}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {stats.mealsLogged}/3 meals, {formatWater(day.water)} water, {day.sleep.hours}h {day.sleep.minutes}m sleep
                            </p>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              expandedDays[dayId] ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {expandedDays[dayId] && (
                          <div className="space-y-4 border-t p-4">
                            <div className="grid gap-3 sm:grid-cols-4">
                              <Metric label="Meals" value={`${stats.mealsLogged}/3`} />
                              <Metric label="Images" value={`${stats.mealImages}/3`} />
                              <Metric label="Water" value={`${stats.waterPercent}%`} />
                              <Metric label="Score" value={`${stats.wellnessScore}/100`} />
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                              <div className="rounded-lg border border-white/55 bg-white/35 backdrop-blur-xl">
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                                  aria-expanded={expandedMeals[mealSectionId]}
                                  onClick={() => toggleMeals(mealSectionId)}
                                >
                                  <span className="flex items-center gap-2 font-medium">
                                    <Utensils className="h-4 w-4" />
                                    Meal images and logs
                                  </span>
                                  <ChevronDown
                                    className={`h-4 w-4 transition-transform ${
                                      expandedMeals[mealSectionId] ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                {expandedMeals[mealSectionId] && (
                                  <div className="grid gap-3 border-t p-4 md:grid-cols-3">
                                    {day.meals.map((meal) => (
                                      <div key={meal.type} className="glass-surface rounded-lg p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <p className="font-medium">{mealLabels[meal.type]}</p>
                                          <Badge variant={meal.status === "logged" ? "default" : "outline"}>
                                            {meal.status}
                                          </Badge>
                                        </div>
                                        {meal.image ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={meal.image}
                                            alt={`${mealLabels[meal.type]} meal`}
                                            className="aspect-[4/3] w-full rounded-md object-cover"
                                          />
                                        ) : (
                                          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-zinc-400/60 bg-white/40 text-center text-sm text-muted-foreground">
                                            No image captured
                                          </div>
                                        )}
                                        <p className="mt-2 text-sm text-muted-foreground">
                                          {meal.description || "No description entered."}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3">
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                      <Droplets className="h-4 w-4" />
                                      Water
                                    </CardTitle>
                                    <CardDescription>
                                      {formatWater(day.water)} / {formatWater(day.profile.waterGoal)}
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <Progress value={stats.waterPercent} />
                                  </CardContent>
                                </Card>

                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                      <Moon className="h-4 w-4" />
                                      Sleep
                                    </CardTitle>
                                    <CardDescription>
                                      {day.sleep.hours}h {day.sleep.minutes}m, {day.sleep.quality}
                                    </CardDescription>
                                  </CardHeader>
                                </Card>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </main>
  );
}

async function loadAdminSnapshots() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const response = await fetch("/api/admin/snapshots", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { snapshots?: DaySummary[] };

  return data.snapshots ?? [];
}

function Metric({
  icon,
  label,
  value,
  dark = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? "glass-dark rounded-lg p-4" : "glass-surface rounded-lg p-4"}>
      <div className={`flex items-center gap-2 text-sm ${dark ? "text-white/70" : "text-muted-foreground"}`}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
