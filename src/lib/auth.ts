// Minimal session auth — a signed (HMAC-SHA256) HttpOnly cookie, like the
// Hermes web UI. Runs in both the Edge middleware and Node route handlers
// (Web Crypto only, no Node Buffer). When no password is configured the gate
// is disabled (convenient for loopback dev).

import { isLoginRequired } from "./auth-required";

export const SESSION_COOKIE = "rc_session";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h, matching Hermes

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

/** Mint a signed session token: `<b64url(payload)>.<b64url(hmac)>`. */
export async function createSessionToken(ttlMs = TTL_MS): Promise<string> {
  const payload = b64urlEncode(encoder.encode(JSON.stringify({ exp: Date.now() + ttlMs })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), src(encoder.encode(payload)));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(), src(b64urlDecode(sig)), src(encoder.encode(payload)));
  } catch {
    return false;
  }
  if (!valid) return false;
  try {
    const { exp } = JSON.parse(decoder.decode(b64urlDecode(payload)));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  // `Secure` requires an HTTPS (or localhost) context, so the browser silently
  // drops the cookie when the console is served over plain http:// at a LAN IP —
  // login then appears to succeed but never persists. The caller decides based
  // on the request's real protocol, not NODE_ENV (the prebuilt release is always
  // NODE_ENV=production yet is routinely served over http on a loopback/LAN bind).
  const secureFlag = secure ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secureFlag} Max-Age=${Math.floor(TTL_MS / 1000)}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
