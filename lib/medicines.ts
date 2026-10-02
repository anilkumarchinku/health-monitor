export type FoodRule = "with_food" | "before_food" | "none";
export type DoseStatus = "reminded" | "taken" | "skipped";

export type Medicine = {
  id: string;
  user_id: string;
  name: string;
  dose_label: string;
  schedule_time: string;
  timezone: string;
  food_rule: FoodRule;
  notes: string;
  active: boolean;
};

export type MedicineDose = {
  id: string;
  medicine_id: string;
  user_id: string;
  scheduled_date: string;
  status: DoseStatus;
  food_answer: boolean | null;
  taken_at: string | null;
};

export const foodRuleLabels: Record<FoodRule, string> = {
  with_food: "With food",
  before_food: "Before food",
  none: "No food requirement",
};

export function localDateInTimezone(timezone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type DoseEventValue = {
  status: DoseStatus;
  food_answer: boolean | null;
  taken_at: string | null;
  scheduled_date: string;
  medicine_id: string;
};
export type MedicineDoseEvent = {
  id: string;
  medicine_name: string;
  scheduled_date: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  previous_value: DoseEventValue | null;
  next_value: DoseEventValue | null;
  recorded_at: string;
};

export function describeMedicineDoseEvent(event: MedicineDoseEvent) {
  const label = (value: DoseEventValue | null) => !value ? "No entry" : value.status === "reminded" ? "Pending" : value.status === "taken" ? "Taken" : "Skipped";
  if (event.operation === "INSERT") return `Recorded as ${label(event.next_value).toLowerCase()}`;
  if (event.operation === "DELETE") return `Removed entry (was ${label(event.previous_value).toLowerCase()})`;
  const changes = [`${label(event.previous_value)} → ${label(event.next_value)}`];
  if (event.previous_value?.food_answer !== event.next_value?.food_answer) {
    const food = (value: boolean | null | undefined) => value == null ? "not recorded" : value ? "ate" : "not yet eaten";
    changes.push(`Food: ${food(event.previous_value?.food_answer)} → ${food(event.next_value?.food_answer)}`);
  }
  if (event.previous_value?.taken_at !== event.next_value?.taken_at) changes.push("Recorded time changed");
  if (event.previous_value?.scheduled_date !== event.next_value?.scheduled_date) changes.push(`Scheduled date: ${event.previous_value?.scheduled_date} → ${event.next_value?.scheduled_date}`);
  return changes.join(" · ");
}
