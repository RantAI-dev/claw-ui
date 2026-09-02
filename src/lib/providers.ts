import type { ProviderInfo } from "./types";

/** What the Providers form holds. */
export interface Draft {
  provider: string;
  model: string;
  key: string;
  url: string;
}

/** What the gateway last reported for the same four things. */
export interface Server {
  provider: string | null;
  model: string | null;
  url: string | null;
  keyPresent: boolean;
}

/** Which of the four a Save would write. */
export interface Changes {
  provider: boolean;
  model: boolean;
  key: boolean;
  url: boolean;
}

/**
 * The one dirty rule. A blank key or URL never counts: the key field cannot
 * show the stored key, so blank has to mean "keep", and the URL follows the
 * same contract (the explicit Reset button clears it). A Save that would send
 * nothing is not a save, so the button waits for one of these to be true.
 */
export function changes(draft: Draft, server: Server): Changes {
  const url = draft.url.trim();
  return {
    provider: draft.provider !== "" && draft.provider !== (server.provider ?? ""),
    model: draft.model !== "" && draft.model !== (server.model ?? ""),
    key: draft.key.trim() !== "",
    url: url !== "" && url !== (server.url ?? ""),
  };
}

export function isDirty(c: Changes): boolean {
  return c.provider || c.model || c.key || c.url;
}

/** "Saved: provider OpenAI, model gpt-5.5, API key stored": only the parts written. */
export function saveSummary(c: Changes, providerLabel: string, model: string): string {
  const parts: string[] = [];
  if (c.provider) parts.push(`provider ${providerLabel}`);
  if (c.model) parts.push(`model ${model}`);
  if (c.key) parts.push("API key stored");
  if (c.url) parts.push("base URL set");
  return parts.length ? `Saved: ${parts.join(", ")}` : "Nothing to save";
}

export interface ProvidersVerdict {
  headline: string;
  tone: "ok" | "warn";
  /** Mono metadata parts, rendered joined with a middle dot. */
  meta: string[];
  detail?: string;
}

/**
 * The verdict the page opens with: what the agent talks to right now, and
 * whether that wiring can work. `keyPresent` is "a key in config.toml" (the
 * gateway does not report env-var keys), so the missing-key case stays hedged.
 */
export function providersVerdict(
  server: Server,
  local: boolean,
  providerLabelText: string,
  encryptAtRest: boolean | undefined,
): ProvidersVerdict {
  if (!server.provider) {
    return {
      headline: "No provider set",
      tone: "warn",
      meta: [],
      detail: "Pick a provider and model below; chat and channels wait until one is set.",
    };
  }
  const keyPhrase = server.keyPresent
    ? encryptAtRest === false
      ? "key stored in plain text (secrets.encrypt off)"
      : "key stored encrypted"
    : local
      ? "no key needed"
      : "no key stored";
  const meta = [`model ${server.model ?? "not set"}`, keyPhrase];
  if (server.url) meta.push(`base URL ${server.url}`);
  const keyMissing = !server.keyPresent && !local;
  const tone = keyMissing || !server.model ? "warn" : "ok";
  const detail = !server.model
    ? "No model set; pick one below. The agent refuses to guess."
    : keyMissing
      ? `If ${providerLabelText} needs a key, chat and channels cannot use it until you add one below.`
      : undefined;
  return { headline: `Talking to ${providerLabelText}`, tone, meta, detail };
}

/** The catalog's display name for an id; the id itself when unknown; "none" when unset. */
export function providerLabel(
  id: string | null | undefined,
  catalog: ProviderInfo[] | null | undefined,
): string {
  if (!id) return "none";
  return catalog?.find((p) => p.id === id)?.display_name ?? id;
}
