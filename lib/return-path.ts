const allowed = new Set(["/", "/meals", "/meal/lunch", "/medicines", "/morning", "/history", "/profile", "/notifications", "/admin", "/admin/email"]);

/** Only app destinations can be used after authentication. */
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://health.invalid");
    if (url.origin !== "https://health.invalid" || !allowed.has(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}

export function signInDestination() {
  if (typeof window === "undefined") return "/";
  return safeReturnPath(new URLSearchParams(window.location.search).get("next"));
}
