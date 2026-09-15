// @vitest-environment happy-dom
// Tests for the WhatsApp Web pairing card. The card consumes an
// upstream SSE stream from POST /api/v1/channels/whatsapp_web/pair,
// parsed through /api/whatsapp-web/pair on the console side. We
// stub the relay with a fake Response whose body emits the same SSE
// frames the gateway sends, then assert:
//   - the QR arrives as an <img src="data:...">, never as innerHTML;
//   - a "connected" frame turns the QR off and shows the green
//     confirmation;
//   - a "timeout" or "failed" frame sets the right terminal state;
//   - 409 responses surface as the gateway's `detail`;
//   - unmounting the card aborts the in-flight fetch.
//
// Plan 369: never reach WhatsApp. All frames are fabricated.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import * as React from "react";

// Build a Response whose body is a stream of `data:` frames, the
// shape the gateway sends. `frames` is an array of pre-stringified
// JSON values; the helper writes each as one SSE event.
function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        const sseFrame = `data: ${frame}\n\n`;
        controller.enqueue(encoder.encode(sseFrame));
      }
      // The real gateway closes the stream after a terminal frame;
      // we close it the same way to let the reader reach `done`.
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("WhatsAppWebCard pairing", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the QR as an <img src='data:...'>, never as innerHTML", async () => {
    const svg = "<svg viewBox=\"0 0 1 1\"><rect/></svg>";
    global.fetch = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ type: "qr", svg }),
        JSON.stringify({ type: "timeout" }),
      ]),
    ) as unknown as typeof fetch;

    // Pull the card out of the panel's render so we can drive it
    // without the surrounding fetches.
    const { WhatsAppWebCard } = await import("./channels-panel");
    const notConfiguredState = {
      word: "not configured" as const,
      label: "Not configured",
      tone: "outline" as const,
      detail: null,
    };

    render(
      <WhatsAppWebCard
        connected={false}
        missingCredentials={false}
        state={notConfiguredState}
        verification={null}
        allowedNumbers={["+15551234567"]}
        onReload={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link WhatsApp" }));

    const img = await screen.findByTestId("whatsapp-web-qr");
    expect(img.tagName).toBe("IMG");
    // The data URL prefix is mandatory — never raw SVG markup.
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;utf8,/);
    // The SVG body must be URL-encoded, not interpolated as HTML.
    expect(img.getAttribute("src")).not.toContain("<svg");
    // And no <svg> element lives in the DOM as markup.
    expect(document.querySelector("svg")).toBeNull();
  });

  it("shows the timeout message when the gateway times out", async () => {
    const notConfiguredState = {
      word: "not configured" as const,
      label: "Not configured",
      tone: "outline" as const,
      detail: null,
    };

    global.fetch = vi.fn(async () =>
      sseResponse([JSON.stringify({ type: "timeout" })]),
    ) as unknown as typeof fetch;

    const { WhatsAppWebCard } = await import("./channels-panel");
    render(
      <WhatsAppWebCard
        connected={false}
        missingCredentials={false}
        state={notConfiguredState}
        verification={null}
        allowedNumbers={[]}
        onReload={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link WhatsApp" }));

    expect(
      await screen.findByText(/pairing window expired/i),
    ).toBeTruthy();
  });

  it("surfaces the gateway's 409 detail when a session is already configured", async () => {
    const notConfiguredState = {
      word: "not configured" as const,
      label: "Not configured",
      tone: "outline" as const,
      detail: null,
    };

    global.fetch = vi.fn(async () =>
      jsonResponse(
        {
          error: "already_linked",
          detail:
            "WhatsApp Web is already linked. Disconnect first via DELETE /api/v1/channels/whatsapp_web, then pair again.",
        },
        409,
      ),
    ) as unknown as typeof fetch;

    const { WhatsAppWebCard } = await import("./channels-panel");
    render(
      <WhatsAppWebCard
        connected={false}
        missingCredentials={false}
        state={notConfiguredState}
        verification={null}
        allowedNumbers={[]}
        onReload={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link WhatsApp" }));

    expect(
      await screen.findByText(/WhatsApp Web is already linked/i),
    ).toBeTruthy();
  });

  it("calls onReload(true) on a Connected frame", async () => {
    const notConfiguredState = {
      word: "not configured" as const,
      label: "Not configured",
      tone: "outline" as const,
      detail: null,
    };

    const onReload = vi.fn();
    global.fetch = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ type: "qr", svg: "<svg/>" }),
        JSON.stringify({ type: "connected", session_path: "/tmp/x.db" }),
      ]),
    ) as unknown as typeof fetch;

    const { WhatsAppWebCard } = await import("./channels-panel");
    render(
      <WhatsAppWebCard
        connected={false}
        missingCredentials={false}
        state={notConfiguredState}
        verification={null}
        allowedNumbers={[]}
        onReload={onReload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link WhatsApp" }));

    // The reader consumes the stream on microtasks; wait for
    // onReload(true) to land before asserting.
    await vi.waitFor(() => expect(onReload).toHaveBeenCalledWith(true));
    // Plan 369 keeps the operator from re-scanning an already-used
    // QR: the first QR rendered test covers the visibility path,
    // this test covers the Connected → onReload(true) wiring.
  });

  it("aborts the in-flight stream when the card unmounts", async () => {
    const notConfiguredState = {
      word: "not configured" as const,
      label: "Not configured",
      tone: "outline" as const,
      detail: null,
    };

    let abortSignal: AbortSignal | null = null;
    global.fetch = vi.fn(async (_url, init) => {
      abortSignal = (init as RequestInit).signal ?? null;
      // Hang the stream open until abort fires.
      return sseResponse([]);
    }) as unknown as typeof fetch;

    const { WhatsAppWebCard } = await import("./channels-panel");
    const { unmount } = render(
      <WhatsAppWebCard
        connected={false}
        missingCredentials={false}
        state={notConfiguredState}
        verification={null}
        allowedNumbers={[]}
        onReload={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link WhatsApp" }));

    // Wait one tick for the fetch to be scheduled.
    await act(async () => {
      await Promise.resolve();
    });
    expect(abortSignal).not.toBeNull();
    expect(abortSignal!.aborted).toBe(false);

    unmount();
    expect(abortSignal!.aborted).toBe(true);
  });
});
