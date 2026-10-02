import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mealImageBucket, mealImagePath } from "@/lib/meal-images";

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

  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return NextResponse.json({ error: "Invalid page. Page size must be between 1 and 100." }, { status: 400 });
  }
  const start = (page - 1) * pageSize;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error, count } = await adminClient
    .from("health_snapshots")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const imagePaths = new Set<string>();
  for (const row of rows) {
    for (const meal of Array.isArray(row.meals) ? row.meals.slice(0, 3) : []) {
      if (!meal || typeof meal !== "object") continue;
      const path = typeof meal.image === "string" ? mealImagePath(meal.image) : null;
      if (path && path.startsWith(`${row.user_id}/`) && !path.includes("..")) imagePaths.add(path);
    }
  }
  const signedUrls = new Map<string, string>();
  let imageWarning: string | null = null;
  if (imagePaths.size) {
    const { data: signed, error: signError } = await adminClient.storage.from(mealImageBucket)
      .createSignedUrls([...imagePaths], 3600);
    if (signError) imageWarning = "Some meal photos could not be loaded. Refresh to try again.";
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
      if (item.error) imageWarning = "Some meal photos could not be loaded. Refresh to try again.";
    }
  }
  const snapshots = rows.map((row) => ({
    clientId: row.client_id,
    userId: row.user_id ?? undefined,
    date: row.date,
    profile: { ...(row.profile ?? {}), name: typeof row.profile?.name === "string" ? row.profile.name : "User", waterGoal: Number(row.profile?.waterGoal) || 2500 },
    meals: (Array.isArray(row.meals) ? row.meals.slice(0, 3) : []).filter((meal: unknown) => meal && typeof meal === "object").map((meal: Record<string, unknown>) => {
      const path = typeof meal.image === "string" ? mealImagePath(meal.image) : null;
      return { ...meal, image: path ? signedUrls.get(path) ?? "" : "" };
    }),
    water: row.water ?? 0,
    sleep: row.sleep ?? {},
    sleepCheckCompleted: row.sleep_check_completed ?? false,
    quoteIndex: row.quote_index ?? 0,
    quoteFeedback: row.quote_feedback ?? null,
    onboardingCompleted: row.onboarding_completed ?? true,
    notificationPreference: row.notification_preference ?? null,
    updatedAt: row.updated_at ?? undefined,
  }));

  return NextResponse.json({ snapshots, page, pageSize, total: count ?? 0, hasMore: start + rows.length < (count ?? 0), imageWarning });
}

function isAdminEmail(email?: string | null) {
  const configuredEmails = (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const allowedEmails = ["kanil977690@gmail.com", ...configuredEmails];

  return Boolean(email && allowedEmails.includes(email.toLowerCase()));
}
