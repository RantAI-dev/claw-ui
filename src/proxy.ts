import { NextRequest, NextResponse } from "next/server";
import { authEnabled, sessionSecretConfigured, verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

// Gate every page and proxy route behind the session cookie when a password is
// configured. Static assets, the login page, and the auth endpoints stay open.
// (Next 16 "proxy" — the successor to the deprecated "middleware" convention.)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|.*\\.(?:png|ico|svg|webmanifest)$).*)"],
};

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
