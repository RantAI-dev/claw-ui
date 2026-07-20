import { NextRequest } from "next/server";
import { authEnabled, createSessionToken, sessionCookie, sessionSecretConfigured } from "@/lib/auth";
import { verifyLoginViaGateway } from "@/lib/gateway";
import { loginGuard } from "@/lib/login-guard";

export const runtime = "nodejs";

// Honor forwarding headers only behind an explicitly trusted proxy. Otherwise
// every direct client shares one global bucket — the fail-safe default, since a
// directly-reachable client can forge X-Forwarded-For and mint unlimited fresh
// keys. Mirrors the Rust gateway's `trust_forwarded_headers = false` default.
function trustProxy(): boolean {
  const v = process.env.RANTAICLAW_UI_TRUST_PROXY;
  return v === "1" || v === "true";
}

export function clientKeyFromHeaders(
  xff: string | null,
  realIp: string | null,
  trusted: boolean,
): string {
  if (!trusted) return "global";
  if (xff) {
    // Take the RIGHTMOST entry, not the leftmost.
    //
    // A correctly configured reverse proxy *appends* the peer it saw
    // (nginx's `proxy_add_x_forwarded_for`, Caddy, Traefik), so the last
    // element is the one our trusted proxy wrote and the earlier ones are
    // whatever the client sent. Keying on the leftmost let a client defeat the
    // lockout entirely by rotating a header value it controls — and grow the
    // guard's map with a fresh key per attempt.
    //
    // The comment above about forged XFF anticipated a *direct* client; it
    // missed that the header is equally forgeable through a proxy that is
    // behaving correctly.
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return realIp ?? "global";
}

function clientKey(req: NextRequest): string {
  return clientKeyFromHeaders(
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
    trustProxy(),
  );
}

function lockedResponse(retryAfterSecs: number): Response {
  return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSecs),
    },
  });
}

// Verify username + password against the RantaiClaw gateway (the single source
// of truth) and, on success, mint the local `rc_session` cookie. The gateway
// bearer token never reaches the browser — this is a pure verification call.
export async function POST(req: NextRequest) {
  if (!(await authEnabled())) return Response.json({ ok: true, authDisabled: true });
  // Never mint a session signed with the forgeable dev fallback.
  if (!sessionSecretConfigured()) {
    return Response.json(
      { error: "Server misconfigured: RANTAICLAW_UI_SECRET is not set." },
      { status: 503 },
    );
  }

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = body?.username ?? "";
    password = body?.password ?? "";
  } catch {
    /* ignore malformed body */
  }

  const key = clientKey(req);
  const now = Date.now();

  // UI-layer lockout first (sees the client IP when trusted).
  const lockedFor = loginGuard.retryAfter(key, now);
  if (lockedFor > 0) return lockedResponse(lockedFor);

  const result = await verifyLoginViaGateway(username, password);

  // The gateway's own lockout tripped (coarse, keyed on the UI server IP).
  if (result.status === 429) return lockedResponse(result.retryAfter ?? 300);

  if (!result.ok) {
    const retry = loginGuard.recordFailure(key, now);
    if (retry > 0) return lockedResponse(retry);
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  loginGuard.clearAttempts(key);
  const token = await createSessionToken();
  // The standalone server serves plain HTTP directly; HTTPS only reaches it
  // behind a trusted reverse proxy (which sets x-forwarded-proto). Only mark the
  // session cookie Secure when the request is actually HTTPS — otherwise the
  // browser drops it over http:// (e.g. the console opened at a LAN IP) and login
  // silently fails to persist.
  const secureCookie = trustProxy() && req.headers.get("x-forwarded-proto") === "https";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionCookie(token, secureCookie),
    },
  });
}
