/**
 * Resolve the catch-all segments of `/api/rc/<...>` into a gateway URL,
 * confined to `/api/v1/*`.
 *
 * Returns `null` when the result would escape that prefix or leave the gateway
 * origin — the caller turns that into a 400.
 *
 * Why this is not just string concatenation: Next hands the route's `path`
 * array already percent-decoded, so a single segment written as
 * `..%2f..%2fpair` arrives as `../../pair`. Concatenated into a URL string and
 * handed to `fetch()`, WHATWG normalisation resolves it clean out of the
 * prefix — `/api/v1/../../pair` becomes `/pair`, an endpoint the console is
 * never meant to reach, and the bearer token goes with it. Re-encoding each
 * segment keeps a decoded "/" from acting as a separator; re-checking the
 * normalised pathname afterwards catches anything the encoding missed.
 */
/**
 * A segment that is a traversal element, or that smuggles a path separator.
 *
 * Next only ever hands us *decoded* segments, so a literal "/" or "\" in one
 * means the caller percent-encoded it to sneak past segment-wise checks. Those
 * are rejected outright rather than merely re-encoded: forwarding a nonsense
 * path to the gateway spends the bearer token for a guaranteed 404, and it
 * would still traverse if anything between here and the gateway decoded `%2F`
 * before routing.
 */
const UNSAFE_SEGMENT = /[/\\]|^\.\.?$/;

export function resolveGatewayUrl(
  path: string[],
  search: string,
  gatewayUrl: string,
): string | null {
  if (path.some((seg) => seg === "" || UNSAFE_SEGMENT.test(seg))) return null;
  const suffix = path.map(encodeURIComponent).join("/");
  let target: URL;
  let base: URL;
  try {
    base = new URL(gatewayUrl);
    target = new URL(`api/v1/${suffix}${search}`, `${gatewayUrl}/`);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;
  if (!target.pathname.startsWith("/api/v1/")) return null;
  return target.toString();
}
