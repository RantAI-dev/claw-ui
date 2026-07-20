import { describe, it, expect, vi } from "vitest";
import { createAuthInfoCache } from "./auth-required";

const info = (login_required: boolean, idle_timeout_secs = 0) => async () => ({
  login_required,
  idle_timeout_secs,
});

describe("auth-info cache", () => {
  it("reads login_required from the gateway", async () => {
    const c = createAuthInfoCache(vi.fn(info(true)), 30_000);
    expect((await c.get(1000)).login_required).toBe(true);
  });

  it("reads idle_timeout_secs from the gateway", async () => {
    const c = createAuthInfoCache(vi.fn(info(true, 900)), 30_000);
    expect((await c.get(1000)).idle_timeout_secs).toBe(900);
  });

  it("caches within the TTL (one fetch)", async () => {
    const fetcher = vi.fn(info(false));
    const c = createAuthInfoCache(fetcher, 30_000);
    expect((await c.get(1000)).login_required).toBe(false);
    expect((await c.get(1000 + 29_000)).login_required).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    const fetcher = vi.fn(info(false));
    const c = createAuthInfoCache(fetcher, 30_000);
    await c.get(1000);
    await c.get(1000 + 31_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails CLOSED on login_required when the gateway errors", async () => {
    const c = createAuthInfoCache(
      vi.fn(async () => {
        throw new Error("down");
      }),
      30_000,
    );
    expect((await c.get(1000)).login_required).toBe(true);
  });

  it("reports no idle window when the gateway errors, rather than guessing one", async () => {
    // A transient gateway blip must not log every operator out. The gate above
    // stays on and the absolute cap still applies.
    const c = createAuthInfoCache(
      vi.fn(async () => {
        throw new Error("down");
      }),
      30_000,
    );
    expect((await c.get(1000)).idle_timeout_secs).toBe(0);
  });

  it("coerces a missing or malformed idle_timeout_secs to 0", async () => {
    const c = createAuthInfoCache(
      // An older gateway predates the field entirely.
      vi.fn(async () => ({ login_required: true }) as never),
      30_000,
    );
    expect((await c.get(1000)).idle_timeout_secs).toBe(0);
  });
});
