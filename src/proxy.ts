import { NextRequest, NextResponse } from "next/server";
import {
  authEnabled,
  clearedCookie,
  isIdleExpired,
  readSessionToken,
  refreshSessionToken,
  remainingMaxAgeSecs,
  sessionCookie,
  sessionSecretConfigured,
  shouldRefreshActivity,
  SESSION_COOKIE,
} from "@/lib/auth";
import { idleTimeoutMs } from "@/lib/auth-required";
import { isBackgroundPath, SESSION_EXPIRED } from "@/lib/activity";

// Gate every page and proxy route behind the session cookie when a password is
// configured. Static assets, the login page, and the auth endpoints stay open.
// (Next 16 "proxy" — the successor to the deprecated "middleware" convention.)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|.*\\.(?:png|ico|svg|webmanifest)$).*)"],
};

// Only mark the refreshed cookie Secure when the request is actually HTTPS, and
// only trust the forwarded header behind an explicitly trusted proxy. Mirrors
// the login route — see the comment there for why NODE_ENV is the wrong signal.
function secureCookie(req: NextRequest): boolean {
  const trusted =
    process.env.RANTAICLAW_UI_TRUST_PROXY === "1" ||
    process.env.RANTAICLAW_UI_TRUST_PROXY === "true";
  return trusted && req.headers.get("x-forwarded-proto") === "https";
}

export default async function proxy(req: NextRequest) {
  if (!(await authEnabled())) return NextResponse.next();

  // Login is enabled but no real cookie secret is set → the gate is
  // untrustworthy (the dev fallback is forgeable). Fail closed with a clear
  // error rather than serve a bypassable session. `rantaiclaw ui start`
  // generates a secret automatically; other launchers must set RANTAICLAW_UI_SECRET.
  if (!sessionSecretConfigured()) {
    return NextResponse.json(
      { error: "Server misconfigured: RANTAICLAW_UI_SECRET is not set." },
      { status: 503 },
    );
  }

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const now = Date.now();
  const claims = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value, now);
  if (!claims) return denied(req, pathname, "unauthorized");

  // Idle window. Measured against `la`, which only activity-bearing requests
  // move — a background poll keeps the console's connection badge fresh without
  // making an empty desk look occupied.
  const idleMs = await idleTimeoutMs(now);
  if (isIdleExpired(claims, idleMs, now)) {
    const res = denied(req, pathname, "idle");
    res.headers.set("set-cookie", clearedCookie());
    return res;
  }

  const res = NextResponse.next();
  if (!isBackgroundPath(pathname) && shouldRefreshActivity(claims, now, idleMs)) {
    // Slide `la` forward. `exp` rides along untouched inside
    // `refreshSessionToken`, so activity can never extend the absolute cap.
    res.headers.set(
      "set-cookie",
      sessionCookie(
        await refreshSessionToken(claims, now),
        secureCookie(req),
        remainingMaxAgeSecs(claims, now),
      ),
    );
  }
  return res;
}

/**
 * Turn a rejection into the right shape for the caller: JSON for API routes
 * (the client distinguishes an idle timeout from a plain 401 by `reason`), a
 * redirect back to the login page for navigations.
 */
function denied(req: NextRequest, pathname: string, reason: "unauthorized" | "idle") {
  if (pathname.startsWith("/api/")) {
    const error = reason === "idle" ? SESSION_EXPIRED : "unauthorized";
    return NextResponse.json({ error, reason }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const params = new URLSearchParams();
  if (pathname && pathname !== "/") params.set("next", pathname);
  if (reason === "idle") params.set("reason", "idle");
  url.search = params.toString() ? `?${params}` : "";
  return NextResponse.redirect(url);
}
