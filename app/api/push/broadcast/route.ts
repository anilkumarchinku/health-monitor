import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type BroadcastBody = {
  title?: string;
  body?: string;
  url?: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  subscription: webpush.PushSubscription;
};

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Broadcast env vars are missing." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as BroadcastBody;
  const payload = {
    title: body.title?.trim() || "Dee Meals is back",
    body: body.body?.trim() || "We are back. Tap to check your meals, water, and sleep.",
    url: body.url || "/",
    tag: "dee-meals-broadcast",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
  };

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, subscription")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    ((data ?? []) as SubscriptionRow[]).map(async (subscriptionRow) => {
      try {
        await webpush.sendNotification(subscriptionRow.subscription, JSON.stringify(payload));
        sent += 1;
      } catch (pushError) {
        const statusCode =
          typeof pushError === "object" && pushError && "statusCode" in pushError
            ? Number(pushError.statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(subscriptionRow.id);
        }
        failures.push(`${subscriptionRow.endpoint.slice(0, 48)}...${statusCode ? ` (${statusCode})` : ""}`);
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return NextResponse.json({
    sent,
    totalSubscriptions: data?.length ?? 0,
    staleDeleted: staleIds.length,
    failures,
  });
}
