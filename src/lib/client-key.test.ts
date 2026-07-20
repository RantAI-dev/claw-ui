import { describe, it, expect } from "vitest";
import { clientKeyFromHeaders } from "@/app/api/auth/login/route";

describe("login lockout client key", () => {
  it("shares one bucket when no proxy is trusted", () => {
    // Fail-safe default: a directly reachable client can forge any header, so
    // per-key buckets would just hand it unlimited attempts.
    expect(clientKeyFromHeaders("1.2.3.4", "5.6.7.8", false)).toBe("global");
  });

  it("takes the rightmost X-Forwarded-For entry", () => {
    // nginx `proxy_add_x_forwarded_for` APPENDS the peer it saw, so the last
    // element is the one the trusted proxy wrote.
    expect(clientKeyFromHeaders("9.9.9.9, 203.0.113.7", null, true)).toBe("203.0.113.7");
  });

  it("cannot be rotated by a client-supplied prefix", () => {
    // Same real client, different forged prefixes — must land in one bucket,
    // or the lockout is defeated by varying a header the client controls.
    const a = clientKeyFromHeaders("evil-1, 203.0.113.7", null, true);
    const b = clientKeyFromHeaders("evil-2, 203.0.113.7", null, true);
    const c = clientKeyFromHeaders("evil-3, evil-4, 203.0.113.7", null, true);
    expect(new Set([a, b, c]).size).toBe(1);
    expect(a).toBe("203.0.113.7");
  });

  it("handles a single entry and stray whitespace", () => {
    expect(clientKeyFromHeaders("  203.0.113.7  ", null, true)).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then to the shared bucket", () => {
    expect(clientKeyFromHeaders(null, "203.0.113.9", true)).toBe("203.0.113.9");
    expect(clientKeyFromHeaders(null, null, true)).toBe("global");
    expect(clientKeyFromHeaders("   ,  ", "203.0.113.9", true)).toBe("203.0.113.9");
  });
});
