import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validateReportRange, type HealthReport, type ReportDay, type ReportDose, type ReportMedicine, type ReportOptions } from "@/lib/health-report";

export async function loadHealthReport(options: ReportOptions): Promise<{ owner: string; report: HealthReport }> {
  validateReportRange(options.start, options.end);
  const db = createSupabaseBrowserClient();
  if (!db) throw new Error("Connect your account before preparing a report.");
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("Sign in before preparing your report.");
  // Explicit owner filters supplement RLS. No privileged credentials, photo URLs or local cache.
  const { data: snapshots, error } = await db.from("health_snapshots")
    .select("date,profile,meals,water,sleep,sleep_check_completed")
    .eq("user_id", user.id).gte("date", options.start).lte("date", options.end).order("date", { ascending: true }).limit(91);
  if (error) throw new Error("Could not load health records. Retry when your connection is ready.");
  const doses: ReportDose[] = [];
  const medicines: ReportMedicine[] = [];
  if (options.includeMedicines) {
    for (let offset = 0; ; offset += 500) {
      const result = await db.from("medicine_doses").select("id,medicine_id,scheduled_date,status,taken_at,food_answer")
        .eq("user_id", user.id).gte("scheduled_date", options.start).lte("scheduled_date", options.end)
        .order("scheduled_date", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
      if (result.error) throw new Error("Could not load medicine records. Retry, or turn off medicine records to export daily health only.");
      doses.push(...(result.data ?? []) as ReportDose[]);
      if (doses.length > 5000) throw new Error("This report has too many medicine entries. Choose a shorter date range.");
      if ((result.data?.length ?? 0) < 500) break;
    }
    const ids = [...new Set(doses.map(dose => dose.medicine_id))];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await db.from("medicines").select("id,name,dose_label").eq("user_id", user.id).in("id", ids.slice(offset, offset + 100));
      if (result.error) throw new Error("Could not load medicine names. Please retry.");
      medicines.push(...(result.data ?? []) as ReportMedicine[]);
    }
  }
  const { data: { user: current }, error: currentError } = await db.auth.getUser();
  if (currentError || current?.id !== user.id) throw new Error("Your account changed. Prepare a new report after signing in.");
  return { owner: user.id, report: { options: { ...options }, generatedAt: new Date().toISOString(), days: (snapshots ?? []) as ReportDay[], doses, medicines } };
}
