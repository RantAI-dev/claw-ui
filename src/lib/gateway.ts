// Server-side gateway client. Runs only in route handlers / server components.
// Holds the bearer token; never imported into client components.
import "server-only";

export const GATEWAY_URL = (process.env.RANTAICLAW_GATEWAY_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const TOKEN = process.env.RANTAICLAW_TOKEN || "";

export function gatewayHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (TOKEN) h["authorization"] = `Bearer ${TOKEN}`;
  return h;
}

/** Fetch a JSON endpoint from the gateway. Throws on non-2xx with the body text. */
export async function gatewayJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${GATEWAY_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: gatewayHeaders({
      "content-type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new GatewayError(res.status, text || res.statusText);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

/**
 * Verify console credentials against the gateway's **verify-only** `POST /login`.
 * The gateway returns 200 (ok) / 401 (wrong) / 404 (login disabled) / 429
 * (locked out). We surface only the outcome — no gateway token ever reaches the
 * browser (the BFF holds the bearer token server-side). Network failures map to
 * 502 so the caller treats them as "not verified".
 */
export async function verifyLoginViaGateway(
  username: string,
  password: string,
): Promise<{ ok: boolean; status: number; retryAfter?: number }> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_URL}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502 };
  }
  if (res.ok) return { ok: true, status: res.status };
  // The gateway sends the lockout duration in the JSON body (`retry_after`), not
  // a `Retry-After` header, so reading only the header always missed it and the
  // caller fell back to a hard-coded 5 minutes. Prefer the header when present,
  // then the body.
  let retryAfter: number | undefined;
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) {
    retryAfter = header;
  } else {
    try {
      const body = await res.json();
      const fromBody = Number(body?.retry_after);
      if (Number.isFinite(fromBody) && fromBody > 0) retryAfter = fromBody;
    } catch {
      /* non-JSON body — leave retryAfter undefined */
    }
  }
  return { ok: false, status: res.status, retryAfter };
}
