import { NextRequest, NextResponse } from "next/server";
import { authEnabled, sessionSecretConfigured, verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
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

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}
