import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailPayload, campaignKey, emailPublicUrl, EmailSendError, makeUnsubscribeToken, sendResendEmail, type EmailPayload } from "@/lib/email-announcements";
import { consumeRateLimit } from "@/lib/server-rate-limit";

type Delivery = { user_id: string; recipient_email: string; attempts: number; request_payload: EmailPayload | null };

export async function processEmailQueue(admin: SupabaseClient) {
  if (!(await consumeRateLimit(admin, "email:dispatch", 1, 30))) return { accepted: 0, failed: 0, deferred: true, mayHaveMore: true };
  const now = new Date();
  const nowIso = now.toISOString();
  const { error: reviewError } = await admin.from("email_announcement_deliveries").update({ status: "review", error: "Retry budget or provider idempotency window exhausted; reconcile in Resend before replay." })
    .eq("campaign_key", campaignKey).in("status", ["pending", "failed"])
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .or(`attempts.gte.5,first_attempt_at.lt.${new Date(now.getTime() - 23 * 3600000).toISOString()}`);
  if (reviewError) throw new Error(reviewError.message);
  const { data: candidates, error } = await admin.from("email_announcement_deliveries")
    .select("user_id,recipient_email,attempts,request_payload").eq("campaign_key", campaignKey).in("status", ["pending", "failed"])
    .lte("next_attempt_at", nowIso).or(`lease_until.is.null,lease_until.lt.${nowIso}`).order("next_attempt_at").limit(3);
  if (error) throw new Error(error.message);
  let accepted = 0;
  let failed = 0;
  for (const row of (candidates ?? []) as Delivery[]) {
    const { data: optOut, error: optError } = await admin.from("email_announcement_opt_outs").select("user_id").eq("user_id", row.user_id).maybeSingle();
    if (optError) throw new Error(optError.message);
    if (optOut) {
      const { error: cancelError } = await admin.from("email_announcement_deliveries").update({ status: "cancelled" }).eq("campaign_key", campaignKey).eq("user_id", row.user_id).in("status", ["pending", "failed"]);
      if (cancelError) throw new Error(cancelError.message);
      continue;
    }
    const token = crypto.randomUUID();
    const payload = row.request_payload ?? buildEmailPayload(row.recipient_email, `${emailPublicUrl()}/api/email/unsubscribe?user=${row.user_id}&token=${makeUnsubscribeToken(row.user_id)}`);
    const { data: claims, error: claimError } = await admin.rpc("claim_email_delivery", { p_campaign_key: campaignKey, p_user_id: row.user_id, p_lease_token: token, p_payload: payload });
    if (claimError) throw new Error(claimError.message);
    const claim = (claims as Delivery[] | null)?.[0];
    if (!claim) continue;
    let update: Record<string, unknown>;
    try {
      const providerId = await sendResendEmail({ payload: claim.request_payload!, idempotencyKey: `${campaignKey}-${row.user_id}` });
      update = { status: "accepted", provider_id: providerId, error: null };
      accepted++;
    } catch (error) {
      const retryable = error instanceof EmailSendError && error.retryable && claim.attempts < 5;
      const seconds = Math.max(error instanceof EmailSendError ? error.retryAfterSeconds : 60, 60 * 2 ** (claim.attempts - 1));
      update = { status: retryable ? "failed" : "review", error: error instanceof Error ? error.message.slice(0, 500) : "Send failed", next_attempt_at: new Date(Date.now() + seconds * 1000).toISOString() };
      failed++;
    }
    const { data: saved, error: saveError } = await admin.from("email_announcement_deliveries")
      .update({ ...update, lease_until: null, lease_token: null, updated_at: new Date().toISOString() })
      .eq("campaign_key", campaignKey).eq("user_id", row.user_id).eq("lease_token", token).select("user_id").maybeSingle();
    // Leave an ambiguous accepted send's reservation recoverable using its original payload/key.
    if (saveError || !saved) throw new Error("Delivery state could not be saved. Re-run after the lease expires; do not create a new campaign.");
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  const { count, error: countError } = await admin.from("email_announcement_deliveries").select("user_id", { count: "exact", head: true }).eq("campaign_key", campaignKey).in("status", ["pending", "failed"]);
  const { count: review, error: reviewCountError } = await admin.from("email_announcement_deliveries").select("user_id", { count: "exact", head: true }).eq("campaign_key", campaignKey).eq("status", "review");
  if (countError || reviewCountError) throw new Error("Could not read remaining delivery counts.");
  return { accepted, failed, pending: count ?? 0, review: review ?? 0, mayHaveMore: Boolean(count), deferred: false };
}
