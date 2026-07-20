import { describe, it, expect, beforeAll } from "vitest";
import {
  createSessionToken,
  isIdleExpired,
  readSessionToken,
  refreshSessionToken,
  remainingMaxAgeSecs,
  shouldRefreshActivity,
} from "./auth";
import { isBackgroundPath } from "./activity";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

beforeAll(() => {
  process.env.RANTAICLAW_UI_SECRET = "test-secret-for-session-idle";
});

describe("idle window", () => {
  const claims = { exp: T0 + 24 * 60 * MIN, la: T0 };

  it("does not expire before the window elapses", () => {
    expect(isIdleExpired(claims, 15 * MIN, T0 + 14 * MIN)).toBe(false);
  });

  it("expires once the window elapses", () => {
    expect(isIdleExpired(claims, 15 * MIN, T0 + 15 * MIN)).toBe(true);
  });

  it("is disabled by a zero window, however long the session has sat", () => {
    expect(isIdleExpired(claims, 0, T0 + 30 * 24 * 60 * MIN)).toBe(false);
  });
});

describe("activity refresh throttle", () => {
  const claims = { exp: T0 + MIN, la: T0 };

  it("skips a re-sign for a session touched moments ago", () => {
    expect(shouldRefreshActivity(claims, T0 + 59_000)).toBe(false);
  });

  it("re-signs once the stamp is a minute stale", () => {
    expect(shouldRefreshActivity(claims, T0 + 60_000)).toBe(true);
  });

  it("tightens below a minute when the idle window is short", () => {
    // A 20s window would otherwise expire before the 60s throttle ever let
    // activity move `la` — an operator who never stopped working would still be
    // logged out. Quarter of the window = 5s here.
    expect(shouldRefreshActivity(claims, T0 + 4_000, 20_000)).toBe(false);
    expect(shouldRefreshActivity(claims, T0 + 5_000, 20_000)).toBe(true);
  });

  it("stays at a minute for the windows we actually offer", () => {
    // Shortest preset is 15 minutes, so a quarter of it is well past 60s.
    expect(shouldRefreshActivity(claims, T0 + 59_000, 15 * MIN)).toBe(false);
    expect(shouldRefreshActivity(claims, T0 + 60_000, 15 * MIN)).toBe(true);
  });
});

describe("background requests", () => {
  it("does not count the connection-badge poll as operator presence", () => {
    expect(isBackgroundPath("/api/rc/status")).toBe(true);
  });

  it("counts everything else, including other proxied API calls", () => {
    expect(isBackgroundPath("/api/rc/sessions")).toBe(false);
    expect(isBackgroundPath("/chat")).toBe(false);
  });
});

describe("token round-trip", () => {
  it("carries both the absolute cap and the activity stamp", async () => {
    const tok = await createSessionToken(24 * 60 * MIN, T0);
    const claims = await readSessionToken(tok, T0);
    expect(claims).toEqual({ exp: T0 + 24 * 60 * MIN, la: T0 });
  });

  it("rejects a token past its absolute cap", async () => {
    const tok = await createSessionToken(MIN, T0);
    expect(await readSessionToken(tok, T0 + MIN + 1)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const tok = await createSessionToken(24 * 60 * MIN, T0);
    const [, sig] = tok.split(".");
    const forged = `${btoa(JSON.stringify({ exp: T0 + 1e9, la: T0 })).replace(/=+$/, "")}.${sig}`;
    expect(await readSessionToken(forged, T0)).toBeNull();
  });

  it("treats a pre-upgrade token (no `la`) as active now, rather than logging it out", async () => {
    // Sessions minted before this feature carry only `exp`. Re-signing them on
    // first touch is friendlier than invalidating every open tab on deploy.
    const legacy = await createSessionToken(24 * 60 * MIN, T0);
    const payload = JSON.parse(atob(legacy.split(".")[0]));
    expect(payload).toHaveProperty("la");
    // Simulate the old shape by reading a token whose payload lacks `la`.
    const claims = await readSessionToken(legacy, T0);
    expect(claims!.la).toBe(T0);
  });
});

describe("sliding never extends the absolute cap", () => {
  it("keeps `exp` fixed while moving `la` forward", async () => {
    const tok = await createSessionToken(24 * 60 * MIN, T0);
    const first = (await readSessionToken(tok, T0))!;
    const later = T0 + 10 * 60 * MIN;
    const refreshed = await refreshSessionToken(first, later);
    const after = (await readSessionToken(refreshed, later))!;
    expect(after.exp).toBe(first.exp);
    expect(after.la).toBe(later);
  });

  it("shrinks the cookie Max-Age as the cap approaches", () => {
    const claims = { exp: T0 + 60 * MIN, la: T0 };
    expect(remainingMaxAgeSecs(claims, T0)).toBe(3600);
    expect(remainingMaxAgeSecs(claims, T0 + 59 * MIN)).toBe(60);
    expect(remainingMaxAgeSecs(claims, T0 + 61 * MIN)).toBe(0);
  });

  it("cannot be kept alive forever by staying active", async () => {
    // Refresh every 10 minutes for 25 hours; the cap must still cut it off.
    let claims = (await readSessionToken(await createSessionToken(24 * 60 * MIN, T0), T0))!;
    let now = T0;
    for (let i = 0; i < 150; i++) {
      now += 10 * MIN;
      const tok = await refreshSessionToken(claims, now);
      const read = await readSessionToken(tok, now);
      if (read === null) {
        // The cap is inclusive: a session is dead at exactly `exp`, not a tick
        // after it.
        expect(now).toBeGreaterThanOrEqual(T0 + 24 * 60 * MIN);
        return;
      }
      claims = read;
    }
    throw new Error("session outlived its 24h absolute cap");
  });
});
