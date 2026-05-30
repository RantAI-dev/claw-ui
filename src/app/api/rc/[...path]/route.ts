// Generic server-side proxy: /api/rc/<...> -> <gateway>/api/v1/<...>
// Attaches the bearer token server-side and relays status + JSON transparently.
import { NextRequest } from "next/server";
import { GATEWAY_URL, gatewayHeaders } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, path: string[]) {
  const suffix = path.join("/");
  const search = req.nextUrl.search || "";
  const url = `${GATEWAY_URL}/api/v1/${suffix}${search}`;

  const method = req.method.toUpperCase();
  const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
  const body = hasBody ? await req.text() : undefined;

  try {
    const res = await fetch(url, {
      method,
      headers: gatewayHeaders(hasBody ? { "content-type": "application/json" } : undefined),
      body,
      cache: "no-store",
      signal: req.signal,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err) {
    return Response.json(
      { error: "gateway_unreachable", detail: String(err instanceof Error ? err.message : err) },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
