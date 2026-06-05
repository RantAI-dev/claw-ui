// Dedicated multipart proxy for KB ingest: forwards an uploaded file to
// <gateway>/api/v1/kb/documents as multipart/form-data. The generic /api/rc
// proxy only relays JSON, so document ingest needs this route.
//
// The incoming request carries `file` (a File) + `session` (the client-generated
// conversation id used as the KB category for per-chat scoping).
import { NextRequest } from "next/server";
import { GATEWAY_URL, gatewayHeaders } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (gateway caps at 32 MB; stay under it)

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "file_too_large", detail: `Max ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const session = String(form.get("session") || "").trim();
  const title = String(form.get("title") || "").trim();

  // Build the upstream multipart request fresh per attempt, so a retry gets a
  // clean body and a new connection. We intentionally do NOT forward
  // `req.signal` — a long embed shouldn't be aborted if the browser's request
  // signal renews. Content-type is stripped so fetch sets the multipart boundary.
  const buildInit = (): RequestInit => {
    const out = new FormData();
    out.append("file", file, file.name);
    if (session) out.append("categories", session);
    if (title) out.append("title", title);
    const headers = gatewayHeaders();
    delete headers["content-type"];
    return { method: "POST", headers, body: out, cache: "no-store" };
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
