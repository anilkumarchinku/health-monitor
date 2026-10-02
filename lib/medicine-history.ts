"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MedicineDoseEvent } from "@/lib/medicines";

export async function loadMedicineDoseEvents(userId: string): Promise<MedicineDoseEvent[]> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Medicine history is unavailable.");
  const { data, error } = await supabase.from("medicine_dose_events")
    .select("id,medicine_name,scheduled_date,operation,previous_value,next_value,recorded_at")
    .eq("user_id", userId).order("recorded_at", { ascending: false }).limit(100);
  if (error) throw new Error("Medicine change history is unavailable. Please retry.");
  return (data ?? []) as MedicineDoseEvent[];
}
