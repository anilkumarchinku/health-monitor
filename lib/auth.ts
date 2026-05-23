"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function requireSignedInUser() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "/auth";
    return null;
  }

  return user;
}

export async function signOut() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "/auth";
}
