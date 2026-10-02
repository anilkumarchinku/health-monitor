"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = {
  apiKeyConfigured: boolean;
  senderConfigured: boolean;
  testSender: boolean;
  testRecipientConfigured: boolean;
  publicUrlConfigured: boolean;
  trackingConfigured: boolean;
  databaseConfigured: boolean;
};

export default function AdminEmailPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const callApi = useCallback(async (method: "GET" | "POST", mode?: "test" | "broadcast") => {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!session) throw new Error("Sign in with an admin account first.");
    const response = await fetch("/api/admin/email", {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(mode ? { "Content-Type": "application/json" } : {}) },
      ...(mode ? { body: JSON.stringify({ mode }) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Email request failed.");
    return data;
  }, []);

  useEffect(() => {
    callApi("GET").then(setStatus).catch((error) => setResult(String(error)));
  }, [callApi]);

  async function send(mode: "test" | "broadcast") {
    if (mode === "broadcast" && !window.confirm("Send the back-live announcement to eligible users? This starts one campaign. The scheduler continues queued deliveries.")) return;
    setBusy(true);
    setResult("");
    try {
      const data = await callApi("POST", mode);
      setResult(mode === "test" ? `Test email accepted by Resend for ${data.recipient}. Provider ID: ${data.providerId}` : `Accepted this batch: ${data.accepted}. Failed this batch: ${data.failed}. Pending: ${data.pending ?? "processing"}. Needs review: ${data.review ?? 0}. ${data.deferred ? "Dispatcher is busy. Try again shortly." : data.mayHaveMore ? "The email scheduler will continue; you can also run again after 30 seconds." : "Queue checked."}`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Email request failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-2xl space-y-6 px-5 py-10">
    <Link href="/admin" className="text-sm underline">← Admin dashboard</Link>
    <div><h1 className="text-3xl font-semibold">Announcement email</h1><p className="mt-2 text-muted-foreground">Did you miss us? We are back live to help you stay healthy.</p></div>
    <section className="rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Setup</h2>
      {status ? <ul className="mt-3 space-y-1 text-sm">
        <li>Resend API key: {status.apiKeyConfigured ? "Ready" : "Missing"}</li>
        <li>Sender: {status.senderConfigured ? status.testSender ? "Testing only" : "Production address configured" : "Missing"}</li>
        <li>Test recipient: {status.testRecipientConfigured ? "Ready" : "Missing"}</li>
        <li>Public URL: {status.publicUrlConfigured ? "Ready" : "Missing"}</li>
        <li>Unsubscribe signing: {status.trackingConfigured ? "Ready" : "Missing"}</li>
        <li>Supabase email tables: {status.databaseConfigured ? "Ready" : "Migration pending"}</li>
      </ul> : <p className="mt-3 text-sm">Checking setup…</p>}
    </section>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy || !status?.apiKeyConfigured} onClick={() => send("test")} className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">Send test email</button>
      <button disabled={busy || !status?.apiKeyConfigured || !status.databaseConfigured || status.testSender} onClick={() => send("broadcast")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Send to eligible users</button>
    </div>
    {result && <p role="status" className="rounded-lg border p-3 text-sm">{result}</p>}
    <p className="text-sm text-muted-foreground">A test sender can only email your Resend account address. Verify your domain before sending to users. The campaign stores each recipient and retries temporary failures with the original request. Ambiguous or exhausted attempts require review in Resend. Accepted means the provider accepted the email; inbox delivery must be verified.</p>
  </main>;
}
