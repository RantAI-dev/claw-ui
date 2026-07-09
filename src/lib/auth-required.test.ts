import { describe, it, expect, vi } from "vitest";
import { createAuthRequiredCache } from "./auth-required";

describe("auth-required (cached, fail-closed)", () => {
  it("reads login_required from the gateway", async () => {
    const fetcher = vi.fn(async () => ({ login_required: true }));
    const c = createAuthRequiredCache(fetcher, 30_000);
    expect(await c.isLoginRequired(1000)).toBe(true);
  });

  it("caches within the TTL (one fetch)", async () => {
    const fetcher = vi.fn(async () => ({ login_required: false }));
    const c = createAuthRequiredCache(fetcher, 30_000);
    expect(await c.isLoginRequired(1000)).toBe(false);
    expect(await c.isLoginRequired(1000 + 29_000)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    const fetcher = vi.fn(async () => ({ login_required: false }));
    const c = createAuthRequiredCache(fetcher, 30_000);
    await c.isLoginRequired(1000);
    await c.isLoginRequired(1000 + 31_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails CLOSED (required) when the gateway errors", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("down");
    });
    const c = createAuthRequiredCache(fetcher, 30_000);
    expect(await c.isLoginRequired(1000)).toBe(true);
  });
});
