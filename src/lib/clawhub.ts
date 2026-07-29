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

/** One publisher a shared slug could mean, as returned by the gateway's 409. */
export interface SkillCandidate {
  owner: string;
  reference: string;
  url: string;
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
