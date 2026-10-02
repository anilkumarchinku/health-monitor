import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { sendSafePushNotification } from "@/lib/push-server";
import { consumeRateLimit } from "@/lib/server-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type BroadcastBody = { campaignId?: string; title?: string; body?: string; url?: string };
type ClaimedDevice = { subscription_id: string; subscription: webpush.PushSubscription; attempts: number };
const DEFAULT_CAMPAIGN = "health-monitor-back-live-2026-09";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron secret is not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = process.env;
  if (!url || !key || !publicKey || !privateKey) return NextResponse.json({ error: "Broadcast env vars are missing." }, { status: 503 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 4096) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let body: BroadcastBody;
  try { body = JSON.parse(raw || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    (body.campaignId !== undefined && (typeof body.campaignId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(body.campaignId))) ||
    (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 120)) ||
    (body.body !== undefined && (typeof body.body !== "string" || body.body.length > 500)) ||
    (body.url !== undefined && (typeof body.url !== "string" || !body.url.startsWith("/") || body.url.startsWith("//") || /[\\\x00-\x20]/.test(body.url)))) {
    return NextResponse.json({ error: "Invalid broadcast message." }, { status: 400 });
  }
  if (!body.campaignId && (body.title !== undefined || body.body !== undefined || body.url !== undefined)) {
    return NextResponse.json({ error: "Custom messages require a stable campaignId. Reuse that ID for every retry." }, { status: 400 });
  }
  const campaignId = body.campaignId ?? DEFAULT_CAMPAIGN;
  const requestedPayload = {
    title: body.title?.trim() || "Dee Meals is back",
    body: body.body?.trim() || "We are back. Tap to check your meals, water, and sleep.",
    url: body.url || "/", tag: `broadcast-${campaignId}`, icon: "/icon-192.png", badge: "/badge-72.png",
  };
  const db = createClient(url, key);
  let sent = 0;
  let staleDeleted = 0;
  const failures: string[] = [];
  try {
    const { data: existing, error: lookupError } = await db.from("push_broadcast_campaigns").select("payload").eq("id", campaignId).maybeSingle();
    if (lookupError) throw new Error("Broadcast campaign storage is unavailable.");
    if (!existing) {
      if (!await consumeRateLimit(db, "push-broadcast:create", 1, 3600)) return NextResponse.json({ error: "A new broadcast was already started this hour." }, { status: 429 });
      const { error } = await db.from("push_broadcast_campaigns").insert({ id: campaignId, payload: requestedPayload });
      if (error && error.code !== "23505") throw new Error("Could not save the broadcast campaign.");
    }
    const { data: campaign, error: campaignError } = await db.from("push_broadcast_campaigns").select("payload").eq("id", campaignId).single();
    if (campaignError || !campaign) throw new Error("Could not load the saved broadcast.");
    // A continuation containing only campaignId uses the exact originally stored message.
    if ((body.title !== undefined || body.body !== undefined || body.url !== undefined) &&
      Object.entries(requestedPayload).some(([key, value]) => campaign.payload[key] !== value)) {
      return NextResponse.json({ error: "This campaign already has a different message. Its payload cannot change during retries." }, { status: 409 });
    }
    if (!await consumeRateLimit(db, "push-broadcast:dispatch", 1, 30)) return NextResponse.json({ campaignId, deferred: true, mayHaveMore: true, error: "Wait 30 seconds before continuing this campaign." }, { status: 429 });
    const { data: audienceComplete, error: enqueueError } = await db.rpc("enqueue_push_broadcast", { p_campaign_id: campaignId });
    if (enqueueError) throw new Error("Could not enqueue the next audience page.");
    const token = crypto.randomUUID();
    const { data, error: claimError } = await db.rpc("claim_push_broadcast", { p_campaign_id: campaignId, p_token: token });
    if (claimError) throw new Error("Could not claim pending broadcast deliveries.");
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@health-monitor-amber.vercel.app", publicKey, privateKey);
    const rows = (data ?? []) as ClaimedDevice[];
    for (let offset = 0; offset < rows.length; offset += 5) {
      const outcomes = await Promise.allSettled(rows.slice(offset, offset + 5).map(async (row) => {
        let status = "accepted";
        let lastError: string | null = null;
        try { await sendSafePushNotification(row.subscription, JSON.stringify(campaign.payload)); }
        catch (error) {
          const code = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
          status = code === 404 || code === 410 ? "stale" : row.attempts < 5 && (code === 0 || code === 429 || code >= 500) ? "retry" : "failed";
          lastError = `Push rejected (${code || "network or invalid subscription"}).`;
          failures.push(`${row.subscription_id}: ${lastError}`);
        }
        const { data: saved, error } = await db.from("push_broadcast_deliveries").update({ status, last_error: lastError, lease_token: null, lease_until: null, next_attempt_at: new Date(Date.now() + Math.min(3600, 60 * 2 ** (row.attempts - 1)) * 1000).toISOString(), updated_at: new Date().toISOString() })
          .eq("campaign_id", campaignId).eq("subscription_id", row.subscription_id).eq("lease_token", token).select("subscription_id").maybeSingle();
        if (error || !saved) throw new Error("Broadcast result could not be saved. Continue the same campaign after the lease expires.");
        if (status === "accepted") sent++;
        if (status === "stale") {
          const { error: deleteError } = await db.from("push_subscriptions").delete().eq("id", row.subscription_id);
          if (deleteError) throw new Error("Stale device cleanup failed.");
          staleDeleted++;
        }
      }));
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    }
    const [pending, total, failed] = await Promise.all([
      db.from("push_broadcast_deliveries").select("subscription_id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", ["pending", "retry", "sending"]),
      db.from("push_broadcast_deliveries").select("subscription_id", { count: "exact", head: true }).eq("campaign_id", campaignId),
      db.from("push_broadcast_deliveries").select("subscription_id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "failed"),
    ]);
    if (pending.error || total.error || failed.error) throw new Error("Could not read campaign progress.");
    return NextResponse.json({ campaignId, sent, totalSubscriptions: total.count ?? 0, staleDeleted, failures, pending: pending.count ?? 0, failed: failed.count ?? 0, audienceComplete: audienceComplete === true, mayHaveMore: audienceComplete !== true || Boolean(pending.count) });
  } catch (error) {
    return NextResponse.json({ campaignId, sent, staleDeleted, failures, mayHaveMore: true, error: error instanceof Error ? error.message : "Broadcast interrupted. Retry the same campaign." }, { status: 503 });
  }
}
