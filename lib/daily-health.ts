import type { ReminderPreferences } from "@/lib/reminder-preferences";
import type { HealthState } from "@/lib/health-sync";

export type MealType = "breakfast" | "lunch" | "dinner";
export type Meal = { type: MealType; plannedTime: string; actualTime: string; description: string; image: string; hunger: number; fullness: number; notes: string; status: "pending" | "logged" | "snoozed" | "skipped" };
export type Routine = { name: string; wakeTime: string; breakfastTime: string; lunchTime: string; dinnerTime: string; sleepReminder: string; waterGoal: number; timezone: string; primaryGoal?: string; reminderPreferences?: ReminderPreferences };
export type Sleep = { sleptAt: string; wokeAt: string; hours: number; minutes: number; quality: "Great" | "Okay" | "Poor" };
export type DailyHealth = Omit<HealthState, "profile" | "meals" | "sleep" | "quoteFeedback"> & { profile: Routine; meals: Meal[]; water: number; sleep: Sleep; sleepCheckCompleted?: boolean; quoteFeedback?: "liked" | "disliked" | null };
export const mealTypes: MealType[] = ["breakfast", "lunch", "dinner"];
export const mealLabels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

export function normaliseDay(raw: HealthState): DailyHealth {
  const profile = { name: "", wakeTime: "07:00", breakfastTime: "08:30", lunchTime: "13:00", dinnerTime: "20:00", sleepReminder: "22:30", waterGoal: 2500, timezone: "UTC", ...(raw.profile as Partial<Routine>) };
  const meals = mealTypes.map(type => ({ type, plannedTime: profile[`${type}Time`], actualTime: profile[`${type}Time`], description: "", image: "", hunger: 3, fullness: 3, notes: "", status: "pending" as const, ...(raw.meals as Meal[] | undefined)?.find(meal => meal.type === type) }));
  return { ...raw, profile, meals, water: raw.water ?? 0, sleep: { sleptAt: "", wokeAt: "", hours: 0, minutes: 0, quality: "Okay", ...(raw.sleep as Partial<Sleep>) }, quoteFeedback: raw.quoteFeedback as DailyHealth["quoteFeedback"] };
}

export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function nextMeal(day: DailyHealth) {
  return [...day.meals].filter(meal => meal.status === "pending" || meal.status === "snoozed").sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))[0] ?? null;
}

export function sleepDuration(sleptAt: string, wokeAt: string) {
  if (!/^\d{2}:\d{2}$/.test(sleptAt) || !/^\d{2}:\d{2}$/.test(wokeAt)) return null;
  if ([sleptAt, wokeAt].some(time => Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59)) return null;
  const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  const total = (minutes(wokeAt) - minutes(sleptAt) + 1440) % 1440;
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
