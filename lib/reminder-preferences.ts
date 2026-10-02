export type ReminderPreferences = { meals: boolean; medicines: boolean; morning: boolean; sleep: boolean; monday: boolean };
export const defaultReminderPreferences: ReminderPreferences = { meals: true, medicines: true, morning: true, sleep: true, monday: true };
export function reminderPreferences(value: unknown): ReminderPreferences {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultReminderPreferences).map(([key, fallback]) => [key, typeof input[key] === "boolean" ? input[key] : fallback])) as ReminderPreferences;
}
export function reminderEnabled(value: unknown, kind: string, localDate: string) {
  const preferences = reminderPreferences(value);
  if (kind === "medicine") return preferences.medicines;
  if (["breakfast", "lunch", "dinner"].includes(kind)) return preferences.meals;
  if (kind === "sleep") return preferences.sleep;
  if (kind === "morning") return preferences.morning || (preferences.monday && new Date(`${localDate}T12:00:00Z`).getUTCDay() === 1);
  return false;
}
