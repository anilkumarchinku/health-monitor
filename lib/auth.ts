"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { historyKey, storageKey } from "@/lib/health-sync";
import { safeReturnPath } from "@/lib/return-path";

export async function requireSignedInUser() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = safeReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    window.location.href = `/auth?next=${encodeURIComponent(next)}`;
    return null;
  }

  if (user.email) {
    localStorage.setItem("sb-user-email", user.email);
  }

  return user;
}

export async function signOut() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  await supabase.auth.signOut();
  localStorage.removeItem(storageKey);
  localStorage.removeItem(historyKey);
  localStorage.removeItem("daily-health-client-id");
  localStorage.removeItem("daily-health-current-user");
  localStorage.removeItem("sb-user-email");
  window.location.href = "/auth";
}
