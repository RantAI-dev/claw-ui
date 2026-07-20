/**
 * Which requests count as the operator being present.
 *
 * The console polls `/api/rc/status` every 15s for its connection badge
 * (`use-gateway-status.ts`) and never stops while a tab is open. If that
 * counted as activity, an abandoned browser would keep its session alive
 * forever and the idle window could never elapse — so the decision is made
 * here, server-side, rather than trusting a header the client sets about
 * itself.
 *
 * Anything not listed counts as activity, which is the safe direction to be
 * wrong in: a new background poller that nobody adds here merely delays a
 * logout, whereas a mislabelled real interaction would log an active operator
 * out mid-task.
 */
const BACKGROUND_PATHS: readonly string[] = ["/api/rc/status"];

export function isBackgroundPath(pathname: string): boolean {
  return BACKGROUND_PATHS.includes(pathname);
}

/**
 * Error string returned by the proxy when a request is rejected specifically
 * because the idle window lapsed, as opposed to any other 401. The browser
 * surfaces the two differently: an idle timeout sends the operator to the login
 * page with an explanation, while a generic 401 just marks the console offline.
 *
 * Shared so the producer (`proxy.ts`) and the consumer (`use-gateway-status`)
 * cannot drift apart on a bare string literal.
 */
export const SESSION_EXPIRED = "session_expired";
