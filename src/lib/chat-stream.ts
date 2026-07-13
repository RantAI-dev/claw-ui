// Parses the SSE stream from /api/chat (which relays the gateway's agent/chat
// event-stream). Each SSE frame is `data: <json>` with a discriminated `type`.
import type { ChatEvent } from "./types";

export interface ChatRequest {
  message: string;
  model?: string;
  provider?: string;
  temperature?: number;
  /** When set, the backend continues this session (multi-turn) instead of forking a new one. */
  session_id?: string;
}

/**
 * POSTs a chat request and yields parsed events until `done`. Pass an
 * AbortSignal to support Stop.
 */
export async function streamChat(
  req: ChatRequest,
  onEvent: (ev: ChatEvent) => void,
  signal?: AbortSignal,
  // Bail if no bytes (not even a keep-alive) arrive for this long. The gateway
  // sends SSE keep-alives (~15s), so a longer silence means the connection is
  // dead (crash / sleep / network partition) rather than a slow tool.
  inactivityMs = 60_000,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j?.detail || j?.error || detail;
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message: `Gateway error (${res.status}): ${detail}` });
    onEvent({ type: "done", text: "", cancelled: false });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Read one chunk, but never wait longer than `inactivityMs` for it, so a dead
  // connection can't hang the "streaming" bubble forever.
  const readChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (inactivityMs <= 0) return reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stall = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Response stream stalled — no data received.")), inactivityMs);
    });
    try {
      return await Promise.race([reader.read(), stall]);
    } finally {
      clearTimeout(timer);
    }
  };

  // Track whether the server already delivered a real `error` frame, so the
  // synthetic "stream ended" fallback below doesn't clobber a specific cause.
  let sawError = false;
  try {
    while (true) {
      const { done, value } = await readChunk();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line — tolerate both LF and CRLF
      // (an intermediary proxy may rewrite line endings).
      while (true) {
        const lf = buffer.indexOf("\n\n");
        const crlf = buffer.indexOf("\r\n\r\n");
        if (lf === -1 && crlf === -1) break;
        let sep: number;
        let stride: number;
        if (crlf === -1 || (lf !== -1 && lf < crlf)) {
          sep = lf;
          stride = 2;
        } else {
          sep = crlf;
          stride = 4;
        }
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + stride);
        const dataLine = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!dataLine) continue;
        try {
          const ev = JSON.parse(dataLine) as ChatEvent;
          if (ev.type === "error") sawError = true;
          onEvent(ev);
          if (ev.type === "done") return;
        } catch {
          // Non-JSON keep-alive or comment — ignore.
        }
      }
    }
    // Reached only when the stream closed without a `done` event — the server
    // dropped the connection mid-turn. Synthesize a terminal pair so the
    // assistant bubble stops "streaming" and the interruption is visible — but
    // don't overwrite a real `error` frame the server already delivered.
    if (!sawError) onEvent({ type: "error", message: "The response stream ended before completing." });
    onEvent({ type: "done", text: "", cancelled: false });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      onEvent({ type: "done", text: "", cancelled: true });
      return;
    }
    // Release the reader (e.g. on the inactivity timeout, where the underlying
    // read is still pending) so the dead connection is torn down.
    await reader.cancel().catch(() => {});
    onEvent({ type: "error", message: String(err instanceof Error ? err.message : err) });
    onEvent({ type: "done", text: "", cancelled: false });
  }
}
