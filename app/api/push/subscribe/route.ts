import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validatePushSubscription } from "@/lib/push-server";
import { consumeRateLimit } from "@/lib/server-rate-limit";

type PushBody = {
  endpoint?: string;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };
};

const MAX_SUBSCRIPTION_BYTES = 8 * 1024;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase push env vars are missing." }, { status: 500 });
  }

  const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
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
    return NextResponse.json({ error: "Sign in before enabling notifications." }, { status: 401 });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_SUBSCRIPTION_BYTES) {
    return NextResponse.json({ error: "Push subscription is too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_SUBSCRIPTION_BYTES) {
    return NextResponse.json({ error: "Push subscription is too large." }, { status: 413 });
  }

  let body: PushBody;
  try {
    body = JSON.parse(rawBody) as PushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let subscription;
  try {
    subscription = validatePushSubscription(body?.subscription);
    if (body.endpoint !== subscription.endpoint) throw new Error("Endpoint mismatch.");
  } catch {
    return NextResponse.json({ error: "Invalid or unsupported push subscription." }, { status: 400 });
  }
  const endpoint = subscription.endpoint;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    if (!await consumeRateLimit(adminClient, `push-subscribe:${user.id}`, 20, 3600)) {
      return NextResponse.json({ error: "Too many subscription changes. Try again later." }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Push registration is temporarily unavailable." }, { status: 503 });
  }
  // Never overwrite an endpoint's owner: insert first, then update only an owned row.
  const row = { user_id: user.id, endpoint, subscription, updated_at: new Date().toISOString() };
  const { error: insertError } = await adminClient.from("push_subscriptions").insert(row);
  if (insertError?.code === "23505") {
    const { data, error } = await adminClient.from("push_subscriptions")
      .update({ subscription, updated_at: row.updated_at })
      .eq("endpoint", endpoint).eq("user_id", user.id).select("id");
    if (error) return NextResponse.json({ error: "Unable to save push subscription." }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "Push endpoint belongs to another account." }, { status: 409 });
  } else if (insertError) {
    return NextResponse.json({ error: "Unable to save push subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
