import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processEmailQueue } from "@/lib/email-queue";
import { isTestSender } from "@/lib/email-announcements";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || isTestSender(process.env.EMAIL_FROM) || (process.env.EMAIL_UNSUBSCRIBE_SECRET?.length ?? 0) < 32) return NextResponse.json({ error: "Production email configuration is incomplete." }, { status: 503 });
  try {
    // Only process recipients already explicitly queued by an administrator.
    const result = await processEmailQueue(createClient(url, key));
    return NextResponse.json(result, { status: result.failed ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email queue failed." }, { status: 503 });
  }
}
