export type ReportOptions = { start: string; end: string; includeName: boolean; includeMedicines: boolean };
export type ReportDay = { date: string; profile: { name?: string } | null; meals: { type?: string; status?: string; actualTime?: string; description?: string }[] | null; water: number; sleep: { hours?: number; minutes?: number; quality?: string } | null; sleep_check_completed: boolean };
export type ReportDose = { id: string; medicine_id: string; scheduled_date: string; status: string; taken_at: string | null; food_answer: boolean | null };
export type ReportMedicine = { id: string; name: string; dose_label: string };
export type HealthReport = { options: ReportOptions; generatedAt: string; days: ReportDay[]; doses: ReportDose[]; medicines: ReportMedicine[] };

export function validateReportRange(start: string, end: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) throw new Error("Choose valid start and end dates.");
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days < 1 || days > 90) throw new Error("Choose a date range of 1 to 90 days.");
  return days;
}

export function reportFilename(options: ReportOptions, extension = "pdf") {
  validateReportRange(options.start, options.end);
  return `health-report-${options.start}-to-${options.end}.${extension}`;
}

const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").trim() : "";
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export function reportLines(report: HealthReport): string[] {
  const { options, days } = report;
  validateReportRange(options.start, options.end);
  const lines = ["HEALTH MONITOR", "Your health report", `${options.start} to ${options.end}`, `Generated: ${report.generatedAt}`, ""];
  if (options.includeName) {
    const name = [...days].reverse().find(day => clean(day.profile?.name))?.profile?.name;
    if (name) lines.push(`Name: ${clean(name)}`, "");
  }
  lines.push("SUMMARY", `${days.length} days with saved health records`, `Meals logged: ${days.reduce((n, day) => n + (day.meals ?? []).filter(meal => meal.status === "logged").length, 0)}`,
    `Water recorded: ${days.reduce((n, day) => n + finite(day.water), 0)} ml`, "",
    "Saved records only. Unsynced changes are not included.", "Missing entries do not mean a meal or medicine was missed.", "Self-recorded information; this is not a medical assessment.", "");
  if (!days.length) lines.push("No saved meal, water or sleep records in this period.", "");
  for (const day of days) {
    lines.push(day.date, `Water: ${finite(day.water)} ml`);
    lines.push(day.sleep_check_completed ? `Sleep: ${finite(day.sleep?.hours)}h ${finite(day.sleep?.minutes)}m${day.sleep?.quality ? `; ${clean(day.sleep.quality)}` : ""}` : "Sleep: not recorded");
    for (const meal of day.meals ?? []) {
      lines.push(`${clean(meal.type) || "Meal"}: ${clean(meal.status) || "not recorded"}${meal.status === "logged" && meal.actualTime ? ` at ${clean(meal.actualTime)}` : ""}`);
      if (meal.description) lines.push(`  ${clean(meal.description)}`);
    }
    lines.push("");
  }
  if (options.includeMedicines) {
    lines.push("MEDICINE RECORDS", "Dates follow each medicine's saved timezone. Taken times are UTC.", "Dose labels describe current settings, not historical prescriptions.");
    const medicines = new Map(report.medicines.map(m => [m.id, m]));
    if (!report.doses.length) lines.push("No saved medicine dose entries in this period.");
    for (const dose of report.doses) {
      const medicine = medicines.get(dose.medicine_id);
      lines.push(`${dose.scheduled_date} | ${clean(medicine?.name) || "Removed medicine"} | ${dose.status === "reminded" ? "Not marked taken" : clean(dose.status)}`);
      if (medicine?.dose_label) lines.push(`  Current dose label: ${clean(medicine.dose_label)}`);
      if (dose.taken_at) lines.push(`  Recorded taken at: ${clean(dose.taken_at)}`);
      if (dose.food_answer != null) lines.push(`  Food answer: ${dose.food_answer ? "Eaten" : "Not eaten yet"}`);
    }
  }
  return lines;
}
