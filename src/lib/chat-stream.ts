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

  try {
    while (true) {
      const { done, value } = await reader.read();
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
          onEvent(ev);
          if (ev.type === "done") return;
        } catch {
          // Non-JSON keep-alive or comment — ignore.
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      onEvent({ type: "done", text: "", cancelled: true });
      return;
    }
    onEvent({ type: "error", message: String(err instanceof Error ? err.message : err) });
    onEvent({ type: "done", text: "", cancelled: false });
  }
}
