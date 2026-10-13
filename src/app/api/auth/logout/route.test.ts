import { describe, it, expect, beforeAll } from "vitest";
import { createSessionToken, readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { isSessionRevoked } from "@/lib/session-store";
import { POST } from "./route";

beforeAll(() => {
  process.env.RANTAICLAW_UI_SECRET = "test-secret-for-logout-route";
});

function logout(cookie?: string): Request {
  return new Request("http://localhost:3939/api/auth/logout", {
    method: "POST",
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
}

describe("POST /api/auth/logout", () => {
  it("revokes the presented session and clears the cookie", async () => {
    const tok = await createSessionToken();
    const claims = (await readSessionToken(tok))!;
    const res = await POST(logout(tok));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(isSessionRevoked(claims.sid)).toBe(true);
  });

  it("revokes nothing for a request with no cookie, and still clears", async () => {
    const res = await POST(logout());
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("revokes nothing for a forged cookie, and still clears", async () => {
    const tok = await createSessionToken();
    const [payload, sig] = tok.split(".");
    const forgedClaims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    // Keep the genuine signature but swap the session id: the payload no longer
    // verifies, so the sid it names must not be revoked.
    const forgedSid = "forged-sid-logout-test";
    const forgedPayload = btoa(JSON.stringify({ ...forgedClaims, sid: forgedSid }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await POST(logout(`${forgedPayload}.${sig}`));
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(isSessionRevoked(forgedSid)).toBe(false);
  });
});
