// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChatEvent } from "@/lib/types";

// Capture what streamChat is called with, and expose its onEvent so the test
// can drive events deterministically. The returned promise stays pending (the
// stream is "open") until the test resolves it.
let lastReq: Record<string, unknown> | null = null;
let onEventCb: ((ev: ChatEvent) => void) | null = null;
let resolveStream: (() => void) | null = null;

vi.mock("@/lib/chat-stream", () => ({
  streamChat: vi.fn(
    (req: Record<string, unknown>, onEvent: (ev: ChatEvent) => void) => {
      lastReq = req;
      onEventCb = onEvent;
      return new Promise<void>((res) => {
        resolveStream = res;
      });
    },
  ),
}));

const resolveApprovalMock = vi.fn(
  async (_id: string, _approve: boolean, _always?: boolean) => ({}),
);
vi.mock("@/lib/api", () => ({
  api: {
    resolveApproval: (id: string, approve: boolean, always?: boolean) =>
      resolveApprovalMock(id, approve, always),
  },
}));

import { useChat } from "./use-chat";

beforeEach(() => {
  lastReq = null;
  onEventCb = null;
  resolveStream = null;
  resolveApprovalMock.mockClear();
});

afterEach(() => {
  // Let any pending stream promise settle so it does not leak between tests.
  resolveStream?.();
});

describe("useChat", () => {
  it("sends retrieved context in the structured field, not inside message", async () => {
    const { result } = renderHook(() =>
      useChat({
        retrieveContext: async () => ({
          context: "SECRET_DOC_TEXT",
          sources: ["doc.md"],
        }),
      }),
    );

    // Fire send (do NOT await — the mocked stream stays open).
    act(() => {
      void result.current.send("what does the doc say?");
    });

    await waitFor(() => expect(lastReq).not.toBeNull());
    expect(lastReq!.context).toBe("SECRET_DOC_TEXT");
    expect(String(lastReq!.message)).toContain("what does the doc say?");
    expect(String(lastReq!.message)).not.toContain("SECRET_DOC_TEXT");
  });

  it("sends the render mode as a field instead of decorating the message", async () => {
    const { result } = renderHook(() => useChat({ renderMode: "gui" }));

    act(() => {
      void result.current.send("show me the numbers");
    });
    await waitFor(() => expect(lastReq).not.toBeNull());

    expect(lastReq!.render_mode).toBe("gui");
    // The gateway persists `message` verbatim. Appending the instruction to it
    // stored the instruction as part of the user's turn and replayed it on
    // every later turn — including after the user switched back to markdown.
    expect(String(lastReq!.message)).toBe("show me the numbers");
    expect(String(lastReq!.message)).not.toContain("RENDER MODE");
  });

  it("sends no render mode in markdown", async () => {
    const { result } = renderHook(() => useChat({ renderMode: "md" }));

    act(() => {
      void result.current.send("plain question");
    });
    await waitFor(() => expect(lastReq).not.toBeNull());

    expect(lastReq!.render_mode).toBeUndefined();
    expect(String(lastReq!.message)).toBe("plain question");
  });

  it("sends only the new turn — the gateway owns conversation history", async () => {
    const { result } = renderHook(() => useChat({}));

    // Turn one.
    act(() => {
      void result.current.send("first question");
    });
    await waitFor(() => expect(onEventCb).not.toBeNull());
    act(() => {
      onEventCb!({ type: "chunk", text: "first answer" });
      onEventCb!({
        type: "done",
        text: "first answer",
        cancelled: false,
        session_id: "s1",
      });
    });
    act(() => {
      resolveStream?.();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Turn two.
    lastReq = null;
    act(() => {
      void result.current.send("second question");
    });
    await waitFor(() => expect(lastReq).not.toBeNull());

    const sent = String(lastReq!.message);
    expect(sent).toContain("second question");
    // The console used to prepend a transcript of prior turns. The gateway
    // replays a continued session's stored messages itself, so sending it too
    // doubled the history AND — because the gateway persists the message
    // verbatim — stored the blob inside the user message to be replayed again.
    expect(sent).not.toContain("<<<CONVERSATION_SO_FAR>>>");
    expect(sent).not.toContain("first question");
    expect(sent).not.toContain("first answer");
  });

  it("queues two approval requests and resolves them in order", async () => {
    const { result } = renderHook(() => useChat({}));
    act(() => {
      void result.current.send("go");
    });
    await waitFor(() => expect(onEventCb).not.toBeNull());

    act(() => {
      onEventCb!({ type: "approval_request", id: "a1", tool: "shell", args: {} });
      onEventCb!({ type: "approval_request", id: "a2", tool: "http", args: {} });
    });
    expect(result.current.pendingApproval?.id).toBe("a1");

    await act(async () => {
      await result.current.resolveApproval("a1", true);
    });
    expect(result.current.pendingApproval?.id).toBe("a2");
  });

  it("dismisses a modal on an approval_resolved event", async () => {
    const { result } = renderHook(() => useChat({}));
    act(() => {
      void result.current.send("go");
    });
    await waitFor(() => expect(onEventCb).not.toBeNull());

    act(() => {
      onEventCb!({ type: "approval_request", id: "x1", tool: "shell", args: {} });
    });
    expect(result.current.pendingApproval?.id).toBe("x1");

    act(() => {
      onEventCb!({ type: "approval_resolved", id: "x1", approved: false, timed_out: true });
    });
    expect(result.current.pendingApproval).toBeNull();
  });
});
