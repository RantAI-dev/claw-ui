import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyLoginViaGateway } from "./gateway";

afterEach(() => vi.restoreAllMocks());

describe("verifyLoginViaGateway", () => {
  it("returns ok on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    expect(await verifyLoginViaGateway("op", "pw")).toEqual({ ok: true, status: 200 });
  });

  it("returns not-ok on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 401 })),
    );
    const r = await verifyLoginViaGateway("op", "bad");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it("surfaces 429 retry-after", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "42" } })),
    );
    const r = await verifyLoginViaGateway("op", "bad");
    expect(r.status).toBe(429);
    expect(r.retryAfter).toBe(42);
  });

  it("reads retry_after from the JSON body when there is no header", async () => {
    // The gateway sends the lockout duration in the body, not a header.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ retry_after: 73 }), { status: 429 })),
    );
    const r = await verifyLoginViaGateway("op", "bad");
    expect(r.status).toBe(429);
    expect(r.retryAfter).toBe(73);
  });

  it("maps a network error to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const r = await verifyLoginViaGateway("op", "pw");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
  });
});
