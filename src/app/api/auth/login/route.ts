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

function clientKey(req: NextRequest): string {
  if (!trustProxy()) return "global";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "global";
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
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(token) },
  });
}
