/**
 * Cross-site request rejection for the BFF.
 *
 * The proxy under `/api/rc/*` attaches the gateway bearer token server-side, so
 * a request that merely *arrives* is already privileged — no cookie required.
 * That makes every state-changing route a CSRF target: a page on any other
 * origin can aim `fetch()` at the console's port and the BFF will happily sign
 * the request on its behalf.
 *
 * Note that a preflight is not the obstacle it looks like. `POST` with
 * `content-type: text/plain` is a CORS *simple request* — no preflight at all —
 * and `src/app/api/rc/[...path]/route.ts` overwrites the content-type with
 * `application/json` before forwarding, so the text/plain wrapper is laundered
 * into a valid gateway call. The attacker cannot read the reply; they do not
 * need to.
 */

/** Methods that can change state, and therefore need an origin check. */
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isStateChanging(method: string): boolean {
  return STATE_CHANGING.has(method.toUpperCase());
}

/**
 * Whether a state-changing request should be refused as cross-site.
 *
 * `Sec-Fetch-Site` is the primary signal — every current browser sends it and
 * it cannot be set by page script. `Origin` is the fallback for older agents.
 *
 * A request carrying *neither* header is not a browser (curl, the CLI, a
 * server-side caller). Those are let through: they have no ambient credentials
 * to abuse, so CSRF does not apply to them, and blocking them would break
 * scripted use. Network-level access is the auth gate's job, not this one's.
 *
 * `same-site` is refused along with `cross-site`: the console is a single
 * origin, and a sibling on another port of the same host is not something it
 * should accept privileged writes from.
 */
export function isCrossSiteWrite(
  method: string,
  headers: { secFetchSite: string | null; origin: string | null },
  selfOrigin: string,
): boolean {
  if (!isStateChanging(method)) return false;

  const { secFetchSite, origin } = headers;
  if (secFetchSite) return secFetchSite !== "same-origin" && secFetchSite !== "none";
  if (origin) return origin !== selfOrigin;
  return false;
}
