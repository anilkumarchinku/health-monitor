import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SnapshotPayload = {
  date?: string;
  profile?: unknown;
  meals?: unknown[];
  water?: number;
  sleep?: unknown;
  sleepCheckCompleted?: boolean;
  quoteIndex?: number;
  quoteFeedback?: unknown;
  onboardingCompleted?: boolean;
  notificationPreference?: unknown;
  updatedAt?: string;
};

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase sync env vars are missing." }, { status: 500 });
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
    return NextResponse.json({ error: "Sign in before syncing health data." }, { status: 401 });
  }

  const snapshot = (await request.json()) as SnapshotPayload;
  const date = typeof snapshot.date === "string" ? snapshot.date : new Date().toISOString().slice(0, 10);
  const updatedAt = typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : new Date().toISOString();
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await adminClient.from("health_snapshots").upsert(
    {
      user_id: user.id,
      client_id: user.id,
      date,
      profile: snapshot.profile ?? {},
      meals: snapshot.meals ?? [],
      water: snapshot.water ?? 0,
      sleep: snapshot.sleep ?? {},
      sleep_check_completed: snapshot.sleepCheckCompleted ?? false,
      quote_index: snapshot.quoteIndex ?? 0,
      quote_feedback: stringifyValue(snapshot.quoteFeedback),
      onboarding_completed: snapshot.onboardingCompleted ?? true,
      notification_preference: stringifyValue(snapshot.notificationPreference),
      payload: { ...snapshot, date, updatedAt, userId: user.id },
      updated_at: updatedAt,
    },
    { onConflict: "user_id,date" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: user.id, date });
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
