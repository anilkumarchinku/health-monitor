import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Admin Supabase env vars are missing." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Missing Supabase access token." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in before opening admin monitoring." }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await adminClient
    .from("health_snapshots")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const snapshots = (data ?? []).map((row) => ({
    ...(row.payload ?? {}),
    clientId: row.client_id,
    userId: row.user_id ?? undefined,
    date: row.date,
    profile: row.profile ?? {},
    meals: row.meals ?? [],
    water: row.water ?? 0,
    sleep: row.sleep ?? {},
    sleepCheckCompleted: row.sleep_check_completed ?? false,
    quoteIndex: row.quote_index ?? 0,
    quoteFeedback: row.quote_feedback ?? null,
    onboardingCompleted: row.onboarding_completed ?? true,
    notificationPreference: row.notification_preference ?? null,
    updatedAt: row.updated_at ?? undefined,
  }));

  return NextResponse.json({ snapshots });
}

function isAdminEmail(email?: string | null) {
  const allowedEmails = (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(email && allowedEmails.includes(email.toLowerCase()));
}
