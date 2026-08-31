import { describe, expect, it } from "vitest";
import { allowlistToastTitle, channelState, configuredRows } from "./channels";
import type { RuntimeHealth } from "./status";

function runtime(components: { name: string; status?: string; lastError?: string | null }[]): RuntimeHealth {
  return {
    pid: 1,
    uptimeSeconds: 10,
    updatedAt: null,
    components: components.map((c) => ({
      name: c.name,
      status: c.status ?? "ok",
      lastOk: null,
      lastError: c.lastError ?? null,
      restartCount: 0,
    })),
  };
}

describe("channelState", () => {
  const up = runtime([{ name: "gateway" }, { name: "channels" }, { name: "channel:telegram" }]);

  it("says unknown while the last fetch failed or the gateway is offline, whatever else is known", () => {
    expect(channelState("telegram", ["telegram"], up, true).label).toBe("Status unknown");
  });

  it("says not configured when the key has no config section", () => {
    expect(channelState("telegram", [], up, false).word).toBe("not configured");
    expect(channelState("telegram", null, up, false).word).toBe("not configured");
  });

  it("never claims a configured channel runs when the runtime cannot say", () => {
    // The old panel read `configured` as "connected". A gateway with no snapshot
    // and a gateway-only process (no `channels` component) both get the honest word.
    const noSnapshot = channelState("telegram", ["telegram"], null, false);
    expect(noSnapshot.label).toBe("Configured");
    expect(noSnapshot.detail).toMatch(/no runtime snapshot/);
    const gatewayOnly = channelState("telegram", ["telegram"], runtime([{ name: "gateway" }]), false);
    expect(gatewayOnly.label).toBe("Configured");
    expect(gatewayOnly.detail).toMatch(/runtime is not running/);
  });

  it("reads running and error off the channel's own component", () => {
    expect(channelState("telegram", ["telegram"], up, false)).toEqual({
      word: "running",
      label: "Running",
      tone: "success",
      detail: null,
    });
    const failed = runtime([
      { name: "channels" },
      { name: "channel:telegram", status: "error", lastError: "401 Unauthorized" },
    ]);
    const s = channelState("telegram", ["telegram"], failed, false);
    expect(s.tone).toBe("destructive");
    expect(s.detail).toBe("last error: 401 Unauthorized");
    const noMessage = runtime([{ name: "channels" }, { name: "channel:telegram", status: "starting" }]);
    expect(channelState("telegram", ["telegram"], noMessage, false).detail).toBe("status: starting");
  });

  it("says a channel has not started when the runtime is up without its component", () => {
    const s = channelState("discord", ["discord"], runtime([{ name: "channels" }]), false);
    expect(s.label).toBe("Configured");
    expect(s.detail).toMatch(/has not started/);
  });

  it("treats the webhook as served by the gateway, never as a runtime channel", () => {
    const s = channelState("webhook", ["webhook"], runtime([{ name: "gateway" }]), false);
    expect(s.label).toBe("Configured");
    expect(s.detail).toMatch(/gateway itself/);
  });
});

describe("configuredRows", () => {
  it("lists every configured key but Telegram, catalog order first, unknown keys last as-is", () => {
    const rows = configuredRows(["zzz", "webhook", "telegram", "discord"], null, false);
    expect(rows.map((r) => r.key)).toEqual(["discord", "webhook", "zzz"]);
    expect(rows.map((r) => r.label)).toEqual(["Discord", "Webhook", "zzz"]);
  });

  it("is empty before the list has loaded", () => {
    expect(configuredRows(null, null, false)).toEqual([]);
  });
});

describe("allowlistToastTitle", () => {
  it("counts senders in words and names what zero means", () => {
    expect(allowlistToastTitle(0)).toBe("Allowlist saved: no senders allowed; every message is denied");
    expect(allowlistToastTitle(1)).toBe("Allowlist saved: 1 sender allowed");
    expect(allowlistToastTitle(2)).toBe("Allowlist saved: 2 senders allowed");
  });
});
