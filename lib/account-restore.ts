import { hydrateHealthState } from "@/lib/health-sync";
import { safeReturnPath } from "@/lib/return-path";

/** Restore through the same conflict-aware path used by the daily screens. */
export async function restoreAccountDestination(userId: string, next: string) {
  const state = await hydrateHealthState(userId);
  const destination = safeReturnPath(next);
  return state?.onboardingCompleted ? destination : `/onboarding?next=${encodeURIComponent(destination)}`;
}
