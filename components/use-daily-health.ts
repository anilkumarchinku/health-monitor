"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requireSignedInUser } from "@/lib/auth";
import { getLocalDateForState, getSyncStatus, hydrateHealthState, isSupabaseConfigured, readLocalState, saveHealthStateWithHistory, type HealthState } from "@/lib/health-sync";
import { safeReturnPath } from "@/lib/return-path";
import { normaliseDay, type DailyHealth } from "@/lib/daily-health";

export function useDailyHealth() {
  const [state, setState] = useState<DailyHealth | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<DailyHealth | null>(null);
  const saving = useRef(false);
  const accept = useCallback((raw: HealthState) => { const next = normaliseDay(raw); current.current = next; setState(next); }, []);
  const reload = useCallback(async () => {
    setError("");
    if (!isSupabaseConfigured()) { setError("The app cannot connect to your account right now. Please try again later."); return; }
    try {
      const user = await requireSignedInUser();
      if (!user) return;
      const raw = await hydrateHealthState<HealthState>(user.id);
      if (!raw?.onboardingCompleted) { window.location.href = `/onboarding?next=${encodeURIComponent(safeReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`))}`; return; }
      accept(raw);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load your check-ins."); }
  }, [accept]);
  useEffect(() => {
    void reload();
    const refresh = () => {
      if (saving.current || document.visibilityState !== "visible" || !current.current) return;
      const raw = readLocalState<HealthState>();
      if (raw && raw.date !== getLocalDateForState(raw)) { setError("A new day has started. Reload to sync your previous day before making a new entry."); return; }
      if (raw) accept(raw);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [accept, reload]);

  const update = useCallback(async (patch: Partial<DailyHealth>) => {
    const base = current.current;
    if (!base || saving.current) return false;
    if (getSyncStatus() === "conflict") { setError("Your records changed on another device. Reload your account data before editing."); return false; }
    if (base.date && base.date !== getLocalDateForState(base)) { setError("A new day has started. Reload to sync your previous day before making a new entry."); return false; }
    saving.current = true; setBusy(true); setError("");
    const next = { ...base, ...patch };
    const owner = localStorage.getItem("daily-health-current-user");
    try {
      await saveHealthStateWithHistory(next);
      if (owner !== localStorage.getItem("daily-health-current-user") || getSyncStatus() === "conflict") { setError("Your account or records changed. Reload before editing again."); return false; }
      accept(readLocalState<HealthState>() ?? next);
      return true; // Locally saved; HealthSyncStatus reports cloud success separately.
    } catch { setError("Could not save on this device. Please retry."); return false; }
    finally { saving.current = false; setBusy(false); }
  }, [accept]);
  return { state, error, busy, update, reload };
}
