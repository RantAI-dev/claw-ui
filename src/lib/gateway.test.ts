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
