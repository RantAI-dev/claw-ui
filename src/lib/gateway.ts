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
