import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared database counter; fail closed if the migration/database is unavailable. */
export async function consumeRateLimit(client: SupabaseClient, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await client.rpc("consume_rate_limit", {
    p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (error || typeof data !== "boolean") throw new Error("Rate limit service unavailable.");
  return data;
}
