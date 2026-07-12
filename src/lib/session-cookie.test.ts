import { describe, it, expect } from "vitest";
import { sessionCookie } from "./auth";

describe("sessionCookie Secure flag", () => {
  it("omits Secure when the request is not HTTPS (so the cookie persists over http:// on a LAN)", () => {
    const c = sessionCookie("tok", false);
    expect(c).not.toContain("Secure");
    expect(c).toContain("rc_session=tok");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
  });

  it("sets Secure when the request is HTTPS", () => {
    expect(sessionCookie("tok", true)).toContain("; Secure;");
  });
});
