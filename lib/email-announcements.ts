import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const campaignKey = "health-monitor-back-live-2026-09";
export const campaignSubject = "Did you miss us? Health Monitor is back";
export type EmailPayload = { from: string; to: string[]; subject: string; text: string; html: string; headers?: Record<string, string> };

export function isTestSender(from: string) {
  return /@resend\.dev\b/i.test(from);
}

export function makeUnsubscribeToken(userId: string) {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 32) throw new Error("EMAIL_UNSUBSCRIBE_SECRET must contain at least 32 characters.");
  return `v1.${createHmac("sha256", secret).update(`email-announcements:${userId}`).digest("hex")}`;
}

export function validUnsubscribeToken(userId: string, token: string) {
  if (!/^v1\.[0-9a-f]{64}$/.test(token)) return false;
  const signature = Buffer.from(token.slice(3), "hex");
  return [process.env.EMAIL_UNSUBSCRIBE_SECRET, process.env.EMAIL_UNSUBSCRIBE_PREVIOUS_SECRET]
    .filter((secret): secret is string => Boolean(secret && secret.length >= 32))
    .some((secret) => timingSafeEqual(createHmac("sha256", secret).update(`email-announcements:${userId}`).digest(), signature));
}

export function emailPublicUrl() {
  const url = new URL(process.env.EMAIL_PUBLIC_URL ?? "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("EMAIL_PUBLIC_URL must be a clean HTTPS app URL.");
  return url.href.replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function campaignContent(unsubscribeUrl?: string) {
  const message = "Did you miss us? We are back live to help you stay healthy. Open Health Monitor to pick up where you left off.";
  const appUrl = emailPublicUrl();
  const text = `${message}\n\nOpen the app: ${appUrl}${unsubscribeUrl ? `\n\nUnsubscribe from announcements: ${unsubscribeUrl}` : ""}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#17312d"><h1 style="font-size:24px">Health Monitor is back</h1><p>${message}</p><p><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:white;border-radius:8px;text-decoration:none">Open Health Monitor</a></p>${unsubscribeUrl ? `<p style="font-size:12px;color:#64748b"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from announcements</a></p>` : ""}</div>`;
  return { text, html };
}

export function buildEmailPayload(to: string, unsubscribeUrl?: string): EmailPayload {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is required.");
  return { from, to: [to], subject: campaignSubject, ...campaignContent(unsubscribeUrl), ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}) };
}

export class EmailSendError extends Error {
  constructor(message: string, public retryable: boolean, public retryAfterSeconds = 60) { super(message); }
}

export async function sendResendEmail(args: { payload: EmailPayload; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailSendError("RESEND_API_KEY is required.", false);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": args.idempotencyKey },
      body: JSON.stringify(args.payload), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
  } catch { throw new EmailSendError("Provider connection timed out or failed; retry with the same idempotency key.", true); }
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok || !result.id) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new EmailSendError(result.message ?? `Resend returned ${response.status}.`, response.status === 429 || response.status >= 500 || response.ok,
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(3600, retryAfter) : 60);
  }
  return result.id;
}
