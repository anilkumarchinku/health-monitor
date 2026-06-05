import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SnapshotPayload = {
  date?: string;
  profile?: {
    timezone?: string;
  } | unknown;
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
  const date = typeof snapshot.date === "string" ? snapshot.date : getLocalDateFromSnapshot(snapshot);
  const updatedAt = typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : new Date().toISOString();
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const row = {
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
    payload: stripLargeImages({ ...snapshot, date, updatedAt, userId: user.id }),
    updated_at: updatedAt,
  };

  const { data: existing, error: lookupError } = await adminClient
    .from("health_snapshots")
    .select("id")
    .eq("user_id", user.id)
    .eq("date", date)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message, step: "lookup" }, { status: 500 });
  }

  const { error } = existing?.id
    ? await adminClient.from("health_snapshots").update(row).eq("id", existing.id)
    : await adminClient.from("health_snapshots").insert(row);

  if (error) {
    return NextResponse.json({ error: error.message, step: existing?.id ? "update" : "insert" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: user.id, date });
}

function getLocalDateFromSnapshot(snapshot: SnapshotPayload) {
  const timezone =
    typeof snapshot.profile === "object" &&
    snapshot.profile &&
    "timezone" in snapshot.profile &&
    typeof snapshot.profile.timezone === "string"
      ? snapshot.profile.timezone
      : "UTC";

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function stripLargeImages(value: SnapshotPayload & { userId: string }) {
  return {
    ...value,
    meals: value.meals?.map((meal) => {
      if (typeof meal !== "object" || !meal) return meal;
      const mealRecord = meal as Record<string, unknown>;

      return {
        ...mealRecord,
        image:
          typeof mealRecord.image === "string" && mealRecord.image.length > 2000
            ? "[stored-on-device]"
            : mealRecord.image,
      };
    }),
  };
}
