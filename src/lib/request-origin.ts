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
 * it cannot be set by page script. `Origin` is the fallback for agents that
 * omit it (Safari before 16.4, some webviews).
 *
 * The `Origin` fallback compares the Origin header's **host** against the
 * request's own `Host` header — NOT against a precomputed self-origin string.
 * Next's `req.nextUrl.origin` in the standalone server reflects the *bind*
 * address (`http://0.0.0.0:3939` under `--host 0.0.0.0`), which no browser
 * origin ever equals, so comparing against it rejected every genuine
 * same-origin login reached by a real host/IP. A same-origin request always
 * has `Origin`'s host equal to the `Host` it was sent to; a cross-site one does
 * not. Comparing the two is the robust, bind-address-independent check.
 *
 * A request carrying *neither* header is not a browser (curl, the CLI, a
 * server-side caller). Those are let through: they have no ambient credentials
 * to abuse, so CSRF does not apply to them, and blocking them would break
 * scripted use. Network-level access is the auth gate's job, not this one's.
 *
 * `same-site` is still refused along with `cross-site` on the Sec-Fetch-Site
 * path: the console is a single origin, and a sibling on another port of the
 * same host is not something it should accept privileged writes from.
 */
export function isCrossSiteWrite(
  method: string,
  headers: { secFetchSite: string | null; origin: string | null; host: string | null },
): boolean {
  if (!isStateChanging(method)) return false;

  const { secFetchSite, origin, host } = headers;
  if (secFetchSite) return secFetchSite !== "same-origin" && secFetchSite !== "none";
  if (origin) {
    // A malformed Origin, or one whose host differs from the Host header we were
    // reached at, is cross-site. If we have no Host to compare against, fail
    // closed.
    if (!host) return true;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return true;
    }
    return originHost !== host;
  }
  return false;
}

/**
 * Hosts the console will answer `/api/rc/*` on.
 *
 * The Origin check above compares Origin against the request's own Host, which
 * is correct and bind-address independent — but it means a **rebound DNS name**
 * satisfies it: the attacker's page is served from `evil.test`, `evil.test`
 * resolves to 127.0.0.1, and both headers then agree. The page's script can
 * read the full config and issue privileged writes, all signed with the gateway
 * token.
 *
 * Loopback by default, plus whatever `RANTAICLAW_UI_DEV_ORIGINS` already
 * carries, so an operator on a LAN address is not locked out silently — a
 * lockout that looks like an outage is its own failure.
 */
export function expectedHosts(env: {
  devOrigins?: string | null;
  allowedHosts?: string | null;
}): string[] {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  for (const raw of [env.allowedHosts, env.devOrigins]) {
    if (!raw) continue;
    for (const entry of raw.split(",")) {
      const v = entry.trim();
      if (!v) continue;
      // Accept either a bare host or a full origin.
      try {
        hosts.add(new URL(v).host);
        hosts.add(new URL(v).hostname);
      } catch {
        hosts.add(v);
      }
    }
  }
  return [...hosts];
}

/** Whether `hostname` (port already stripped) is an IP literal. */
function isIpLiteral(hostname: string): boolean {
  // IPv4: exactly four octets, each 0-255. `127.0.0.1.evil.test` has five
  // dot-parts and fails the shape check — a name that merely *contains* an IP
  // is still a name.
  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return v4.slice(1).every((o) => Number(o) <= 255);
  // IPv6 arrives bracketed in a Host header (`[::1]`, `[fe80::1]`). Bare
  // colon form is accepted too — it costs nothing and `::1` is already in
  // the default set. The colon requirement is the discriminator: a DNS name
  // can never carry one.
  const v6 = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return v6.includes(":") && /^[0-9a-fA-F:.]+$/.test(v6);
}

/**
 * Whether the `Host` this request arrived on is one the console serves.
 *
 * A missing Host is refused: every browser sends one, and something that does
 * not is not a context this gate exists to protect.
 *
 * An IP-literal Host is always served: DNS rebinding — the attack this gate
 * blocks — works by pointing a *name* at the console's address, and the
 * browser then sends that name as Host. A literal IP means the browser was
 * pointed at the address itself. Which addresses the console answers on is
 * the bind address's decision, not this gate's.
 */
export function isUnexpectedHost(host: string | null, allowed: string[]): boolean {
  if (!host) return true;
  // Compare on the hostname alone — the port is the console's own and varies.
  const hostname = host.replace(/:\d+$/, "");
  if (isIpLiteral(hostname)) return false;
  return !allowed.some((a) => a === host || a === hostname || a.replace(/:\d+$/, "") === hostname);
}
