import { describe, expect, it } from "vitest";
import { allowlistToastTitle, channelState, channelsVerdict, configuredRows } from "./channels";
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

describe("channelsVerdict", () => {
  const up = runtime([{ name: "gateway" }, { name: "channels" }, { name: "channel:telegram" }]);

  it("opens with unknown while nothing shown is current", () => {
    const v = channelsVerdict(["telegram"], up, true);
    expect(v.headline).toBe("Channel status unknown");
    expect(v.tone).toBe("warning");
  });

  it("invites the first connection when nothing is configured", () => {
    const v = channelsVerdict([], null, false);
    expect(v.headline).toBe("Not reachable on any channel");
    expect(v.detail).toMatch(/Connect Telegram/);
  });

  it("names where the agent is reachable", () => {
    expect(channelsVerdict(["telegram"], up, false)).toMatchObject({
      headline: "Reachable on Telegram",
      tone: "success",
      meta: "telegram running",
    });
    const two = runtime([
      { name: "channels" },
      { name: "channel:telegram" },
      { name: "channel:discord" },
    ]);
    expect(channelsVerdict(["telegram", "discord"], two, false).headline).toBe(
      "Reachable on Telegram and Discord",
    );
  });

  it("counts the webhook as reachable while the gateway answers", () => {
    // The gateway serves the webhook itself; if we can read /channels, it is up.
    const v = channelsVerdict(["webhook"], runtime([{ name: "gateway" }]), false);
    expect(v.headline).toBe("Reachable on Webhook");
  });

  it("opens with the failing channel", () => {
    const failed = runtime([
      { name: "channels" },
      { name: "channel:telegram", status: "error", lastError: "401" },
    ]);
    const v = channelsVerdict(["telegram"], failed, false);
    expect(v.headline).toBe("Telegram is failing");
    expect(v.tone).toBe("destructive");
    expect(v.detail).toBe("last error: 401");
  });

  it("says configured-but-not-running with the runtime-level cause", () => {
    const v = channelsVerdict(["telegram"], runtime([{ name: "gateway" }]), false);
    expect(v.headline).toBe("Telegram configured, not running");
    expect(v.tone).toBe("muted");
    expect(v.detail).toMatch(/runtime is not running/);
    expect(channelsVerdict(["telegram", "discord"], null, false).headline).toBe(
      "2 channels configured, not running",
    );
  });
});

describe("detail scope", () => {
  it("marks runtime-level details so the page says them once", () => {
    expect(channelState("telegram", ["telegram"], null, false).detailScope).toBe("runtime");
    expect(
      channelState("telegram", ["telegram"], runtime([{ name: "gateway" }]), false).detailScope,
    ).toBe("runtime");
    expect(
      channelState("discord", ["discord"], runtime([{ name: "channels" }]), false).detailScope,
    ).toBe("channel");
    expect(channelState("webhook", ["webhook"], null, false).detailScope).toBe("channel");
  });
});
