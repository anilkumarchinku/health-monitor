import webpush from "web-push";

/** Validate every send, including legacy database rows, before network access. */
export function validatePushSubscription(value: unknown): webpush.PushSubscription {
  if (!value || typeof value !== "object") throw new Error("Invalid push subscription.");
  const input = value as Record<string, unknown>;
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) throw new Error("Invalid push endpoint.");
  const url = new URL(input.endpoint);
  const host = url.hostname.toLowerCase();
  const supported = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (url.protocol !== "https:" || !supported || (url.port && url.port !== "443") || url.username || url.password || url.hash) {
    throw new Error("Unsupported push endpoint.");
  }
  const keys = input.keys as Record<string, unknown> | undefined;
  for (const [key, length] of [["p256dh", 65], ["auth", 16]] as const) {
    const encoded = keys?.[key];
    if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded) || Buffer.from(encoded, "base64url").length !== length) {
      throw new Error("Invalid push encryption keys.");
    }
  }
  const publicKey = Buffer.from(keys!.p256dh as string, "base64url");
  if (publicKey[0] !== 4) throw new Error("Invalid push encryption key.");
  return { endpoint: input.endpoint, keys: { p256dh: keys!.p256dh as string, auth: keys!.auth as string } };
}

export function sendSafePushNotification(subscription: unknown, payload: string) {
  return webpush.sendNotification(validatePushSubscription(subscription), payload, { timeout: 10000, TTL: 3600 });
}
