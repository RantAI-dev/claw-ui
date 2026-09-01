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

export interface KeyBadge {
  label: string;
  variant: "outline" | "success" | "warning";
}

/**
 * The key badge words. `keyPresent` is "a key in config.toml" (the gateway does
 * not report env-var keys), hence "stored". A local provider without one is not
 * a warning: it needs none.
 */
export function keyState(local: boolean, keyPresent: boolean): KeyBadge {
  if (keyPresent) return { label: "Key stored", variant: "success" };
  if (local) return { label: "No key needed", variant: "outline" };
  return { label: "No key stored", variant: "warning" };
}

/** The catalog's display name for an id; the id itself when unknown; "none" when unset. */
export function providerLabel(
  id: string | null | undefined,
  catalog: ProviderInfo[] | null | undefined,
): string {
  if (!id) return "none";
  return catalog?.find((p) => p.id === id)?.display_name ?? id;
}
