// SSE relay for agent chat. Opens POST /api/v1/agent/chat on the gateway with
// Accept: text/event-stream and pipes the event stream straight back to the
// browser. The client's abort signal propagates upstream so "Stop" cancels the run.
import { NextRequest } from "next/server";
import { GATEWAY_URL, gatewayHeaders } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const upstream = `${GATEWAY_URL}/api/v1/agent/chat`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: gatewayHeaders({
        "content-type": "application/json",
        accept: "text/event-stream",
      }),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: req.signal,
    });
  } catch (err) {
    return Response.json(
      { error: "gateway_unreachable", detail: String(err instanceof Error ? err.message : err) },
      { status: 502 },
    );
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return Response.json(
      { error: "gateway_error", status: res.status, detail: text },
      { status: res.status || 502 },
    );
  }

  // Pipe the upstream SSE stream straight to the client.
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
