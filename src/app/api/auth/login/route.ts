import { NextRequest } from "next/server";
import { authEnabled, checkPassword, createSessionToken, sessionCookie } from "@/lib/auth";
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

export async function POST(req: NextRequest) {
  if (!authEnabled()) return Response.json({ ok: true, authDisabled: true });

  // Parse the body first so the lock check and failure recording run as one
  // synchronous section — no await between retryAfter, checkPassword, and
  // recordFailure, so concurrent requests can't slip past the 5-attempt bound.
  let password = "";
  try {
    password = (await req.json())?.password ?? "";
  } catch {
    /* ignore malformed body */
  }

  const key = clientKey(req);
  const now = Date.now();

  const lockedFor = loginGuard.retryAfter(key, now);
  if (lockedFor > 0) return lockedResponse(lockedFor);

  if (!checkPassword(password)) {
    const retry = loginGuard.recordFailure(key, now);
    if (retry > 0) return lockedResponse(retry);
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }

  loginGuard.clearAttempts(key);
  const token = await createSessionToken();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(token) },
  });
}
