import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Reminder service unavailable." }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in to snooze." }, { status: 401 });
  const db = createClient(url, key);
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Sign in to snooze." }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || !["breakfast", "lunch", "dinner"].includes(body.mealType) || !Number.isInteger(body.delayMinutes) || body.delayMinutes < 1 || body.delayMinutes > 180) {
    return NextResponse.json({ error: "Choose a meal and a delay from 1 to 180 minutes." }, { status: 400 });
  }
  const { count, error: deviceError } = await db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (deviceError || !count) return NextResponse.json({ error: "Enable push notifications before snoozing." }, { status: 409 });
  const dueAt = new Date(Date.now() + body.delayMinutes * 60_000).toISOString();
  const { error: saveError } = await db.from("reminder_snoozes").upsert({ user_id: user.id, meal_type: body.mealType, due_at: dueAt }, { onConflict: "user_id,meal_type" });
  if (saveError) return NextResponse.json({ error: "Could not save your snooze. Please retry." }, { status: 503 });
  return NextResponse.json({ ok: true, dueAt });
}
