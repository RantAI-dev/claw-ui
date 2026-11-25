import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./chat-stream";
import type { ChatEvent } from "./types";

const SENTENCE = "The provider rejected its API key; update the key in Providers.";
const DETAIL = "provider example.com rejected the credential (HTTP 401)";
const REJECTED_KEY_MESSAGE = `${SENTENCE} (${DETAIL})`;

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
  it("does not swallow an exception thrown by the event handler as a bad frame", async () => {
    // A handler bug must surface, not be misread as malformed JSON (which left
    // the stream running with corrupt state).
    stubFetch([frame({ type: "chunk", text: "hi" })]);
    const boom = new Error("handler blew up");
    await expect(
      streamChat({ message: "x" }, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

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

  it("keeps a real error frame and does not clobber it when the stream closes without a done", async () => {
    // The gateway emitted a specific error, then dropped the socket (no `done`).
    stubFetch([frame({ type: "error", message: "provider rate limited" })]);
    const events = await collect();
    const errors = events.filter((e) => e.type === "error") as Extract<ChatEvent, { type: "error" }>[];
    expect(errors.some((e) => e.message === "provider rate limited")).toBe(true);
    // The synthetic "ended before completing" fallback must NOT overwrite it.
    expect(errors.some((e) => e.message.includes("ended before completing"))).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("names a rejected key and shows the gateway detail when the SSE error carries the auth-failed code", async () => {
    // The gateway prefixes the SSE error message with the exact `provider_auth_failed`
    // code. The code is not a detail: the operator must see the shared sentence and
    // the credential failure text that follows it.
    stubFetch([frame({ type: "error", message: `provider_auth_failed: ${DETAIL}` })]);
    const events = await collect();
    const errors = events.filter((e) => e.type === "error") as Extract<ChatEvent, { type: "error" }>[];
    expect(errors.some((e) => e.message === REJECTED_KEY_MESSAGE)).toBe(true);
  });

  it("names a rejected key and shows the gateway detail when a 502 answer carries the auth-failed code", async () => {
    // Before the stream starts there is no SSE frame: the rejection is a 502 body
    // with the code in `error` and the reason in `detail`.
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: "provider_auth_failed", detail: DETAIL }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );
    const events = await collect();
    const errors = events.filter((e) => e.type === "error") as Extract<ChatEvent, { type: "error" }>[];
    expect(errors.some((e) => e.message === `Gateway error (502): ${REJECTED_KEY_MESSAGE}`)).toBe(true);
  });

  it("keeps another stream error's own text unchanged", async () => {
    // Only the exact auth-failed code triggers the sentence; a different failure
    // must reach the operator verbatim.
    const message = "provider rate limited; retry shortly";
    stubFetch([frame({ type: "error", message })]);
    const events = await collect();
    const errors = events.filter((e) => e.type === "error") as Extract<ChatEvent, { type: "error" }>[];
    expect(errors.some((e) => e.message === message)).toBe(true);
    expect(errors.some((e) => e.message.includes("rejected its API key"))).toBe(false);
  });

  it("rejects when the request fails before the stream starts", async () => {
    // Stop-before-first-byte / network failure: the fetch throws outside
    // streamChat's try block, so the promise must reject — the contract
    // runAssistant's try/finally relies on to clean up the UI.
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    await expect(streamChat({ message: "hi" }, () => {}, undefined)).rejects.toThrow("network down");
  });
});
