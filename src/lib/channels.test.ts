import { describe, expect, it } from "vitest";
import {
  allowlistToastTitle,
  channelHasCredentials,
  channelLabel,
  channelMissingCredentials,
  channelState,
  channelSupport,
  channelVerification,
  channelsVerdict,
  configuredRows,
} from "./channels";
import type { RuntimeHealth } from "./status";
import type { ChannelCatalogEntry } from "./types";

/**
 * A stand-in for what `/api/v1/channels` sends, not a copy of the runtime's
 * catalog: the console no longer holds one, and a sixteen-row fixture here
 * would recreate the duplication this suite's subject exists to delete.
 *
 * Four rows, covering the three states an operator can meet plus an unknown
 * key. Telegram is supported and driven, Discord is supported and not driven,
 * and the two under-development rows are neither.
 */
const CATALOG: ChannelCatalogEntry[] = [
  {
    key: "telegram",
    label: "Telegram",
    support: "supported",
    maturity: "supported",
    verification: "driven",
    configured: true,
  },
  {
    key: "discord",
    label: "Discord",
    support: "supported",
    maturity: "supported",
    verification: "not_driven",
    configured: false,
  },
  {
    key: "webhook",
    label: "Webhook",
    support: "under_development",
    maturity: "under_development",
    verification: "not_driven",
    configured: false,
  },
  {
    key: "irc",
    label: "IRC",
    support: "under_development",
    maturity: "under_development",
    verification: "not_driven",
    configured: false,
  },
];

/**
 * What a runtime older than the two-axis split sends: `maturity` and no more.
 *
 * The `supported` row is Webhook rather than Discord because Discord now has
 * its own setup card and `configuredRows` filters it out — leaving it here
 * would have deleted this suite's only `maturity: "supported"` case without
 * anything going red.
 */
const LEGACY_CATALOG: ChannelCatalogEntry[] = [
  { key: "webhook", label: "Webhook", maturity: "supported", configured: false },
  { key: "irc", label: "IRC", maturity: "under_development", configured: false },
];

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
  it("lists every configured key but the ones with a card, catalog order first, unknown keys last as-is", () => {
    const rows = configuredRows(["zzz", "webhook", "telegram", "irc"], null, false, CATALOG);
    expect(rows.map((r) => r.key)).toEqual(["webhook", "irc", "zzz"]);
    expect(rows.map((r) => r.label)).toEqual(["Webhook", "IRC", "zzz"]);
  });

  it("leaves Discord and Slack to their own cards, as it already did for Telegram", () => {
    // A row and a card would both claim the channel, and only one of them can
    // connect or disconnect it. The rule is "has a setup card", not "is
    // Telegram" — which is what it used to be, back when Telegram was the only
    // channel the console could set up.
    const rows = configuredRows(["telegram", "discord", "slack", "irc"], null, false, CATALOG);
    expect(rows.map((r) => r.key)).toEqual(["irc"]);
  });

  it("leaves WhatsApp Web to its own card too", () => {
    // F-41: its card shipped in #121, after this list was last updated. It was
    // rendered both as a card and as a row here, with the row's controls unable
    // to do what the card does.
    const rows = configuredRows(
      ["telegram", "discord", "slack", "whatsapp_web", "irc"],
      null,
      false,
      CATALOG,
    );
    expect(rows.map((r) => r.key)).toEqual(["irc"]);
  });

  it("leaves Lark to its own card too", () => {
    // Plan 381: Lark is the fifth channel with a setup card. Same rule as
    // Discord, Slack and WhatsApp Web above.
    const rows = configuredRows(
      ["telegram", "discord", "slack", "whatsapp_web", "lark", "irc"],
      null,
      false,
      CATALOG,
    );
    expect(rows.map((r) => r.key)).toEqual(["irc"]);
  });

  it("is empty before the list has loaded", () => {
    expect(configuredRows(null, null, false, CATALOG)).toEqual([]);
  });

  it("carries both axes per row, and null for a key it does not know", () => {
    const rows = configuredRows(["telegram", "discord", "irc", "zzz"], null, false, CATALOG);
    expect(rows.map((r) => [r.key, r.support, r.verification])).toEqual([
      ["irc", "under_development", "not_driven"],
      ["zzz", null, null],
    ]);
  });

  it("reads `maturity` as support when the runtime predates the split", () => {
    // A console newer than its gateway. Support still renders; verification is
    // `null` rather than an invented "not_driven", because that runtime has no
    // opinion and claiming one would be inventing evidence.
    const rows = configuredRows(["webhook", "irc"], null, false, LEGACY_CATALOG);
    expect(rows.map((r) => [r.key, r.support, r.verification])).toEqual([
      ["webhook", "supported", null],
      ["irc", "under_development", null],
    ]);
  });

  it("degrades to keys when the gateway sends no catalog at all", () => {
    // A console newer than the gateway it is pointed at. The old failure mode
    // here was a second hard-coded list; the rows render by key instead.
    const rows = configuredRows(["webhook", "irc"], null, false, []);
    expect(rows.map((r) => r.label)).toEqual(["webhook", "irc"]);
    expect(rows.every((r) => r.support === null && r.verification === null)).toBe(true);
  });
});

describe("channelHasCredentials", () => {
  /** A catalog from a runtime that answers the question, both ways. */
  const WITH_ANSWER: ChannelCatalogEntry[] = [
    { key: "telegram", label: "Telegram", configured: true, has_credentials: true },
    { key: "discord", label: "Discord", configured: true, has_credentials: false },
  ];

  it("reports what the runtime said", () => {
    expect(channelHasCredentials("telegram", WITH_ANSWER)).toBe(true);
    expect(channelHasCredentials("discord", WITH_ANSWER)).toBe(false);
  });

  it("says null when the runtime has no opinion, which is not the same as false", () => {
    // A gateway older than the field, and a key the catalog does not carry.
    // Rendering either as "the token is missing" would be inventing evidence
    // about a channel the console cannot see — the same mistake the
    // verification axis already refuses to make.
    expect(channelHasCredentials("telegram", CATALOG)).toBeNull();
    expect(channelHasCredentials("zzz", WITH_ANSWER)).toBeNull();
  });
});

describe("channelMissingCredentials", () => {
  const WITH_ANSWER: ChannelCatalogEntry[] = [
    { key: "discord", label: "Discord", configured: true, has_credentials: false },
    { key: "slack", label: "Slack", configured: true, has_credentials: true },
  ];

  it("is true only for a configured channel the runtime says has no credential", () => {
    // The state this exists for: a `[channels_config.discord]` section written
    // by hand with the token left out reads as connected on every surface the
    // console has, and the channel never starts.
    expect(channelMissingCredentials("discord", ["discord"], WITH_ANSWER)).toBe(true);
    expect(channelMissingCredentials("slack", ["slack"], WITH_ANSWER)).toBe(false);
  });

  it("is false for a channel that is not configured at all", () => {
    // Nothing is missing before anything was set up; the card offers the
    // connect form for its own reason, and must not also accuse the operator.
    expect(channelMissingCredentials("discord", [], WITH_ANSWER)).toBe(false);
    expect(channelMissingCredentials("discord", null, WITH_ANSWER)).toBe(false);
  });

  it("is false when the runtime has no opinion", () => {
    expect(channelMissingCredentials("telegram", ["telegram"], CATALOG)).toBe(false);
  });
});

describe("channelLabel / channelSupport / channelVerification", () => {
  it("reads all three off the catalog the runtime sent", () => {
    expect(channelLabel("webhook", CATALOG)).toBe("Webhook");
    expect(channelSupport("webhook", CATALOG)).toBe("under_development");
    expect(channelSupport("telegram", CATALOG)).toBe("supported");
    expect(channelVerification("telegram", CATALOG)).toBe("driven");
    expect(channelVerification("discord", CATALOG)).toBe("not_driven");
  });

  it("keeps the two axes independent", () => {
    // The state the split exists for. Reading one from the other is the bug.
    expect(channelSupport("discord", CATALOG)).toBe("supported");
    expect(channelVerification("discord", CATALOG)).toBe("not_driven");
  });

  it("renders an unknown key as the key, and refuses to guess either axis", () => {
    expect(channelLabel("zzz", CATALOG)).toBe("zzz");
    expect(channelSupport("zzz", CATALOG)).toBeNull();
    expect(channelVerification("zzz", CATALOG)).toBeNull();
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
    const v = channelsVerdict(["telegram"], up, true, CATALOG);
    expect(v.headline).toBe("Channel status unknown");
    expect(v.tone).toBe("warning");
  });

  it("invites the first connection when nothing is configured", () => {
    const v = channelsVerdict([], null, false, CATALOG);
    expect(v.headline).toBe("Not reachable on any channel");
    expect(v.detail).toMatch(/Connect Telegram/);
  });

  it("names where the agent is reachable", () => {
    expect(channelsVerdict(["telegram"], up, false, CATALOG)).toMatchObject({
      headline: "Reachable on Telegram",
      tone: "success",
      meta: "telegram running",
    });
    const two = runtime([
      { name: "channels" },
      { name: "channel:telegram" },
      { name: "channel:discord" },
    ]);
    expect(channelsVerdict(["telegram", "discord"], two, false, CATALOG).headline).toBe(
      "Reachable on Telegram and Discord",
    );
  });

  it("counts the webhook as reachable while the gateway answers", () => {
    // The gateway serves the webhook itself; if we can read /channels, it is up.
    const v = channelsVerdict(["webhook"], runtime([{ name: "gateway" }]), false, CATALOG);
    expect(v.headline).toBe("Reachable on Webhook");
  });

  it("opens with the failing channel", () => {
    const failed = runtime([
      { name: "channels" },
      { name: "channel:telegram", status: "error", lastError: "401" },
    ]);
    const v = channelsVerdict(["telegram"], failed, false, CATALOG);
    expect(v.headline).toBe("Telegram is failing");
    expect(v.tone).toBe("destructive");
    expect(v.detail).toBe("last error: 401");
  });

  it("says configured-but-not-running with the runtime-level cause", () => {
    const v = channelsVerdict(["telegram"], runtime([{ name: "gateway" }]), false, CATALOG);
    expect(v.headline).toBe("Telegram configured, not running");
    expect(v.tone).toBe("muted");
    expect(v.detail).toMatch(/runtime is not running/);
    expect(channelsVerdict(["telegram", "discord"], null, false, CATALOG).headline).toBe(
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
