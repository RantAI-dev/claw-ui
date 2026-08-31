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

  it("caches a `true` within the TTL (one fetch)", async () => {
    // `true` holds for the full TTL; `false` is re-checked sooner (see below).
    const fetcher = vi.fn(info(true));
    const c = createAuthInfoCache(fetcher, 30_000);
    expect((await c.get(1000)).login_required).toBe(true);
    expect((await c.get(1000 + 29_000)).login_required).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    const fetcher = vi.fn(info(false));
    const c = createAuthInfoCache(fetcher, 30_000);
    await c.get(1000);
    await c.get(1000 + 31_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("re-checks a cached `false` much sooner than the full TTL", async () => {
    // If login is enabled mid-run, an ungated window opens until the cache
    // refreshes; a cached `false` is re-checked within ~3s, not 30s.
    const fetcher = vi.fn(info(false));
    const c = createAuthInfoCache(fetcher, 30_000);
    await c.get(1000);
    await c.get(1000 + 4_000); // past the 3s false-TTL
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("holds a cached `true` for the full TTL", async () => {
    const fetcher = vi.fn(info(true));
    const c = createAuthInfoCache(fetcher, 30_000);
    await c.get(1000);
    await c.get(1000 + 4_000); // well past 3s, but true holds for the full TTL
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("marks the fail-closed answer as unreachable so the cause can be named", async () => {
    const c = createAuthInfoCache(async () => {
      throw new Error("ECONNREFUSED");
    }, 30_000);
    const a = await c.get(1000);
    expect(a.login_required).toBe(true);
    expect(a.unreachable).toBe(true);
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
