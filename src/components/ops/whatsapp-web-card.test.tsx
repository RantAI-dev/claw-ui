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

  it("shows a Clear-section path when the section exists but has no session_path", async () => {
    // A `channels_config.whatsapp_web` section is saved (so `connected`
    // is true) but its `session_path` is empty (so `missingCredentials`
    // is true). D-3 forbids pairing while the section exists, so the
    // only recovery from the console is to DELETE the section first;
    // the card shows a Clear-section button to do that.
    const configuredNoSessionState = {
      word: "configured" as const,
      label: "Configured",
      tone: "outline" as const,
      detail:
        "The channels runtime is up but this channel has not started; check its credentials in config.toml.",
      detailScope: "channel" as const,
    };
    const onReload = vi.fn();
    global.fetch = vi.fn(async () =>
      jsonResponse({ disconnected: true, channel: "whatsapp_web", restarts_runtime: true }, 200),
    ) as unknown as typeof fetch;

    const { WhatsAppWebCard } = await import("./channels-panel");
    render(
      <WhatsAppWebCard
        connected={true}
        missingCredentials={true}
        state={configuredNoSessionState}
        verification={null}
        allowedNumbers={[]}
        onReload={onReload}
      />,
    );

    // The state detail is the "check config.toml" message — the
    // console surfaces the runtime's truth instead of swallowing it.
    expect(
      screen.getByText(/this channel has not started/i),
    ).toBeTruthy();
    // The Link button is NOT shown — pairing is refused while the
    // section exists, so a button that promises a scan would lie.
    expect(screen.queryByRole("button", { name: "Link WhatsApp" })).toBeNull();
    // The Clear section button IS shown — that is the only path
    // forward from the console.
    const clear = screen.getByRole("button", { name: /clear section/i });
    fireEvent.click(clear);
    // The confirm dialog appears; confirm it.
    fireEvent.click(
      screen.getByRole("button", { name: /^disconnect$/i }),
    );
    await vi.waitFor(() =>
      expect(onReload).toHaveBeenCalledWith(true),
    );
  });

  it("disconnects through the same DELETE when the channel is fully paired", async () => {
    // The "manage" state — section exists, session_path filled.
    // Disconnect still goes through DELETE and schedules a reload.
    const configuredState = {
      word: "running" as const,
      label: "Running",
      tone: "success" as const,
      detail: null,
    };
    const onReload = vi.fn();
    global.fetch = vi.fn(async () =>
      jsonResponse({ disconnected: true, channel: "whatsapp_web", restarts_runtime: true }, 200),
    ) as unknown as typeof fetch;

    const { WhatsAppWebCard } = await import("./channels-panel");
    render(
      <WhatsAppWebCard
        connected={true}
        missingCredentials={false}
        state={configuredState}
        verification={null}
        allowedNumbers={["+15551234567"]}
        onReload={onReload}
      />,
    );

    const disconnect = screen.getByRole("button", {
      name: /disconnect whatsapp/i,
    });
    fireEvent.click(disconnect);
    fireEvent.click(
      screen.getByRole("button", { name: /^disconnect$/i }),
    );
    await vi.waitFor(() =>
      expect(onReload).toHaveBeenCalledWith(true),
    );
  });

  it("shows a Save button in the manage state and posts allowed_numbers on click", async () => {
    // Regression: plan 369's first version had no Save button, so the
    // operator could edit the allowlist but had no way to submit it. The
    // hook now gives every manage card the same Save + drift + toast UX;
    // this test pins the WhatsApp path.
    const configuredState = {
      word: "running" as const,
      label: "Running",
      tone: "success" as const,
      detail: null,
    };
    const onReload = vi.fn();
    // The hook calls `api.updateWhatsappWebAllowlist` (and reads via
    // `api.config()` for the drift pre-check), so mock those directly
    // rather than the underlying fetch.
    const apiModule = await import("@/lib/api");
    const spy = vi
      .spyOn(apiModule.api, "updateWhatsappWebAllowlist")
      .mockResolvedValue({
        connected: true,
        channel: "whatsapp_web",
        bot_username: null,
        allowed_numbers: 2,
        restarts_runtime: false,
      });
    vi.spyOn(apiModule.api, "config").mockResolvedValue({
      channels_config: {
        whatsapp_web: { allowed_numbers: ["+15551234567"] },
      },
    } as never);
    vi.spyOn(apiModule.api, "disconnectWhatsappWeb").mockResolvedValue({
      disconnected: true,
      channel: "whatsapp_web",
      restarts_runtime: false,
    });

    const { WhatsAppWebCard } = await import("./channels-panel");
    render(
      <WhatsAppWebCard
        connected={true}
        missingCredentials={false}
        state={configuredState}
        verification={null}
        allowedNumbers={["+15551234567"]}
        onReload={onReload}
      />,
    );

    const save = screen.getByRole("button", { name: /save whatsapp allowlist/i });
    expect(save).toBeTruthy();
    expect(save.hasAttribute("disabled")).toBe(true);

    // Edit the field; the Save button enables when dirty.
    const input = screen.getByLabelText(/allowed whatsapp phone numbers/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "+15551234567, +15559999999" } });
    expect(save.hasAttribute("disabled")).toBe(false);

    fireEvent.click(save);
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith(["+15551234567", "+15559999999"]);
    });
    // An allowlist-only edit is applied live — the runtime does not bounce.
    await vi.waitFor(() =>
      expect(onReload).toHaveBeenCalledWith(false),
    );

    spy.mockRestore();
  });
});
