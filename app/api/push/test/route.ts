import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

type TestPushBody = {
  endpoint?: string;
};

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !supabaseKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Push notification env vars are missing." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Missing Supabase access token." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in before sending a test push." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TestPushBody;
  const currentEndpoint = body.endpoint?.trim();

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let query = adminClient
    .from("push_subscriptions")
    .select("id, endpoint, subscription")
    .eq("user_id", user.id);

  if (currentEndpoint) {
    query = query.eq("endpoint", currentEndpoint);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json(
      {
        error: currentEndpoint
          ? "This exact device is not saved for push. Tap Enable device again on this device."
          : "No saved push subscription. Tap enable notifications again on this device.",
        sent: 0,
        checkedCurrentDevice: Boolean(currentEndpoint),
      },
      { status: 404 },
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@health-monitor-amber.vercel.app",
    vapidPublicKey,
    vapidPrivateKey,
  );

  let sent = 0;
  const failures: string[] = [];
  const staleIds: string[] = [];

  await Promise.all(
    data.map(async (row) => {
      try {
        await webpush.sendNotification(
          row.subscription,
          JSON.stringify({
            title: "Meal reminder",
            body: "Tap to open your meal check-in.",
            url: "/meal/lunch",
            tag: "meal-reminder-test",
            icon: "/icon-192.png",
            badge: "/badge-72.png",
          }),
        );
        sent += 1;
      } catch (pushError) {
        const statusCode =
          typeof pushError === "object" && pushError && "statusCode" in pushError
            ? Number(pushError.statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(row.id);
        }
        failures.push(`${row.endpoint.slice(0, 48)}...${statusCode ? ` (${statusCode})` : ""}`);
      }
    }),
  );

  if (staleIds.length > 0) {
    await adminClient.from("push_subscriptions").delete().in("id", staleIds);
  }

  if (sent === 0) {
    return NextResponse.json(
      {
        error: currentEndpoint
          ? "This exact device is saved, but the push provider rejected it. Re-enable notifications on this device."
          : "Saved push subscription could not receive notifications.",
        sent,
        checkedCurrentDevice: Boolean(currentEndpoint),
        staleDeleted: staleIds.length,
        failures,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sent,
    checkedCurrentDevice: Boolean(currentEndpoint),
    staleDeleted: staleIds.length,
    failures,
  });
}
