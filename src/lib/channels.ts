import type { RuntimeHealth } from "./status";
import type { ChannelCatalogEntry, ChannelSupport, ChannelVerification } from "./types";

/**
 * The console used to keep its own transcription of the runtime's catalog here.
 * Two hand-maintained lists of the same thing, in two repositories, and its own
 * comment admitted they could disagree — which is how `/api/v1/channels` came
 * to report 7 of 11 channels. The list now arrives on that endpoint
 * (`ChannelsInfo.channels`) and every function below takes it as an argument
 * rather than reaching for a literal.
 *
 * The fallback the old comment described is kept: a key the catalog does not
 * carry still renders, as the key. That covers both directions of version skew
 * — a runtime newer than this console, and a gateway too old to send a catalog
 * at all.
 */
export function channelLabel(key: string, catalog: ChannelCatalogEntry[]): string {
  return catalog.find((c) => c.key === key)?.label ?? key;
}

/**
 * What the runtime says the project commits to for `key`, or `null` when it
 * does not say.
 *
 * Falls back to `maturity`, the field the runtime published before the axes
 * were split and still sends as an alias. Without that fallback a console newer
 * than its gateway would drop the badge entirely.
 */
export function channelSupport(
  key: string,
  catalog: ChannelCatalogEntry[],
): ChannelSupport | null {
  const entry = catalog.find((c) => c.key === key);
  return entry?.support ?? entry?.maturity ?? null;
}

/**
 * Whether the runtime says anyone has driven `key`, or `null` when it does not
 * say.
 *
 * `null` and `"not_driven"` are different answers and the panel renders them
 * differently. A runtime older than the split has no opinion, and claiming
 * "not yet verified" on its behalf would be inventing evidence about a channel
 * the console cannot see.
 */
export function channelVerification(
  key: string,
  catalog: ChannelCatalogEntry[],
): ChannelVerification | null {
  return catalog.find((c) => c.key === key)?.verification ?? null;
}

/**
 * The channels this console can set up, each with its own card.
 *
 * `configuredRows` leaves these out, because a row and a card would both claim
 * the same channel while only the card can connect or disconnect it. The rule
 * used to be the literal string "telegram", back when Telegram was the only
 * channel with an endpoint behind it.
 */
export const CARDED_CHANNELS = ["telegram", "discord", "slack"] as const;

/**
 * Whether the runtime says `key`'s configured section carries a credential, or
 * `null` when it does not say.
 *
 * Three answers, not two. `configured` only means a config section exists, so a
 * section written by hand without the token reads as connected everywhere and
 * never starts — that is what `false` is for. A gateway older than the field
 * gets `null`, and so does a key the catalog does not carry: rendering either
 * as "the token is missing" would invent evidence about a channel the console
 * cannot see, which is the mistake `channelVerification` already refuses to
 * make.
 */
export function channelHasCredentials(
  key: string,
  catalog: ChannelCatalogEntry[],
): boolean | null {
  return catalog.find((c) => c.key === key)?.has_credentials ?? null;
}

/**
 * Whether `key` is configured but has no credential saved for it.
 *
 * The one state this exists for: `[channels_config.discord]` written by hand
 * with `bot_token` left out. Only a runtime that answers the question can put
 * the console in this state; silence is not an accusation.
 */
export function channelMissingCredentials(
  key: string,
  configured: string[] | null,
  catalog: ChannelCatalogEntry[],
): boolean {
  if (!configured?.includes(key)) return false;
  return channelHasCredentials(key, catalog) === false;
}

export type ChannelWord = "running" | "error" | "configured" | "not configured" | "unknown";

export interface ChannelState {
  word: ChannelWord;
  /** Sentence-case badge text. */
  label: string;
  tone: "success" | "destructive" | "outline";
  /** One line under the badge, when the word alone would mislead. */
  detail: string | null;
  /**
   * Who the detail is about. "runtime" details (no snapshot, runtime down)
   * are shared by every configured channel, so the page says them once in
   * the verdict band; cards and rows only voice "channel" details.
   */
  detailScope?: "runtime" | "channel";
}

const RUNTIME_DOWN =
  "The channels runtime is not running; start rantaiclaw daemon to bring it up.";
const NO_SNAPSHOT =
  "This gateway sent no runtime snapshot, so whether the channel is running is unknown.";
const NOT_STARTED =
  "The channels runtime is up but this channel has not started; check its credentials in config.toml.";

function configuredWith(detail: string, detailScope: "runtime" | "channel"): ChannelState {
  return { word: "configured", label: "Configured", tone: "outline", detail, detailScope };
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
  if (key === "webhook") return configuredWith("Served by the gateway itself.", "channel");
  if (!runtime) return configuredWith(NO_SNAPSHOT, "runtime");
  const byName = new Map(runtime.components.map((c) => [c.name, c]));
  if (!byName.has("channels")) return configuredWith(RUNTIME_DOWN, "runtime");
  const own = byName.get(`channel:${key}`);
  if (!own) return configuredWith(NOT_STARTED, "channel");
  if (own.status.toLowerCase() === "ok") {
    return { word: "running", label: "Running", tone: "success", detail: null };
  }
  return {
    word: "error",
    label: "Error",
    tone: "destructive",
    detail: own.lastError ? `last error: ${own.lastError}` : `status: ${own.status}`,
    detailScope: "channel",
  };
}

export interface ChannelRow {
  key: string;
  label: string;
  state: ChannelState;
  /** `null` for a key the runtime's catalog does not carry. */
  support: ChannelSupport | null;
  /** `null` when the runtime is older than the two-axis split. */
  verification: ChannelVerification | null;
}

/**
 * Every configured channel except the ones with their own setup card, catalog
 * order first, keys the catalog does not carry after, in the order reported.
 */
export function configuredRows(
  configured: string[] | null,
  runtime: RuntimeHealth | null,
  stale: boolean,
  catalog: ChannelCatalogEntry[],
): ChannelRow[] {
  if (!configured) return [];
  const known = catalog.map((c) => c.key);
  const rank = (k: string) => {
    const i = known.indexOf(k);
    return i === -1 ? known.length : i;
  };
  return configured
    // Widened on purpose: `CARDED_CHANNELS` keeps its literal type so the panel
    // can derive its cards from it, and `includes` will not take a plain string
    // against a readonly tuple of literals.
    .filter((k) => !(CARDED_CHANNELS as readonly string[]).includes(k))
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => ({
      key,
      label: channelLabel(key, catalog),
      state: channelState(key, configured, runtime, stale),
      support: channelSupport(key, catalog),
      verification: channelVerification(key, catalog),
    }));
}

export interface ChannelsVerdict {
  /** The page's opening line. */
  headline: string;
  tone: "success" | "destructive" | "warning" | "muted";
  /** One `key word` pair per configured channel, for the mono line. */
  meta: string | null;
  /** The runtime-level sentence, or the failing channel's error. */
  detail: string | null;
}

/**
 * The one answer the page opens with: is the agent reachable, where, and if
 * not, why. Derived from the same per-channel states the cards render. The
 * webhook counts as reachable while the gateway answers, because the gateway
 * serves it itself.
 */
export function channelsVerdict(
  configured: string[] | null,
  runtime: RuntimeHealth | null,
  stale: boolean,
  catalog: ChannelCatalogEntry[],
): ChannelsVerdict {
  if (stale) {
    return {
      headline: "Channel status unknown",
      tone: "warning",
      meta: null,
      detail: "The last read failed or the gateway is offline; nothing shown is current.",
    };
  }
  const keys = configured ?? [];
  if (keys.length === 0) {
    return {
      headline: "Not reachable on any channel",
      tone: "muted",
      meta: null,
      detail: "Connect Telegram, or configure a channel in config.toml.",
    };
  }
  const states = keys.map((key) => ({ key, state: channelState(key, configured, runtime, false) }));
  const meta = states.map((s) => `${s.key} ${s.state.word}`).join(" · ");
  const failing = states.filter((s) => s.state.word === "error");
  if (failing.length > 0) {
    return {
      headline:
        failing.length === 1
          ? `${channelLabel(failing[0].key, catalog)} is failing`
          : `${failing.length} channels are failing`,
      tone: "destructive",
      meta,
      detail: failing.length === 1 ? failing[0].state.detail : null,
    };
  }
  const reachable = states.filter((s) => s.state.word === "running" || s.key === "webhook");
  if (reachable.length > 0) {
    const names = reachable.map((s) => channelLabel(s.key, catalog));
    return {
      headline:
        names.length === 1
          ? `Reachable on ${names[0]}`
          : names.length === 2
            ? `Reachable on ${names[0]} and ${names[1]}`
            : `Reachable on ${names.length} channels`,
      tone: "success",
      meta,
      detail: null,
    };
  }
  const subject =
    states.length === 1 ? channelLabel(states[0].key, catalog) : `${states.length} channels`;
  const detail = !runtime
    ? NO_SNAPSHOT
    : !runtime.components.some((c) => c.name === "channels")
      ? RUNTIME_DOWN
      : "The channels runtime is up, but nothing has started; check credentials in config.toml.";
  return { headline: `${subject} configured, not running`, tone: "muted", meta, detail };
}

/**
 * What saving `next` would do to a server list that has moved since the editor
 * was seeded from `seeded`.
 *
 * The POST replaces the allowlist wholesale, so anyone who self-onboarded via
 * `/claim` after the panel loaded is silently revoked. The backend deliberately
 * re-reads the freshest config under a lock to avoid clobbering them; the
 * console defeated that by sending a stale snapshot back.
 *
 * Returns `null` when the server matches what the editor was seeded from —
 * nothing to warn about.
 *
 * It lived in `channels-panel.tsx` while Telegram was the only card. Moved here
 * unchanged when Discord and Slack started needing the same check; the panel
 * re-exports the name so its own suite still finds it there.
 */
export function allowlistDrift(
  seeded: string[],
  server: string[],
  next: string[],
): { wouldRevoke: string[]; alsoChanged: string[] } | null {
  const seededSet = new Set(seeded);
  const serverSet = new Set(server);
  const addedOnServer = server.filter((u) => !seededSet.has(u));
  const goneFromServer = seeded.filter((u) => !serverSet.has(u));
  if (addedOnServer.length === 0 && goneFromServer.length === 0) return null;
  const nextSet = new Set(next);
  return {
    // Only the ones the operator's box does NOT already carry: an entry they
    // typed back in is not being revoked.
    wouldRevoke: addedOnServer.filter((u) => !nextSet.has(u)),
    alsoChanged: goneFromServer,
  };
}

/** The one success line for an allowlist save, from what the SERVER stored. */
export function allowlistToastTitle(n: number): string {
  if (n === 0) return "Allowlist saved: no senders allowed; every message is denied";
  if (n === 1) return "Allowlist saved: 1 sender allowed";
  return `Allowlist saved: ${n} senders allowed`;
}
