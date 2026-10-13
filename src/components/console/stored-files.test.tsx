// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// A conversation reopened from the rail keeps the files it stored. The shell
// loads the session through the real `useChat`; the network edges are mocked:
// the session detail, the KB document list, and the KB search (retrieval).
const kbSearch = vi.fn(
  async (_query: string, _conversationId: string, _groups?: string[]) => ({
    context: "",
    sources: [],
  }),
);
let listResult: { document_id: string; title: string }[] = [];
let listImpl: () => Promise<{ document_id: string; title: string }[]> = async () => listResult;

vi.mock("@/lib/attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attachments")>()),
  kbSearch: (q: string, c: string, g?: string[]) => kbSearch(q, c, g),
  listConversationFiles: () => listImpl(),
  ingestFile: vi.fn(),
}));

const SESSION_ID = "11111111-2222-4333-8444-555555555555";
vi.mock("@/lib/api", () => {
  const never = () => new Promise(() => {});
  const empty = async () => ({});
  return {
    describeApiError: (e: unknown) => String(e),
    api: new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "session")
            return async (id: string) => ({
              id,
              title: "old",
              messages: [{ role: "user", content: "earlier question", timestamp: "" }],
            });
          if (prop === "sessions") return async () => ({ sessions: [{ id: SESSION_ID, title: "old", message_count: 1 }] });
          return (...args: unknown[]) => (args.length ? never() : empty());
        },
      },
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

beforeEach(() => {
  kbSearch.mockClear();
  listResult = [];
  listImpl = async () => listResult;
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal(
    "matchMedia",
    () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Open the stored session the way a deep link does, then wait for it to load. */
async function openStoredSession() {
  render(<ConsoleShell initialSessionId={SESSION_ID} />);
  await waitFor(() => expect(screen.getByText("earlier question")).toBeTruthy());
}

/** Send one message in the composer and wait for the send to reach the retriever. */
async function sendMessage(text: string) {
  const box = screen.getByRole("textbox", { name: /^Message / });
  fireEvent.change(box, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(box, { key: "Enter" });
  });
}

describe("a reopened conversation keeps its stored files", () => {
  it("shows the stored files as composer chips after the session loads", async () => {
    listResult = [{ document_id: "d1", title: "attach-probe.md" }];
    await openStoredSession();
    await waitFor(() => expect(screen.getByText("attach-probe.md")).toBeTruthy());
  });

  it("shows restored files as ready without a chunk count", async () => {
    listResult = [{ document_id: "d1", title: "attach-probe.md" }];
    await openStoredSession();
    await waitFor(() => expect(screen.getByText("attach-probe.md")).toBeTruthy());
    // The list answer carries no chunk count, so a restored chip must not claim one.
    expect(screen.queryByText(/chunk/)).toBeNull();
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("retrieves from the stored files on send, scoped to the session id", async () => {
    listResult = [{ document_id: "d1", title: "attach-probe.md" }];
    await openStoredSession();
    await waitFor(() => expect(screen.getByText("attach-probe.md")).toBeTruthy());

    await sendMessage("what does the probe say?");
    await waitFor(() => expect(kbSearch).toHaveBeenCalled());
    expect(kbSearch.mock.calls[0][1]).toBe(SESSION_ID);
  });

  it("a new chat shows no files and makes no list request", async () => {
    const list = vi.fn(async () => [{ document_id: "d1", title: "attach-probe.md" }]);
    listImpl = list;
    render(<ConsoleShell />);
    await act(async () => {});
    expect(screen.queryByText("attach-probe.md")).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("does not retrieve when the conversation has no stored files", async () => {
    listResult = [];
    await openStoredSession();

    await sendMessage("plain question");
    await waitFor(() => expect(screen.getByText("plain question")).toBeTruthy());
    expect(kbSearch).not.toHaveBeenCalled();
  });

  it("opens and sends without an error dialog when the list request fails", async () => {
    // listConversationFiles never rejects: a failed request is an empty list.
    listImpl = async () => [];
    await openStoredSession();
    expect(screen.queryByRole("dialog")).toBeNull();

    await sendMessage("still works");
    await waitFor(() => expect(screen.getByText("still works")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
