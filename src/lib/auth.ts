// Minimal session auth — a signed (HMAC-SHA256) HttpOnly cookie, like the
// Hermes web UI. Runs in both the Edge middleware and Node route handlers
// (Web Crypto only, no Node Buffer). When no password is configured the gate
// is disabled (convenient for loopback dev).

import { isLoginRequired } from "./auth-required";

export const SESSION_COOKIE = "rc_session";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h, matching Hermes

/**
 * How stale `la` (last activity) must be before an activity-bearing request is
 * worth re-signing the cookie for. Without this every asset request would carry
 * its own `Set-Cookie`; with it the write happens at most once a minute, which
 * is far finer than any idle window we offer (the shortest is 15 minutes).
 */
const ACTIVITY_REFRESH_MS = 60_000;

/**
 * Claims carried in the signed cookie payload.
 *
 * `exp` is the absolute cap — minted once at login and **never** extended, so a
 * session cannot be kept alive indefinitely by staying active. `la` is the last
 * activity stamp and slides forward; it is what the idle window is measured
 * against.
 */
export type SessionClaims = { exp: number; la: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Coerce a Uint8Array to BufferSource — sidesteps the TS 5.7 Uint8Array<ArrayBufferLike>
// vs BufferSource generics friction in the Web Crypto lib types. Runtime-safe.
function src(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

/**
 * Auth is enforced when the connected RantaiClaw gateway has console login
 * enabled (`config.gateway.login`). The gateway is the single source of truth;
 * the check is cached + fail-closed (see `auth-required.ts`).
 */
export async function authEnabled(): Promise<boolean> {
  return isLoginRequired();
}

function secret(): string {
  // Signs the rc_session cookie. The credential itself now lives in the gateway,
  // so there is no UI password to fall back to — set RANTAICLAW_UI_SECRET to a
  // long random string in production. `rantaiclaw ui start` generates one
  // automatically; the dev fallback below is insecure by design and is refused
  // (fail-closed) whenever login is enabled — see `sessionSecretConfigured`.
  return process.env.RANTAICLAW_UI_SECRET || "rantaiclaw-ui-insecure-dev";
}

/**
 * Whether a real cookie-signing secret is configured. When login is enabled
 * without one, the gate cannot be trusted — an attacker could forge an
 * `rc_session` with the built-in dev fallback. Callers MUST fail closed.
 */
export function sessionSecretConfigured(): boolean {
  return (process.env.RANTAICLAW_UI_SECRET ?? "").length > 0;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    src(encoder.encode(secret())),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign an arbitrary claim set into `<b64url(payload)>.<b64url(hmac)>`. */
async function sign(claims: SessionClaims): Promise<string> {
  const payload = b64urlEncode(encoder.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), src(encoder.encode(payload)));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Mint a fresh session token at login. */
export async function createSessionToken(ttlMs = TTL_MS, now = Date.now()): Promise<string> {
  return sign({ exp: now + ttlMs, la: now });
}

/**
 * Re-sign an existing session with its activity stamp moved to `now`. The
 * absolute `exp` is carried over untouched — sliding the idle window must never
 * push out the hard cap.
 */
export async function refreshSessionToken(
  claims: SessionClaims,
  now = Date.now(),
): Promise<string> {
  return sign({ exp: claims.exp, la: now });
}

/**
 * Verify the signature and absolute expiry, returning the claims on success and
 * `null` on any failure (bad signature, malformed payload, past `exp`).
 *
 * Sessions minted before `la` existed carry only `exp`; they are accepted and
 * treated as active as of now, so an in-flight session survives the upgrade
 * instead of being logged out by it.
 */
export async function readSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<SessionClaims | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(), src(b64urlDecode(sig)), src(encoder.encode(payload)));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const { exp, la } = JSON.parse(decoder.decode(b64urlDecode(payload)));
    if (typeof exp !== "number" || exp <= now) return null;
    return { exp, la: typeof la === "number" ? la : now };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await readSessionToken(token)) !== null;
}

/**
 * Whether the session has been idle past its window. A zero (or negative)
 * window disables the check entirely — that is the default, and it keeps the
 * historical behaviour of a session lasting until the absolute cap.
 */
export function isIdleExpired(
  claims: SessionClaims,
  idleTimeoutMs: number,
  now = Date.now(),
): boolean {
  return idleTimeoutMs > 0 && now - claims.la >= idleTimeoutMs;
}

/**
 * Whether an activity-bearing request should re-sign the cookie.
 *
 * Throttled to at most once a minute, but never coarser than a quarter of the
 * idle window: a window shorter than the throttle would otherwise expire before
 * activity ever got a chance to move `la`, logging out an operator who never
 * stopped working. Config accepts any value even though the presets start at 15
 * minutes, so this has to hold for the small ones too.
 */
export function shouldRefreshActivity(
  claims: SessionClaims,
  now = Date.now(),
  idleTimeoutMs = 0,
): boolean {
  const throttle =
    idleTimeoutMs > 0
      ? Math.min(ACTIVITY_REFRESH_MS, Math.floor(idleTimeoutMs / 4))
      : ACTIVITY_REFRESH_MS;
  return now - claims.la >= throttle;
}

/** Seconds left on the absolute cap, floored at 0 — for the cookie's Max-Age. */
export function remainingMaxAgeSecs(claims: SessionClaims, now = Date.now()): number {
  return Math.max(0, Math.floor((claims.exp - now) / 1000));
}

export function sessionCookie(token: string, secure: boolean, maxAgeSecs?: number): string {
  // `Secure` requires an HTTPS (or localhost) context, so the browser silently
  // drops the cookie when the console is served over plain http:// at a LAN IP —
  // login then appears to succeed but never persists. The caller decides based
  // on the request's real protocol, not NODE_ENV (the prebuilt release is always
  // NODE_ENV=production yet is routinely served over http on a loopback/LAN bind).
  //
  // `maxAgeSecs` defaults to the full TTL (a fresh login). A re-signed cookie
  // passes the time left on the absolute cap instead, so the browser stops
  // holding a cookie the server would reject anyway. The signed `exp` is what
  // actually decides validity — this is hygiene, not enforcement.
  const secureFlag = secure ? " Secure;" : "";
  const maxAge = maxAgeSecs ?? Math.floor(TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secureFlag} Max-Age=${maxAge}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
