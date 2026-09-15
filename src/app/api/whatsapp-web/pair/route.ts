// SSE relay for the WhatsApp Web pairing stream. Opens POST
// /api/v1/channels/whatsapp_web/pair on the gateway with
// Accept: text/event-stream and pipes the gateway's QR / connected /
// timeout / failed frames straight back to the browser.
//
// Plan 369: the route sits at /api/whatsapp-web/pair (NOT /api/rc/...)
// because /api/rc/[...path] buffers the whole response before
// answering (`src/app/api/rc/[...path]/route.ts:32-35`), which would
// never let a frame reach the browser. The pairing stream is the
// whole reason /api/chat exists; this is the same pattern for a
// different upstream route.
//
// The browser closes the stream by navigating away or unmounting the
// card; that propagates upstream via `req.signal`, which the
// /api/chat route already does, so the pairing bot stops cleanly.

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

  const upstream = `${GATEWAY_URL}/api/v1/channels/whatsapp_web/pair`;

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
    // The gateway returns a JSON body on every non-stream error path
    // (409 already_linked, 409 pairing_in_progress, 401, 400).
    // Surface it verbatim — the card turns it into a toast.
    const text = await res.text().catch(() => "");
    return new Response(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  }

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
