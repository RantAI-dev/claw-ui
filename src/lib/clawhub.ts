// ClawHub namespaces skills per publisher, so a slug on its own no longer
// identifies a skill: searching `weather` returns four results, one of them a
// verbatim fork of another with the same display name and summary. Anything
// that identifies or installs a skill has to carry the publisher too.

export interface PublisherIdentified {
  slug: string;
  ownerHandle?: string;
}

/**
 * The reference to install a result by, and the stable identity to key a list
 * row on: `@owner/slug` when the endpoint reported a publisher, the bare slug
 * when it did not.
 *
 * `/search` reports the publisher; `/skills?sort=stars` (the browse listing)
 * does not, so browse rows stay bare and resolve through the gateway's `409`
 * candidate list instead.
 */
export function skillReference(skill: PublisherIdentified): string {
  const owner = skill.ownerHandle?.trim();
  return owner ? `@${owner}/${skill.slug}` : skill.slug;
}

/** An installed skill as `GET /api/v1/skills` reports it. */
export interface InstalledSkillLike {
  name: string;
  clawhub?: { owner?: string; slug?: string };
}

/**
 * Which local skills occupy which ClawHub identities.
 *
 * `references` holds `@owner/slug` for installs whose publisher was recorded.
 * `unattributedSlugs` holds the slug alone for the rest — installs predating
 * the provenance marker, or ones made from a slug unique enough that ClawHub
 * resolved it without an owner. We know the slug is taken; not by whom.
 */
export interface InstalledSkillIndex {
  references: Set<string>;
  unattributedSlugs: Set<string>;
}

export function indexInstalledSkills(
  skills: InstalledSkillLike[],
): InstalledSkillIndex {
  const references = new Set<string>();
  const unattributedSlugs = new Set<string>();
  for (const skill of skills) {
    const owner = skill.clawhub?.owner?.trim();
    const slug = skill.clawhub?.slug?.trim();
    if (owner && slug) {
      references.add(`@${owner}/${slug}`.toLowerCase());
      continue;
    }
    // Fall back to the manifest name only when there is no recorded slug —
    // the two can differ, which is why matching on `name` alone was wrong.
    const fallback = slug || skill.name;
    if (fallback) unattributedSlugs.add(fallback.toLowerCase());
  }
  return { references, unattributedSlugs };
}

/**
 * What the browse card should offer.
 *
 * `other-publisher` is the case that used to be invisible: the slug's
 * directory already holds someone else's copy. The gateway refuses to
 * overwrite it, so showing an Install button there promises something that
 * cannot happen — and showing "installed" (the old behaviour) claims a copy
 * the user does not have.
 */
export type InstallState =
  | { kind: "installed" }
  | { kind: "installed-unattributed" }
  | { kind: "other-publisher"; owner: string }
  | { kind: "available" };

export function installStateFor(
  skill: PublisherIdentified,
  index: InstalledSkillIndex,
): InstallState {
  const slug = skill.slug.trim().toLowerCase();
  if (!slug) return { kind: "available" };

  if (index.references.has(skillReference(skill).toLowerCase())) {
    return { kind: "installed" };
  }
  if (index.unattributedSlugs.has(slug)) {
    return { kind: "installed-unattributed" };
  }
  for (const reference of index.references) {
    const separator = reference.indexOf("/");
    if (separator > 0 && reference.slice(separator + 1) === slug) {
      return { kind: "other-publisher", owner: reference.slice(1, separator) };
    }
  }
  return { kind: "available" };
}

/** One publisher a shared slug could mean, as returned by the gateway's 409. */
export interface SkillCandidate {
  owner: string;
  reference: string;
  url: string;
  /**
   * What the gateway knows about this publisher, joined in from ClawHub's
   * search index. Optional because an older gateway does not send them, and
   * because the lookup behind them is best-effort — absent or `0` means
   * *unknown*, not unused.
   */
  downloads?: number;
  official?: boolean;
}

/**
 * Short summary of what is known about a publisher, for putting next to its
 * reference. Empty when nothing is known — a bare reference is honest, while
 * "0 installs" would read as "nobody uses this".
 *
 * Mirrors `AmbiguousMatch::annotation` on the Rust side so the console and the
 * TUI describe a publisher the same way.
 */
export function candidateAnnotation(candidate: SkillCandidate): string {
  const parts: string[] = [];
  if (typeof candidate.downloads === "number" && candidate.downloads > 0) {
    parts.push(`${candidate.downloads.toLocaleString()} installs`);
  }
  if (candidate.official) parts.push("official");
  return parts.join(" · ");
}

/**
 * Read the candidate publishers off an error thrown by the API client.
 * Returns null when the failure was anything else, so callers fall back to
 * reporting the message.
 */
export function candidatesFromError(error: unknown): SkillCandidate[] | null {
  if (!error || typeof error !== "object") return null;
  const body = (error as { body?: unknown }).body;
  if (!body || typeof body !== "object") return null;
  const matches = (body as { matches?: unknown }).matches;
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const candidates = matches.filter(
    (m): m is SkillCandidate =>
      !!m &&
      typeof m === "object" &&
      typeof (m as SkillCandidate).reference === "string" &&
      (m as SkillCandidate).reference.length > 0,
  );
  return candidates.length > 0 ? candidates : null;
}

/**
 * An operator-facing sentence for a failed ClawHub read. The console's own
 * proxy (`/api/clawhub`) answers 502 with `clawhub_unreachable` (plus a
 * detail) when clawhub.ai cannot be reached from the server, or `clawhub NNN`
 * when it answered with an error; a fetch that never left the browser is a
 * `TypeError`. None of these involve the gateway, so `describeApiError`
 * (whose 502 branch says the gateway is restarting) is the wrong reader.
 * Duck-typed like `candidatesFromError`, so this module does not import the
 * API client.
 */
export function describeHubError(error: unknown): string {
  if (error instanceof TypeError) {
    return `The console could not be reached (${error.message}). Check your connection, then retry.`;
  }
  const status = (error as { status?: unknown } | null)?.status;
  const body = (error as { body?: unknown } | null)?.body as
    | { error?: unknown; detail?: unknown }
    | undefined;
  const code = typeof body?.error === "string" ? body.error : "";
  if (typeof status === "number" && code === "clawhub_unreachable") {
    const detail =
      typeof body?.detail === "string" && body.detail.trim() ? ` (${body.detail.trim()})` : "";
    return `ClawHub could not be reached from the console's server${detail}. Check its network access, then retry.`;
  }
  const answered = /^clawhub (\d{3})$/.exec(code);
  if (typeof status === "number" && answered) {
    return `ClawHub answered ${answered[1]}. Retry in a moment.`;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown } | null)?.message === "string"
        ? (error as { message: string }).message
        : String(error);
  return `ClawHub error: ${message}`;
}

