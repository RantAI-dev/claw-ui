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
 * True when a segment has a `.` or `..` path component.
 *
 * `/` and `\` are allowed inside a segment because ids contain them, for
 * example the custom provider id `custom:https://host/v1`, and the gateway
 * decodes one `{id}` segment. `encodeURIComponent` below turns each into `%2F`
 * or `%5C`, so the segment reaches the gateway as one path segment.
 *
 * A dot component is still refused. Next hands us *decoded* segments, so
 * `..%2F..%2Fpair` on the wire arrives as `../../pair`. Re-encoded it stays one
 * segment, but an intermediary between here and the gateway (reverse proxy,
 * tunnel, ingress) that decodes `%2F` before routing would turn it into
 * `/api/v1/../../pair`, which leaves `/api/v1/` carrying the bearer token.
 * Segments without a dot component, such as `//evil.example`, stay under
 * `/api/v1/` on the same origin even if something decodes them.
 */
function isTraversalSegment(seg: string): boolean {
  return seg.split(/[\\/]/).some((part) => part === "." || part === "..");
}

export function resolveGatewayUrl(
  path: string[],
  search: string,
  gatewayUrl: string,
): string | null {
  if (path.some((seg) => seg === "" || isTraversalSegment(seg))) return null;
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
