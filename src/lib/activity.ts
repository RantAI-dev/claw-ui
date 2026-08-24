/**
 * Which requests count as the operator being present.
 *
 * The console polls several endpoints on a timer while a tab is open — the
 * connection badge (`/api/rc/status`), the autonomy rung (`/api/rc/config`),
 * and the Schedules panel (`/api/rc/cron`). None of these is an operator
 * action, so counting them as activity would keep an abandoned browser's
 * session alive forever and the idle window could never elapse. The decision is
 * made here, server-side, rather than trusting a header the client sets about
 * itself.
 *
 * Anything not listed counts as activity, which is the safe direction to be
 * wrong in: a new background poller that nobody adds here merely delays a
 * logout, whereas a mislabelled real interaction would log an active operator
 * out mid-task.
 */
// Exact paths only: these are the bare polling GETs. Their sub-paths are real
// user actions (`/api/rc/config/autonomy` PUT, `/api/rc/cron/{id}` mutations)
// and must still count as activity, so this is a whole-path match, not a prefix.
const BACKGROUND_PATHS: readonly string[] = [
  "/api/rc/status",
  "/api/rc/config",
  "/api/rc/cron",
];

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
