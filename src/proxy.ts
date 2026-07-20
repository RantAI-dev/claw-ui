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
import { isCrossSiteWrite } from "@/lib/request-origin";

// Gate every page and proxy route behind the session cookie when a password is
// configured. Static assets, the login page, and the auth endpoints stay open.
// (Next 16 "proxy" — the successor to the deprecated "middleware" convention.)
//
// The asset exemption is anchored to a single root-level segment on purpose. It
// used to be `.*\.(?:png|ico|svg|webmanifest)$`, which is unanchored and so
// exempted *any* path carrying one of those suffixes — API paths included. That
// let `/api/rc/status.svg` skip this file entirely: no session check, and the
// BFF still attached the gateway bearer token. Everything under `public/` is a
// root-level file, so `[^/]+\.ext$` covers the real assets and nothing else.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|[^/]+\\.(?:png|ico|svg|webmanifest)$).*)"],
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
  // Cross-site write rejection runs FIRST — ahead of the auth-enabled check —
  // because the BFF signs requests with the gateway token whether or not
  // console login is configured. With login off (the default), the console
  // would otherwise accept privileged writes from any page the operator has
  // open in another tab.
  const crossSite = isCrossSiteWrite(
    req.method,
    { secFetchSite: req.headers.get("sec-fetch-site"), origin: req.headers.get("origin") },
    req.nextUrl.origin,
  );
  if (crossSite) {
    return NextResponse.json({ error: "cross_site_request_blocked" }, { status: 403 });
  }

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
