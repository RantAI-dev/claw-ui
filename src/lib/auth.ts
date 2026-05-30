// Minimal session auth — a signed (HMAC-SHA256) HttpOnly cookie, like the
// Hermes web UI. Runs in both the Edge middleware and Node route handlers
// (Web Crypto only, no Node Buffer). When no password is configured the gate
// is disabled (convenient for loopback dev).

export const SESSION_COOKIE = "rc_session";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h, matching Hermes

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Coerce a Uint8Array to BufferSource — sidesteps the TS 5.7 Uint8Array<ArrayBufferLike>
// vs BufferSource generics friction in the Web Crypto lib types. Runtime-safe.
function src(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

function password(): string {
  return process.env.RANTAICLAW_UI_PASSWORD || "";
}

/** Auth is enforced only when a password is configured. */
export function authEnabled(): boolean {
  return password().length > 0;
}

function secret(): string {
  // Prefer a dedicated signing secret; fall back to the password so a password
  // change invalidates existing sessions.
  return process.env.RANTAICLAW_UI_SECRET || password() || "rantaiclaw-ui-insecure-dev";
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

/** Constant-time string comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  const expected = password();
  return expected.length > 0 && constantTimeEqual(input, expected);
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

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${Math.floor(TTL_MS / 1000)}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
