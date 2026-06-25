// Dedicated multipart proxy for KB ingest: forwards an uploaded file to
// <gateway>/api/v1/kb/documents as multipart/form-data. The generic /api/rc
// proxy only relays JSON, so document ingest needs this route.
//
// The incoming request is forwarded VERBATIM — we read the raw bytes and keep
// the original `content-type` (boundary intact) rather than calling
// `req.formData()`. Next.js's multipart parser throws on filenames with
// brackets/spaces/non-ASCII chars; the gateway's parser is robust, so we let
// it do the parsing. The client already names fields the gateway expects
// (`file` + `categories`), so no server-side re-parse/rename is needed.
import { NextRequest } from "next/server";
import { GATEWAY_URL, gatewayHeaders } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (gateway caps at 32 MB; stay under it)

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "invalid_multipart" }, { status: 400 });
  }

  // Buffer the raw body without parsing it. Buffering (not streaming) keeps the
  // per-attempt retry below safe and idempotent.
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.byteLength > MAX_BYTES) {
    return Response.json(
      { error: "file_too_large", detail: `Max ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  // Build the upstream request fresh per attempt. Forward the original
  // multipart content-type so the boundary is preserved; the gateway parses it.
  const buildInit = (): RequestInit => {
    const headers = gatewayHeaders();
    headers["content-type"] = contentType;
    return { method: "POST", headers, body: raw, cache: "no-store" };
  };

  // Retry transient stale-connection failures. EPIPE / ECONNRESET /
  // UND_ERR_SOCKET on a pooled keep-alive socket mean undici reused a connection
  // the gateway had already closed — the request never reached the gateway, so
  // retrying on a fresh connection is safe and idempotent here.
  const url = `${GATEWAY_URL}/api/v1/kb/documents`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, buildInit());
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "application/json" },
      });
    } catch (err) {
      lastErr = err;
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      const retriable = code === "EPIPE" || code === "ECONNRESET" || code === "UND_ERR_SOCKET";
      if (!retriable) break;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }

  const cause = (lastErr as { cause?: { code?: string; message?: string } })?.cause;
  const detail = `${lastErr instanceof Error ? lastErr.message : lastErr}${
    cause ? ` (cause: ${cause.code || cause.message || JSON.stringify(cause)})` : ""
  }`;
  console.error("[kb/ingest] gateway fetch failed after retries:", detail);
  return Response.json({ error: "gateway_unreachable", detail }, { status: 502 });
}
