import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./chat-stream";
import type { ChatEvent } from "./types";

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Stub global fetch with a Response whose body streams `frames`. When `hang`
 *  is set the stream never closes (models a dead/half-open connection). */
function stubFetch(frames: string[], opts: { hang?: boolean } = {}): void {
  vi.stubGlobal("fetch", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(enc.encode(f));
        if (!opts.hang) controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  });
}

async function collect(signal?: AbortSignal, inactivityMs?: number): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  await streamChat({ message: "hi" }, (ev) => events.push(ev), signal, inactivityMs);
  return events;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamChat", () => {
  it("emits the parsed done event when the stream terminates cleanly", async () => {
    stubFetch([frame({ type: "chunk", text: "hello" }), frame({ type: "done", text: "hello", cancelled: false })]);
    const events = await collect();
    expect(events.map((e) => e.type)).toEqual(["chunk", "done"]);
  });

  it("synthesizes a terminal error+done when the stream closes without a done event", async () => {
    // Server sent a chunk then dropped the connection (crash / proxy timeout).
    stubFetch([frame({ type: "chunk", text: "partial" })]);
    const events = await collect();
    expect(events.some((e) => e.type === "error")).toBe(true);
    // The last event must be `done` so the assistant bubble stops "streaming".
    expect(events.at(-1)?.type).toBe("done");
  });

  it("gives up with error+done when no bytes arrive within the inactivity window", async () => {
    // A half-open connection: bytes never arrive and the stream never closes.
    stubFetch([], { hang: true });
    const events = await collect(undefined, 40);
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });
});
