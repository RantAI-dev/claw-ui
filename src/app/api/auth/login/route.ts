import { NextRequest } from "next/server";
import { authEnabled, checkPassword, createSessionToken, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!authEnabled()) return Response.json({ ok: true, authDisabled: true });
  let password = "";
  try {
    password = (await req.json())?.password ?? "";
  } catch {
    /* ignore */
  }
  if (!checkPassword(password)) {
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }
  const token = await createSessionToken();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(token) },
  });
}
