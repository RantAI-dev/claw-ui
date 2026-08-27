// Generic server-side proxy: /api/rc/<...> -> <gateway>/api/v1/<...>
// Attaches the bearer token server-side and relays status + JSON transparently.
import { NextRequest } from "next/server";
import { GATEWAY_URL, gatewayHeaders } from "@/lib/gateway";
import { resolveGatewayUrl } from "@/lib/gateway-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, path: string[]) {
  // Confine the proxy to /api/v1/* so it can never reach gateway endpoints
  // outside it (/webhook, /pair, /triggers/*, /metrics) carrying the bearer
  // token. See `resolveGatewayUrl` for why a per-segment ".." comparison — what
  // this used to do — does not hold.
  const url = resolveGatewayUrl(path, req.nextUrl.search || "", GATEWAY_URL);
  if (url === null) {
    return Response.json({ error: "invalid_path" }, { status: 400 });
  }

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
    // Log the transport error server-side (it carries the gateway URL/host:port),
    // but do NOT relay it to the browser — the 502 + `gateway_unreachable` code
    // let describeApiError render "the gateway is unreachable" without leaking
    // the internal address to any console session.
    console.error("rc proxy transport error:", err);
    return Response.json(
      { error: "gateway_unreachable", detail: "the gateway is unreachable" },
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
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
