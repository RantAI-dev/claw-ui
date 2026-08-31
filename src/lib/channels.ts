import type { RuntimeHealth } from "./status";

/**
 * The runtime's channel catalog, in its order (RantAIClaw `src/channels/mod.rs`,
 * `CHANNEL_CATALOG`). Labels are the console's. A key the runtime reports that is
 * missing here still renders, as the key.
 */
export const CHANNEL_CATALOG: { key: string; label: string }[] = [
  { key: "telegram", label: "Telegram" },
  { key: "discord", label: "Discord" },
  { key: "slack", label: "Slack" },
  { key: "mattermost", label: "Mattermost" },
  { key: "webhook", label: "Webhook" },
  { key: "imessage", label: "iMessage" },
  { key: "matrix", label: "Matrix" },
  { key: "signal", label: "Signal" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "linq", label: "Linq (SMS/RCS)" },
  { key: "nextcloud_talk", label: "Nextcloud Talk" },
  { key: "email", label: "Email" },
  { key: "irc", label: "IRC" },
  { key: "lark", label: "Lark / Feishu" },
  { key: "dingtalk", label: "DingTalk" },
  { key: "qq", label: "QQ" },
];

export function channelLabel(key: string): string {
  return CHANNEL_CATALOG.find((c) => c.key === key)?.label ?? key;
}

export type ChannelWord = "running" | "error" | "configured" | "not configured" | "unknown";

export interface ChannelState {
  word: ChannelWord;
  /** Sentence-case badge text. */
  label: string;
  tone: "success" | "destructive" | "outline";
  /** One line under the badge, when the word alone would mislead. */
  detail: string | null;
}

const RUNTIME_DOWN =
  "The channels runtime is not running; start rantaiclaw daemon to bring it up.";
const NO_SNAPSHOT =
  "This gateway sent no runtime snapshot, so whether the channel is running is unknown.";
const NOT_STARTED =
  "The channels runtime is up but this channel has not started; check its credentials in config.toml.";

function configuredWith(detail: string): ChannelState {
  return { word: "configured", label: "Configured", tone: "outline", detail };
}

/**
 * What one channel is doing, from the two facts the gateway sends.
 *
 * `/channels.configured` only says a config section exists
 * (`channel_is_configured` is `channels_config.<key>.is_some()`), so it can never
 * mean "running". Whether the channel runs is in `/status.runtime.components`:
 * the supervisor registers `channels` while the runtime is up and
 * `channel:<key>` per started channel, with its status and last error. A bare
 * `rantaiclaw gateway` has neither. The webhook is served by the gateway itself
 * and never gets a component.
 */
export function channelState(
  key: string,
  configured: string[] | null,
  runtime: RuntimeHealth | null,
  stale: boolean,
): ChannelState {
  if (stale) return { word: "unknown", label: "Status unknown", tone: "outline", detail: null };
  if (!configured?.includes(key)) {
    return { word: "not configured", label: "Not configured", tone: "outline", detail: null };
  }
  if (key === "webhook") return configuredWith("Served by the gateway itself.");
  if (!runtime) return configuredWith(NO_SNAPSHOT);
  const byName = new Map(runtime.components.map((c) => [c.name, c]));
  if (!byName.has("channels")) return configuredWith(RUNTIME_DOWN);
  const own = byName.get(`channel:${key}`);
  if (!own) return configuredWith(NOT_STARTED);
  if (own.status.toLowerCase() === "ok") {
    return { word: "running", label: "Running", tone: "success", detail: null };
  }
  return {
    word: "error",
    label: "Error",
    tone: "destructive",
    detail: own.lastError ? `last error: ${own.lastError}` : `status: ${own.status}`,
  };
}

export interface ChannelRow {
  key: string;
  label: string;
  state: ChannelState;
}

/**
 * Every configured channel except Telegram (which has its own card), catalog
 * order first, keys the console does not know after, in the order reported.
 */
export function configuredRows(
  configured: string[] | null,
  runtime: RuntimeHealth | null,
  stale: boolean,
): ChannelRow[] {
  if (!configured) return [];
  const known = CHANNEL_CATALOG.map((c) => c.key);
  const rank = (k: string) => {
    const i = known.indexOf(k);
    return i === -1 ? known.length : i;
  };
  return configured
    .filter((k) => k !== "telegram")
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => ({ key, label: channelLabel(key), state: channelState(key, configured, runtime, stale) }));
}

/** The one success line for an allowlist save, from what the SERVER stored. */
export function allowlistToastTitle(n: number): string {
  if (n === 0) return "Allowlist saved: no senders allowed; every message is denied";
  if (n === 1) return "Allowlist saved: 1 sender allowed";
  return `Allowlist saved: ${n} senders allowed`;
}
