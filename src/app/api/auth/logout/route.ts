import { clearedCookie, readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { revokeSession } from "@/lib/session-store";

export const runtime = "nodejs";

// Ends the session on the server. Only a cookie whose signature verifies is
// revoked; a missing or forged cookie revokes nothing, and the response clears
// the browser's cookie either way.
export async function POST(req: Request) {
  const raw = cookieValue(req.headers.get("cookie"), SESSION_COOKIE);
  const claims = await readSessionToken(raw);
  if (claims) revokeSession(claims.sid, claims.exp);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearedCookie() },
  });
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
