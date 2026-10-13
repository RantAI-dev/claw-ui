// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PendingApproval } from "@/hooks/use-chat";

// The modal is the footer of ConsoleShell, driven by `useChat`. Mock the hook
// to hand the shell one pending approval and record every resolveApproval call.
const resolveApproval = vi.fn();
let pending: PendingApproval | null = null;

vi.mock("@/hooks/use-chat", () => ({
  useChat: () => ({
    messages: [],
    isStreaming: false,
    pending: false,
    sessionId: null,
    conversationId: "conv-1",
    pendingApproval: pending,
    resolveApproval,
    send: vi.fn(),
    stop: vi.fn(),
    regenerate: vi.fn(),
    reset: vi.fn(),
    loadHistory: vi.fn(),
    totals: { tokens: null, cost: null },
  }),
}));

// Everything else the shell mounts is out of scope for the modal: stub the
// API surface to resolve empty so the shell renders without a gateway.
vi.mock("@/lib/api", () => {
  const never = () => new Promise(() => {});
  const empty = async () => ({});
  return {
    describeApiError: (e: unknown) => String(e),
    api: new Proxy(
      {},
      { get: () => (...args: unknown[]) => (args.length ? never() : empty()) },
    ),
  };
});
vi.mock("@/hooks/use-gateway-status", () => ({
  useGatewayStatus: () => ({
    status: null,
    connection: "online",
    error: null,
    needsAuth: false,
    refresh: vi.fn(),
  }),
}));

import { ConsoleShell } from "./console-shell";

function approval(alwaysAvailable?: boolean): PendingApproval {
  return { id: "ap-1", tool: "shell", args: { cmd: "ls" }, alwaysAvailable };
}

beforeEach(() => {
  resolveApproval.mockClear();
  pending = null;
  // Node's own localStorage shadows happy-dom's and is empty under this Node
  // version; the shell reads it on mount.
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  // The shell's mount reads /api/auth/status; keep it off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })),
  );
  vi.stubGlobal(
    "matchMedia",
    () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tool approval modal", () => {
  it("hides Always when the gateway says it will not hold", () => {
    pending = approval(false);
    render(<ConsoleShell />);
    expect(screen.queryByRole("button", { name: "Always" })).toBeNull();
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("answers Deny and Approve without Always when the answer is unavailable", () => {
    pending = approval(false);
    render(<ConsoleShell />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(resolveApproval).toHaveBeenCalledWith("ap-1", false);
    expect(resolveApproval).toHaveBeenCalledWith("ap-1", true);
    for (const call of resolveApproval.mock.calls) expect(call[2]).not.toBe(true);
  });

  it("shows Always when the gateway says it holds", () => {
    pending = approval(true);
    render(<ConsoleShell />);
    fireEvent.click(screen.getByRole("button", { name: "Always" }));
    expect(resolveApproval).toHaveBeenCalledWith("ap-1", true, true);
  });

  it("shows Always when an older gateway omits the field", () => {
    pending = approval(undefined);
    render(<ConsoleShell />);
    fireEvent.click(screen.getByRole("button", { name: "Always" }));
    expect(resolveApproval).toHaveBeenCalledWith("ap-1", true, true);
  });
});
