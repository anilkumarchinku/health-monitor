import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PushBody = {
  endpoint?: string;
  subscription?: unknown;
};

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

  const body = (await request.json()) as PushBody;
  if (!body.endpoint || !body.subscription) {
    return NextResponse.json({ error: "Missing push subscription payload." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await adminClient.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      subscription: body.subscription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
