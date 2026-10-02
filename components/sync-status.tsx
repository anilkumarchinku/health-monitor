"use client";

import { useEffect, useState } from "react";
import { getSyncStatus, storageKey, historyKey, syncCurrentLocalStateToSupabase, type SyncStatus } from "@/lib/health-sync";

export function HealthSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => {
    const update = () => setStatus(getSyncStatus());
    window.addEventListener("health-sync-status", update);
    const retry = () => { if (getSyncStatus() === "failed") void syncCurrentLocalStateToSupabase(); };
    window.addEventListener("online", retry);
    const accountChanged = (event: StorageEvent) => { if (event.key === "daily-health-current-user") window.location.reload(); };
    window.addEventListener("storage", accountChanged);
    return () => { window.removeEventListener("health-sync-status", update); window.removeEventListener("online", retry); window.removeEventListener("storage", accountChanged); };
  }, []);
  if (status === "idle") return null;
  return <div role="status" className="mx-auto my-3 max-w-[640px] rounded-xl border bg-white/50 p-3 text-xs text-muted-foreground">
    {status === "saving" ? "Saving to your account…" : status === "saved" ? "Your changes are saved to your account." : status === "conflict" ? "Your data changed on another device. Your unsent changes remain on this device. Reload cloud data before editing again." : "Saved on this device. Waiting to sync with your account; reminders may still use your previous schedule."}
    {status === "failed" && <button className="ml-3 underline" onClick={() => void syncCurrentLocalStateToSupabase()}>Retry sync</button>}
    {status === "conflict" && <button className="ml-3 underline" onClick={() => {
      if (!window.confirm("Replace unsent changes on this device with your latest cloud data?")) return;
      localStorage.removeItem(storageKey); localStorage.removeItem(historyKey); window.location.reload();
    }}>Reload cloud data</button>}
  </div>;
}
