import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildEmailPayload, campaignKey, isTestSender, sendResendEmail } from "@/lib/email-announcements";

import { consumeRateLimit } from "@/lib/server-rate-limit";
import { processEmailQueue } from "@/lib/email-queue";

export const runtime = "nodejs";
export const maxDuration = 60;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are missing.");
  return createClient(url, key);
}

async function authorize(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return false;
  const client = createClient(url, key);
  const { data: { user }, error } = await client.auth.getUser(token);
  const allowed = (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return !error && Boolean(user?.email && ["kanil977690@gmail.com", ...allowed].includes(user.email.toLowerCase()));
}

export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let databaseConfigured = false;
  try {
    const admin = adminClient();
    const [optOuts, deliveries] = await Promise.all([
      admin.from("email_announcement_opt_outs").select("user_id").limit(0),
      admin.from("email_announcement_deliveries").select("user_id,attempts,lease_until,request_payload").limit(0),
    ]);
    databaseConfigured = !optOuts.error && !deliveries.error;
  } catch { /* Missing server credentials are reported as incomplete setup. */ }
  return NextResponse.json({
    campaignKey,
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    senderConfigured: Boolean(process.env.EMAIL_FROM),
    testSender: isTestSender(process.env.EMAIL_FROM ?? ""),
    testRecipientConfigured: Boolean(process.env.EMAIL_TEST_TO),
    publicUrlConfigured: Boolean(process.env.EMAIL_PUBLIC_URL),
    trackingConfigured: (process.env.EMAIL_UNSUBSCRIBE_SECRET?.length ?? 0) >= 32,
    databaseConfigured,
  });
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let mode: unknown;
  try { mode = (await request.json()).mode; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  try {
    const admin = adminClient();
    if (mode === "test") {
      const to = process.env.EMAIL_TEST_TO;
      if (!to) return NextResponse.json({ error: "EMAIL_TEST_TO is missing." }, { status: 503 });
      if (!(await consumeRateLimit(admin, "email:test", 3, 60))) return NextResponse.json({ error: "Test email limit reached. Try again in one minute." }, { status: 429 });
      const id = await sendResendEmail({ payload: buildEmailPayload(to), idempotencyKey: `health-monitor-test-${crypto.randomUUID()}` });
      return NextResponse.json({ accepted: true, providerId: id, recipient: to });
    }
    if (mode !== "broadcast") return NextResponse.json({ error: "Unsupported mode." }, { status: 400 });
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.EMAIL_PUBLIC_URL || (process.env.EMAIL_UNSUBSCRIBE_SECRET?.length ?? 0) < 32) {
      return NextResponse.json({ error: "Complete the email configuration before broadcasting." }, { status: 503 });
    }
    if (isTestSender(process.env.EMAIL_FROM)) return NextResponse.json({ error: "Broadcast requires a verified sending domain." }, { status: 409 });
    const { error } = await admin.rpc("enqueue_email_campaign", { p_campaign_key: campaignKey });
    if (error) throw new Error(`Email queue migration is required: ${error.message}`);
    return NextResponse.json({ campaignKey, ...await processEmailQueue(admin) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email service unavailable." }, { status: 503 });
  }
}
