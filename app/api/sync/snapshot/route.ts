import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mealImagePath, mealImagePrefix, stripEmbeddedMealImages } from "@/lib/meal-images";

import { consumeRateLimit } from "@/lib/server-rate-limit";

const MAX_SNAPSHOT_BYTES = 64 * 1024;

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
  expectedUpdatedAt?: string | null;
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

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Invalid snapshot." }, { status: 400 });
  }

  const submitted = input as SnapshotPayload;
  if (submitted.expectedUpdatedAt !== null &&
      (typeof submitted.expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(submitted.expectedUpdatedAt)))) {
    return NextResponse.json({ error: "A snapshot version is required. Reload before saving." }, { status: 400 });
  }
  if (!isRecord(submitted.profile) || !isRecord(submitted.sleep) ||
      !Number.isInteger(submitted.water) || submitted.water! < 0 || submitted.water! > 100000 ||
      (submitted.quoteIndex !== undefined && (!Number.isInteger(submitted.quoteIndex) || submitted.quoteIndex < 0)) ||
      (submitted.onboardingCompleted !== undefined && typeof submitted.onboardingCompleted !== "boolean") ||
      (submitted.sleepCheckCompleted !== undefined && typeof submitted.sleepCheckCompleted !== "boolean")) {
    return NextResponse.json({ error: "Invalid health snapshot fields." }, { status: 400 });
  }
  const profile = submitted.profile as Record<string, unknown>;
  if ((profile.name !== undefined && (typeof profile.name !== "string" || profile.name.length > 100)) ||
      (profile.waterGoal !== undefined && (typeof profile.waterGoal !== "number" || !Number.isFinite(profile.waterGoal) || profile.waterGoal < 0 || profile.waterGoal > 100000))) {
    return NextResponse.json({ error: "Invalid profile fields." }, { status: 400 });
  }
  const sleep = submitted.sleep as Record<string, unknown>;
  if (["sleptAt", "wokeAt", "quality"].some((key) => sleep[key] !== undefined && (typeof sleep[key] !== "string" || (sleep[key] as string).length > 50)) ||
      ["hours", "minutes"].some((key) => sleep[key] !== undefined && (typeof sleep[key] !== "number" || !Number.isFinite(sleep[key]) || (sleep[key] as number) < 0 || (sleep[key] as number) > 1440))) {
    return NextResponse.json({ error: "Invalid sleep fields." }, { status: 400 });
  }
  if (profile.timezone !== undefined) {
    try {
      if (typeof profile.timezone !== "string") throw new Error();
      new Intl.DateTimeFormat("en", { timeZone: profile.timezone });
    } catch {
      return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
    }
  }
  for (const field of ["wakeTime", "breakfastTime", "lunchTime", "dinnerTime", "sleepReminder"]) {
    if (profile[field] !== undefined && (typeof profile[field] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(profile[field] as string))) {
      return NextResponse.json({ error: "Invalid reminder time." }, { status: 400 });
    }
  }
  if (submitted.meals !== undefined && (!Array.isArray(submitted.meals) || submitted.meals.length > 3)) {
    return NextResponse.json({ error: "Invalid meals." }, { status: 400 });
  }
  const snapshot = stripEmbeddedMealImages(submitted);
  const date = typeof snapshot.date === "string" ? snapshot.date : getLocalDateFromSnapshot(snapshot);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
    return NextResponse.json({ error: "Invalid snapshot date." }, { status: 400 });
  }
  // Always advance the server-controlled version, even for two writes in one millisecond.
  const updatedAt = new Date(Math.max(Date.now(), snapshot.expectedUpdatedAt ? Date.parse(snapshot.expectedUpdatedAt) + 1 : 0)).toISOString();
  const meals = (snapshot.meals ?? []).map((meal) => {
    if (!meal || typeof meal !== "object" || Array.isArray(meal)) return null;
    const record = meal as Record<string, unknown>;
    if (!["breakfast", "lunch", "dinner"].includes(String(record.type)) ||
        !["pending", "logged", "skipped", "snoozed"].includes(String(record.status))) return null;
    if (["description", "notes", "snoozeLabel", "plannedTime", "actualTime"].some((key) =>
      record[key] !== undefined && (typeof record[key] !== "string" || (record[key] as string).length > 2000))) return null;
    if (["hunger", "fullness"].some((key) => record[key] !== undefined &&
      (typeof record[key] !== "number" || !Number.isFinite(record[key]) || (record[key] as number) < 0 || (record[key] as number) > 10))) return null;
    const image = typeof record.image === "string" ? record.image : "";
    const path = mealImagePath(image);
    return {
      ...record,
      type: record.type as string,
      image: path && path.startsWith(`${user.id}/`) && !path.includes("..") ? `${mealImagePrefix}${path}` : "",
    };
  });
  if (meals.some((meal) => meal === null)) {
    return NextResponse.json({ error: "Invalid meal." }, { status: 400 });
  }
  if (new Set(meals.map((meal) => meal?.type)).size !== meals.length) {
    return NextResponse.json({ error: "Duplicate meals." }, { status: 400 });
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    if (!await consumeRateLimit(adminClient, `snapshot:${user.id}`, 120, 60)) {
      return NextResponse.json({ error: "Too many saves. Try again shortly." }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Saving is temporarily unavailable." }, { status: 503 });
  }

  const row = {
    user_id: user.id,
    client_id: user.id,
    date,
    profile: snapshot.profile ?? {},
    meals,
    water: snapshot.water ?? 0,
    sleep: snapshot.sleep ?? {},
    sleep_check_completed: snapshot.sleepCheckCompleted ?? false,
    quote_index: snapshot.quoteIndex ?? 0,
    quote_feedback: stringifyValue(snapshot.quoteFeedback),
    onboarding_completed: snapshot.onboardingCompleted ?? true,
    notification_preference: stringifyValue(snapshot.notificationPreference),
    payload: {
      date,
      profile: snapshot.profile ?? {},
      meals,
      water: snapshot.water ?? 0,
      sleep: snapshot.sleep ?? {},
      sleepCheckCompleted: snapshot.sleepCheckCompleted ?? false,
      quoteIndex: snapshot.quoteIndex ?? 0,
      quoteFeedback: snapshot.quoteFeedback ?? null,
      onboardingCompleted: snapshot.onboardingCompleted ?? true,
      notificationPreference: snapshot.notificationPreference ?? null,
      updatedAt,
      userId: user.id,
    },
    updated_at: updatedAt,
  };

  if (snapshot.expectedUpdatedAt === null) {
    const { error } = await adminClient.from("health_snapshots").insert(row);
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Health data changed on another device. Reload before saving." }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: "Unable to save health data." }, { status: 500 });
  } else {
    const { data, error } = await adminClient.from("health_snapshots").update(row)
      .eq("user_id", user.id).eq("date", date).eq("updated_at", snapshot.expectedUpdatedAt)
      .select("updated_at");
    if (error) return NextResponse.json({ error: "Unable to save health data." }, { status: 500 });
    if (!data?.length) {
      return NextResponse.json({ error: "Health data changed on another device. Reload before saving." }, { status: 409 });
    }
  }
  return NextResponse.json({ ok: true, userId: user.id, date, updatedAt });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
