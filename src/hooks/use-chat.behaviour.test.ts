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
