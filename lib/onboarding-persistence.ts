import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getBrowserTimezone, hydrateHealthState, saveHealthStateWithHistory, validateHealthProfile } from "@/lib/health-sync";
import { buildOnboardingSnapshot, type OnboardingAnswers } from "@/lib/onboarding";

/** Pending daily edits must not send an already completed account through setup again. */
export async function hasSavedOnboarding(userId: string) {
  const db = createSupabaseBrowserClient();
  if (!db) throw new Error("Account service is unavailable. Please try again.");
  const { data, error } = await db.from("health_snapshots").select("onboarding_completed").eq("user_id", userId).order("date", { ascending: false }).limit(1);
  if (error) throw new Error("Couldn't confirm your saved setup. Please retry.");
  return data?.[0]?.onboarding_completed === true;
}

/** Uses the existing authenticated, versioned snapshot writer. No new endpoint or table. */
export async function saveOnboardingResponses(userId: string, answers: OnboardingAnswers) {
  const db = createSupabaseBrowserClient();
  if (!db) throw new Error("Account service is unavailable. Please try again.");
  const { data, error } = await db.auth.getUser();
  if (error || data.user?.id !== userId) throw new Error("Your account changed. Reload before saving.");
  // Re-read the latest version so revisiting preferences never resets health logs.
  const latest = await hydrateHealthState(userId);
  const snapshot = buildOnboardingSnapshot(latest, answers, getBrowserTimezone());
  const problem = validateHealthProfile(snapshot.profile);
  if (problem) throw new Error(problem);
  if (!await saveHealthStateWithHistory(snapshot)) throw new Error("Your answers are kept on this device. We couldn't confirm the cloud save. Retry to finish.");
}
