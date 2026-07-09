import { NextRequest } from "next/server";
import { authEnabled, checkPassword, createSessionToken, sessionCookie } from "@/lib/auth";
import { loginGuard } from "@/lib/login-guard";

export const runtime = "nodejs";

// Best-effort client identity: first XFF hop, then X-Real-IP, else a shared
// "local" bucket (loopback). Absent forwarding headers => one global bucket,
// which is the conservative direction.
function clientKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
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

  const key = clientKey(req);
  const now = Date.now();

  const lockedFor = loginGuard.retryAfter(key, now);
  if (lockedFor > 0) return lockedResponse(lockedFor);

  let password = "";
  try {
    password = (await req.json())?.password ?? "";
  } catch {
    /* ignore malformed body */
  }

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
