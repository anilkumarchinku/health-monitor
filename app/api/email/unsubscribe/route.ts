import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validUnsubscribeToken } from "@/lib/email-announcements";

export const runtime = "nodejs";
function validLink(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user") ?? "";
  const token = url.searchParams.get("token") ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) && validUnsubscribeToken(userId, token) ? userId : null;
}

export async function GET(request: Request) {
  if (!validLink(request)) return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  return new NextResponse('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body><main><h1>Health Monitor email preferences</h1><p>Stop announcement emails? Your health reminders will stay enabled.</p><form method="post"><button type="submit">Unsubscribe from announcements</button></form></main></body></html>', {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  });
}

export async function POST(request: Request) {
  const userId = validLink(request);
  if (!userId) return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new NextResponse("Email preferences unavailable. Please try again later.", { status: 503 });
  const { error } = await createClient(url, key).from("email_announcement_opt_outs").upsert({ user_id: userId });
  return new NextResponse(error ? "Email preferences unavailable. Please try again later." : "You have been unsubscribed from Health Monitor announcement emails.", {
    status: error ? 503 : 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
