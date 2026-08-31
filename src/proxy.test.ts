import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the collaborators so the test isolates proxy.ts's own gate decisions.
vi.mock("@/lib/request-origin", () => ({
  isCrossSiteWrite: vi.fn(() => false),
  isUnexpectedHost: vi.fn(() => false),
  expectedHosts: vi.fn(() => []),
}));
vi.mock("@/lib/auth", () => ({
  authEnabled: vi.fn(async () => false), // login off — the default posture
  sessionSecretConfigured: vi.fn(() => true),
  clearedCookie: vi.fn(() => ""),
  isIdleExpired: vi.fn(() => false),
  readSessionToken: vi.fn(async () => null),
  refreshSessionToken: vi.fn(async () => ""),
  remainingMaxAgeSecs: vi.fn(() => 0),
  sessionCookie: vi.fn(() => ""),
  shouldRefreshActivity: vi.fn(() => false),
  SESSION_COOKIE: "rc_session",
}));
vi.mock("@/lib/auth-required", () => ({
  idleTimeoutMs: vi.fn(async () => 0),
  gatewayUnreachable: vi.fn(async () => false),
}));
vi.mock("@/lib/activity", () => ({
  isBackgroundPath: vi.fn(() => false),
  SESSION_EXPIRED: "session_expired",
}));

import proxy from "./proxy";
import { isUnexpectedHost } from "@/lib/request-origin";
import { gatewayUnreachable } from "@/lib/auth-required";

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost:3939${path}`, {
    headers: { host: "evil.test:3939" },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("proxy host gate", () => {
  it("gates /api/chat against an unexpected (rebound) Host", async () => {
    vi.mocked(isUnexpectedHost).mockReturnValue(true);
    const res = await proxy(req("/api/chat"));
    expect(res.status).toBe(403);
  });

  it("gates /api/rc/config against an unexpected Host", async () => {
    vi.mocked(isUnexpectedHost).mockReturnValue(true);
    const res = await proxy(req("/api/rc/config"));
    expect(res.status).toBe(403);
  });

  it("does not 403 the host gate when the Host is expected", async () => {
    vi.mocked(isUnexpectedHost).mockReturnValue(false);
    // login off (authEnabled=false) → the request passes through (not 403).
    const res = await proxy(req("/api/chat"));
    expect(res.status).not.toBe(403);
  });
});

describe("proxy while the gateway is unreachable", () => {
  // The login gate fails closed without a gateway; that used to read as a UI
  // misconfiguration (dev) or a login page (shipped). The cause is the gateway.
  it("answers API calls with 502 gateway_unreachable, not the login gate", async () => {
    vi.mocked(gatewayUnreachable).mockResolvedValueOnce(true);
    const res = await proxy(req("/api/rc/status"));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "gateway_unreachable" });
  });

  it("still serves the page shell so the offline banner can render", async () => {
    vi.mocked(gatewayUnreachable).mockResolvedValueOnce(true);
    const res = await proxy(req("/chat"));
    expect(res.status).toBe(200);
  });
});
