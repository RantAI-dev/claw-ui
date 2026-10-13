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

describe("proxy and the container healthcheck", () => {
  // The probe sat behind both the login matcher and the gateway-unreachable
  // short-circuit, so an orchestrator restarted a healthy console forever.
  it("lets the health probe through while the gateway is down", async () => {
    vi.mocked(gatewayUnreachable).mockResolvedValueOnce(true);
    const res = await proxy(req("/api/health"));
    expect(res.status).not.toBe(502);
    expect(res.status).toBe(200);
  });

  it("lets the health probe through with login enabled", async () => {
    const { authEnabled } = await import("@/lib/auth");
    vi.mocked(authEnabled).mockResolvedValueOnce(true);
    const res = await proxy(req("/api/health"));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  it("still applies the unexpected-host gate to the health probe", async () => {
    // ...Once: `clearAllMocks` clears calls, not implementations, so a sticky
    // `mockReturnValue` here would leak into the next describe block.
    vi.mocked(isUnexpectedHost).mockReturnValueOnce(true);
    const res = await proxy(req("/api/health"));
    expect(res.status).toBe(403);
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

describe("proxy and signed-out sessions", () => {
  // The session store is the real module here, not a mock: the assertions are
  // about what the proxy does with a revocation that really was recorded.
  const LIVE = Date.now() + 60 * 60 * 1000;

  beforeEach(async () => {
    // Earlier describe blocks queue `...Once` values that the health route never
    // consumes (it returns before these calls), so start each case from a known
    // state rather than inherit those queues.
    const auth = await import("@/lib/auth");
    const authRequired = await import("@/lib/auth-required");
    vi.mocked(auth.authEnabled).mockReset().mockResolvedValue(false);
    vi.mocked(auth.readSessionToken).mockReset().mockResolvedValue(null);
    vi.mocked(auth.isIdleExpired).mockReset().mockReturnValue(false);
    vi.mocked(authRequired.gatewayUnreachable).mockReset().mockResolvedValue(false);
    vi.mocked(authRequired.idleTimeoutMs).mockReset().mockResolvedValue(0);
  });

  async function withLiveCookie(sid: string, iat = Date.now()) {
    const { authEnabled, readSessionToken } = await import("@/lib/auth");
    vi.mocked(authEnabled).mockResolvedValueOnce(true);
    vi.mocked(readSessionToken).mockResolvedValueOnce({ exp: LIVE, la: Date.now(), sid, iat });
  }

  it("refuses a revoked session on an API path with 401", async () => {
    const { revokeSession } = await import("@/lib/session-store");
    revokeSession("sid-revoked-api", LIVE);
    await withLiveCookie("sid-revoked-api");
    const res = await proxy(req("/api/rc/status"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("redirects a revoked session on a page to /login", async () => {
    const { revokeSession } = await import("@/lib/session-store");
    revokeSession("sid-revoked-page", LIVE);
    await withLiveCookie("sid-revoked-page");
    const res = await proxy(req("/chat"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("clears the cookie on a refused revoked session", async () => {
    const { revokeSession } = await import("@/lib/session-store");
    const { clearedCookie } = await import("@/lib/auth");
    vi.mocked(clearedCookie).mockReturnValueOnce("rc_session=; Max-Age=0");
    revokeSession("sid-revoked-clear", LIVE);
    await withLiveCookie("sid-revoked-clear");
    const res = await proxy(req("/api/rc/status"));
    expect(res.headers.get("set-cookie")).toBe("rc_session=; Max-Age=0");
  });

  it("refuses a session issued before the console started", async () => {
    await withLiveCookie("sid-pre-start", 0);
    const res = await proxy(req("/api/rc/status"));
    expect(res.status).toBe(401);
  });

  it("passes a live session that is not revoked and was issued after start", async () => {
    await withLiveCookie("sid-live");
    const res = await proxy(req("/api/rc/status"));
    expect(res.status).toBe(200);
  });

  it("revokes the session an idle timeout rejects", async () => {
    const { authEnabled, readSessionToken, isIdleExpired } = await import("@/lib/auth");
    const { idleTimeoutMs } = await import("@/lib/auth-required");
    const claims = { exp: LIVE, la: Date.now() - 2 * 60 * 60 * 1000, sid: "sid-idle", iat: Date.now() };
    vi.mocked(authEnabled).mockResolvedValueOnce(true);
    vi.mocked(readSessionToken).mockResolvedValueOnce(claims);
    vi.mocked(idleTimeoutMs).mockResolvedValueOnce(60_000);
    vi.mocked(isIdleExpired).mockReturnValueOnce(true);
    const first = await proxy(req("/api/rc/config"));
    expect(first.status).toBe(401);
    expect(await first.json()).toMatchObject({ reason: "idle" });

    // The same cookie, replayed after the idle rejection, is refused by sid.
    await withLiveCookie("sid-idle", claims.iat);
    const replay = await proxy(req("/api/rc/config"));
    expect(replay.status).toBe(401);
  });
});
