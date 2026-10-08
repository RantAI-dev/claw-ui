// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MemoryEntry, SearchResult, SessionSummary } from "@/lib/types";

const memory = vi.fn();
const memoryStats = vi.fn();
const getMemory = vi.fn();
const addMemory = vi.fn();
const deleteMemory = vi.fn();
const sessions = vi.fn();
const searchSessions = vi.fn();
const session = vi.fn();
const deleteSession = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastMessage = vi.fn();

// Keep the real `ApiError` / `describeApiError`; only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    memory: (...a: unknown[]) => memory(...a),
    memoryStats: () => memoryStats(),
    getMemory: (key: string) => getMemory(key),
    addMemory: (body: unknown) => addMemory(body),
    deleteMemory: (key: string) => deleteMemory(key),
    sessions: (...a: unknown[]) => sessions(...a),
    searchSessions: (...a: unknown[]) => searchSessions(...a),
    session: (id: string) => session(id),
    deleteSession: (id: string) => deleteSession(id),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

import { ApiError } from "@/lib/api";
import { MemoryPanel } from "./memory-panel";

const UUID = "5a2b4873-e2a4-444d-b223-29b572d60755";

function entry(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    key: "deploy-window",
    category: "core",
    content: "Deploys go out on Tuesdays after the 14:00 standup.",
    timestamp: "2026-09-01T09:22:14.499489656+00:00",
    session_id: null,
    ...over,
  };
}

function page(entries: MemoryEntry[], total = entries.length) {
  return { entries, count: entries.length, total, listed: entries.length, offset: 0 };
}

function sessionPage(rows: SessionSummary[]) {
  return { sessions: rows, count: rows.length, offset: 0, total: rows.length };
}

function recording(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "sess-a1",
    title: "Pricing question",
    model: "model-a",
    started_at: "2026-10-01T10:00:00+00:00",
    ended_at: null,
    message_count: 6,
    source: "channel",
    conversation_key: "telegram:team-room",
    surface: "telegram",
    place: "team-room",
    thread: null,
    last_activity_at: "2026-10-02T10:00:00+00:00",
    ...over,
  };
}

const ROWS = [
  entry(),
  entry({ key: "team/alpha notes", content: "Slash key test" }),
  entry({ key: `memory_${UUID}`, content: "Unnamed fact about the staging database." }),
];

function notFound() {
  return new ApiError("no memory with key", 404, { error: "not_found" });
}

async function fillRemember(content: string, name?: string) {
  const box = await screen.findByLabelText("What to remember");
  fireEvent.change(box, { target: { value: content } });
  if (name !== undefined) {
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: name } });
  }
}

beforeEach(() => {
  memory.mockResolvedValue(page(ROWS));
  memoryStats.mockResolvedValue({ backend: "sqlite", total_entries: 3, healthy: true });
  getMemory.mockRejectedValue(notFound());
  addMemory.mockResolvedValue({ key: "deploy-window", stored: true, notes: [] });
  deleteMemory.mockResolvedValue({ key: "deploy-window", removed: true });
  sessions.mockResolvedValue(sessionPage([]));
  searchSessions.mockResolvedValue({ results: [], count: 0 });
  session.mockResolvedValue({ id: "sess-a1", title: "Pricing question", model: null, started_at: null, messages: [] });
  deleteSession.mockResolvedValue({ deleted: true, id: "sess-a1", conversation_key: "telegram:team-room", sessions_removed: 2 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MemoryPanel: Remember", () => {
  it("stores directly under a free name and names it in the toast", async () => {
    render(<MemoryPanel />);
    await fillRemember("Deploys move to Wednesdays.", "deploy-window");
    fireEvent.click(screen.getByRole("button", { name: "Remember" }));

    await waitFor(() => expect(addMemory).toHaveBeenCalledTimes(1));
    expect(getMemory).toHaveBeenCalledWith("deploy-window");
    expect(addMemory.mock.calls[0][0]).toEqual({
      content: "Deploys move to Wednesdays.",
      category: "core",
      key: "deploy-window",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Remembered as deploy-window"));
  });

  it("asks before replacing a taken name and shows what it currently says", async () => {
    getMemory.mockResolvedValue({
      key: "deploy-window",
      content: "Deploys go out on Tuesdays after the 14:00 standup.",
      category: "core",
      timestamp: null,
      session_id: null,
    });
    render(<MemoryPanel />);
    await fillRemember("Deploys move to Wednesdays.", "deploy-window");
    fireEvent.click(screen.getByRole("button", { name: "Remember" }));

    const dialog = await screen.findByRole("dialog", { name: "Replace “deploy-window”?" });
    expect(within(dialog).getByText(/Deploys go out on Tuesdays/)).toBeTruthy();
    expect(addMemory).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(addMemory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Replaced deploy-window"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("stores nothing when the replace is cancelled", async () => {
    getMemory.mockResolvedValue({ key: "deploy-window", content: "old", category: "core", timestamp: null, session_id: null });
    render(<MemoryPanel />);
    await fillRemember("new", "deploy-window");
    fireEvent.click(screen.getByRole("button", { name: "Remember" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(addMemory).not.toHaveBeenCalled();
  });

  it("sends no key for an unnamed save and never prints the generated one", async () => {
    addMemory.mockResolvedValue({ key: `memory_${UUID}`, stored: true, notes: [] });
    render(<MemoryPanel />);
    await fillRemember("The staging database is refreshed on Sundays.");
    fireEvent.click(screen.getByRole("button", { name: "Remember" }));

    await waitFor(() => expect(addMemory).toHaveBeenCalledTimes(1));
    expect(getMemory).not.toHaveBeenCalled();
    expect(addMemory.mock.calls[0][0]).not.toHaveProperty("key");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Remembered"));
  });

  it("appends the sanitizer's note as a sentence", async () => {
    addMemory.mockResolvedValue({
      key: `memory_${UUID}`,
      stored: true,
      notes: ["redacted what looked like a credential"],
    });
    render(<MemoryPanel />);
    await fillRemember("my token is sk-ant-abc");
    fireEvent.click(screen.getByRole("button", { name: "Remember" }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Remembered. Redacted what looked like a credential."),
    );
  });

  it("refuses a name with a separator before anything is sent", async () => {
    render(<MemoryPanel />);
    await fillRemember("Alpha team notes", "team/alpha");
    expect(screen.getByRole("alert").textContent).toBe("A name cannot contain / or \\.");
    const remember = screen.getByRole("button", { name: "Remember" }) as HTMLButtonElement;
    expect(remember.disabled).toBe(true);
    fireEvent.click(remember);
    expect(getMemory).not.toHaveBeenCalled();
    expect(addMemory).not.toHaveBeenCalled();
  });
});

describe("MemoryPanel: Forget", () => {
  async function openForget(name: RegExp) {
    render(<MemoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name }));
    return screen.findByRole("dialog");
  }

  it("says the memory was already gone when the gateway removed nothing", async () => {
    deleteMemory.mockResolvedValue({ key: "deploy-window", removed: false });
    const dialog = await openForget(/^Forget "Deploys go out/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Forget" }));

    await waitFor(() => expect(toastMessage).toHaveBeenCalledWith("That memory was already gone."));
    expect(toastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(memory).toHaveBeenCalledTimes(2));
  });

  it("says Forgotten when the gateway removed it", async () => {
    const dialog = await openForget(/^Forget "Deploys go out/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Forgotten"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("explains a key this console cannot address and gives the terminal line", async () => {
    const dialog = await openForget(/^Forget "Slash key test/);
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(within(dialog).getByText("This memory can't be forgotten here")).toBeTruthy();
    expect(
      within(dialog).getByText('rantaiclaw memory clear --key "team/alpha notes" --yes'),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Forget" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy command" }));
    // happy-dom has no clipboard: the fallback shows the command instead.
    await waitFor(() =>
      expect(toastMessage.mock.calls.length + toastSuccess.mock.calls.length).toBe(1),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleteMemory).not.toHaveBeenCalled();
  });

  it("closes the confirm and toasts when the delete fails", async () => {
    deleteMemory.mockRejectedValue(new ApiError("boom", 502, {}));
    const dialog = await openForget(/^Forget "Deploys go out/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(String(toastError.mock.calls[0][0])).toMatch(/^Could not forget that: /);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("MemoryPanel: list state", () => {
  it("keeps the rows and drops the range when a refresh fails", async () => {
    memory.mockResolvedValueOnce(page(ROWS)).mockRejectedValueOnce(new ApiError("boom", 502, {}));
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(screen.getByRole("heading", { name: /^Memories/ }).textContent).toContain("· 3");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/The gateway is unreachable/);
    expect(screen.getByText(/Deploys go out on Tuesdays/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Memories/ }).textContent).toBe("Memories");
  });

  it("describes a fresh store with the next step", async () => {
    memory.mockResolvedValue(page([]));
    render(<MemoryPanel />);
    await screen.findByText("No memories yet.");
    expect(screen.getByText(/Conversations are saved here too/)).toBeTruthy();
  });

  it("names a search that found nothing and clears it on request", async () => {
    memory.mockResolvedValue(page([]));
    render(<MemoryPanel />);
    await screen.findByText("No memories yet.");
    const search = screen.getByLabelText("Search memories") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "zzzz" } });
    await waitFor(() =>
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "zzzz", category: "", place: "" }),
    );
    await screen.findByText("No memories match “zzzz”.");
    // The field's X carries the same name; the empty state's button is the one with the text.
    fireEvent.click(screen.getByText("Clear search"));
    expect(search.value).toBe("");
    await screen.findByText("No memories yet.");
  });

  it("names an empty category and offers to show all", async () => {
    memory.mockResolvedValue(page([]));
    render(<MemoryPanel />);
    await screen.findByText("No memories yet.");
    const filter = screen.getByLabelText("Filter by category") as HTMLInputElement;
    fireEvent.change(filter, { target: { value: "daily" } });
    await waitFor(() =>
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "daily", place: "" }),
    );
    await screen.findByText("No daily memories.");
    fireEvent.click(screen.getByRole("button", { name: "Show all categories" }));
    expect(filter.value).toBe("");
  });

  it("offers the built-ins plus every category on screen, and filters by a typed one", async () => {
    memory.mockResolvedValue(page([entry(), entry({ key: "atlas", category: "project", content: "Atlas wants OCR first." })]));
    const { container } = render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    const options = [...container.querySelectorAll("datalist option")].map((o) =>
      (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(["core", "daily", "conversation", "project"]);
    const filter = screen.getByLabelText("Filter by category");
    fireEvent.change(filter, { target: { value: "ops" } });
    await waitFor(() =>
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "ops", place: "" }),
    );
  });

  it("says where a row came from and what it is scoped to", async () => {
    memory.mockResolvedValue(
      page([
        entry({ key: `user_msg_${UUID}`, category: "conversation", content: "Please remember the sprint review.", session_id: "4735d9b0" }),
        entry({ key: "scoped-note", content: "Scoped to one conversation only.", session_id: "sess-1" }),
        entry({ key: `memory_${UUID}`, content: "Unnamed fact." }),
      ]),
    );
    render(<MemoryPanel />);
    const auto = (await screen.findByText("Please remember the sprint review.")).closest("[data-slot=row]")!;
    expect(auto.textContent).toContain("saved from this conversation");
    expect(within(auto as HTMLElement).getByText("copy key")).toBeTruthy();
    const scoped = screen.getByText("Scoped to one conversation only.").closest("[data-slot=row]")!;
    expect(scoped.textContent).toContain("this conversation only");
    const unnamed = screen.getByText("Unnamed fact.").closest("[data-slot=row]")!;
    expect(unnamed.textContent).not.toContain("conversation");
    expect(within(unnamed as HTMLElement).getByText("copy key")).toBeTruthy();
  });

  it("shows no percent for a ranked hit", async () => {
    memory.mockResolvedValue(page([entry({ score: 0.5 })]));
    render(<MemoryPanel />);
    const row = (await screen.findByText(/Deploys go out on Tuesdays/)).closest("[data-slot=row]")!;
    expect(row.textContent).not.toContain("%");
  });

  it("disables Refresh while a refresh is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    memory.mockResolvedValueOnce(page(ROWS)).mockImplementationOnce(
      () => new Promise((r) => { release = r; }),
    );
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    const refresh = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    fireEvent.click(refresh);
    await waitFor(() => expect(refresh.disabled).toBe(true));
    release(page(ROWS));
    await waitFor(() => expect(refresh.disabled).toBe(false));
  });
});

describe("MemoryPanel: labels, names and time", () => {
  it("labels the content field so its name survives typing", async () => {
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    const box = screen.getByLabelText("What to remember") as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
  });

  it("names the key button by what it does and Show more by what it opens", async () => {
    memory.mockResolvedValue(
      page([entry({ content: "Checklist before a release:\n1. tag\n2. bump\n3. docs\n4. cut" })]),
    );
    render(<MemoryPanel />);
    await screen.findByText(/Checklist before a release/);
    expect(screen.getByRole("button", { name: "Copy key deploy-window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Show more of Checklist before a release/ })).toBeTruthy();
  });

  it("carries the absolute time on a <time> element", async () => {
    const { container } = render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    const t = container.querySelector("[data-slot=row] time") as HTMLTimeElement;
    expect(t.getAttribute("datetime")).toBe("2026-09-01T09:22:14.499Z");
    expect(t.getAttribute("title")).toBeTruthy();
  });

  it("uses the shared focus outline, never a 1px ring, and a coarse-pointer floor on the text buttons", async () => {
    const { container } = render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(container.querySelector(".focus-visible\\:ring-1")).toBeNull();
    const key = screen.getByRole("button", { name: "Copy key deploy-window" });
    expect(key.className).toContain("pointer-coarse:min-h-10");
    expect(key.className).toContain("focus-visible:outline-2");
  });

  it("shows the clear button once the search has text and clears it", async () => {
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    const search = screen.getByLabelText("Search memories") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "dep" } });
    const clear = screen.getByRole("button", { name: "Clear search" });
    expect(clear.className).toContain("pointer-coarse:min-h-10");
    fireEvent.click(clear);
    expect(search.value).toBe("");
  });
});

describe("MemoryPanel: composition", () => {
  it("opens with the verdict band from the store-wide stats", async () => {
    render(<MemoryPanel />);
    await screen.findByText("3 memories on recall");
    expect(screen.getByText("sqlite backend")).toBeTruthy();
  });

  it("warns in the band when the backend fails its health check", async () => {
    memoryStats.mockResolvedValue({ backend: "sqlite", total_entries: 3, healthy: false });
    render(<MemoryPanel />);
    await screen.findByText("Recall isn't working");
  });

  it("renders the rows as one hairline list, not a stack of cards", async () => {
    const { container } = render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    const rows = container.querySelectorAll("[data-slot=row]");
    expect(rows.length).toBe(3);
    rows.forEach((r) => expect(r.tagName).toBe("LI"));
    // One list under one card: every row shares the same <ul> parent.
    const parents = new Set([...rows].map((r) => r.parentElement));
    expect(parents.size).toBe(1);
  });

  it("refreshes the band and the list together", async () => {
    render(<MemoryPanel />);
    await screen.findByText("3 memories on recall");
    expect(memoryStats).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(memoryStats).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(memory).toHaveBeenCalledTimes(2));
  });

  it("keeps the composer as its own section beside the list", async () => {
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(screen.getByRole("heading", { name: "Remember something" })).toBeTruthy();
    expect(screen.getByLabelText("Category")).toBeTruthy();
  });
});

const NEW_STATS = {
  backend: "sqlite",
  total_entries: 5,
  healthy: true,
  mode: "hybrid",
  private_entries: 3,
  conversation_entries: 2,
  memory_md_chars: 1200,
  memory_md_max_chars: 4000,
};

describe("MemoryPanel: where a note lives", () => {
  it("shows both counts, the search mode and the MEMORY.md usage in the band", async () => {
    memoryStats.mockResolvedValue(NEW_STATS);
    render(<MemoryPanel />);
    await screen.findByText("5 memories on recall");
    expect(screen.getByText("3 private notes")).toBeTruthy();
    expect(screen.getByText("2 conversation notes")).toBeTruthy();
    expect(screen.getByText("hybrid search")).toBeTruthy();
    expect(screen.getByText("MEMORY.md 1200 / 4000 characters")).toBeTruthy();
  });

  it("warns in the band when MEMORY.md is over its cap", async () => {
    memoryStats.mockResolvedValue({ ...NEW_STATS, memory_md_chars: 4600 });
    render(<MemoryPanel />);
    await screen.findByText(/oldest notes are left out of the prompt file/);
  });

  it("shows none of them, and no placeholder, for stats of the older shape", async () => {
    render(<MemoryPanel />);
    await screen.findByText("3 memories on recall");
    const band = screen.getByRole("heading", { name: "3 memories on recall" }).parentElement!.parentElement!;
    expect(band.textContent).toBe("3 memories on recallsqlite backend");
  });

  it("sends place=private and then the conversation key, and restores the list when cleared", async () => {
    memoryStats.mockResolvedValue(NEW_STATS);
    memory.mockResolvedValue(
      page([
        entry({ session_id: null, surface: null, place: null, thread: null }),
        entry({ key: "room-note", content: "Room note.", session_id: "telegram:team-room", surface: "telegram", place: "team-room", thread: null }),
      ]),
    );
    render(<MemoryPanel />);
    await screen.findByText("Room note.");
    const picker = screen.getByLabelText("Filter by place") as HTMLSelectElement;
    expect([...picker.options].map((o) => [o.value, o.textContent])).toEqual([
      ["", "All places"],
      ["private", "Private"],
      ["telegram:team-room", "telegram · team-room"],
    ]);

    fireEvent.change(picker, { target: { value: "private" } });
    await waitFor(() =>
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "", place: "private" }),
    );
    fireEvent.change(picker, { target: { value: "telegram:team-room" } });
    await waitFor(() =>
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "", place: "telegram:team-room" }),
    );
    fireEvent.change(picker, { target: { value: "" } });
    await waitFor(() =>
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "", place: "" }),
    );
  });

  it("names an empty place and offers to show all places", async () => {
    memoryStats.mockResolvedValue(NEW_STATS);
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    memory.mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText("Filter by place"), { target: { value: "private" } });
    await screen.findByText("No notes in this place.");
    fireEvent.click(screen.getByRole("button", { name: "Show all places" }));
    await screen.findByText("No memories yet.");
    expect((screen.getByLabelText("Filter by place") as HTMLSelectElement).value).toBe("");
  });

  it("offers no place filter on a gateway whose stats carry no placement", async () => {
    render(<MemoryPanel />);
    await screen.findByText("3 memories on recall");
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(screen.queryByLabelText("Filter by place")).toBeNull();
  });

  it("labels a row with the place the gateway sent, and keeps the old wording without one", async () => {
    memory.mockResolvedValue(
      page([
        entry({ key: "private-note", content: "A private note.", surface: null, place: null, thread: null }),
        entry({ key: "slack-note", content: "A Slack note.", session_id: "slack:ops:t42", surface: "slack", place: "ops", thread: "t42" }),
        entry({ key: "old-note", content: "An older note.", session_id: "sess-1" }),
        entry({ key: "web-note", content: "A web session note.", session_id: "sess-2", surface: null, place: null, thread: null }),
        entry({ key: `user_msg_${UUID}`, category: "conversation", content: "A saved turn.", surface: null, place: null, thread: null }),
      ]),
    );
    render(<MemoryPanel />);
    const row = (text: string) => screen.getByText(text).closest("[data-slot=row]")!.textContent!;
    await screen.findByText("A private note.");
    expect(row("A private note.")).toContain("Private");
    expect(row("A Slack note.")).toContain("slack · ops · thread t42");
    expect(row("A Slack note.")).not.toContain("this conversation only");
    expect(row("An older note.")).toContain("this conversation only");
    expect(row("A web session note.")).toContain("this conversation only");
    expect(row("A web session note.")).not.toContain("Private");
    expect(row("A saved turn.")).toContain("Private · saved from a conversation");
  });

  it("says in the form hint that a saved note is private", async () => {
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(screen.getByText(/Saved as a private note/)).toBeTruthy();
  });
});

describe("MemoryPanel: tabs", () => {
  it("opens on Notes and keeps the remember form there only", async () => {
    render(<MemoryPanel />);
    await screen.findByText(/Deploys go out on Tuesdays/);
    expect(screen.getByRole("button", { name: "Notes" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Chat recordings" }));
    await screen.findByText("No chat recordings yet.");
    expect(screen.queryByRole("heading", { name: "Remember something" })).toBeNull();
    expect(screen.queryByText(/Deploys go out on Tuesdays/)).toBeNull();
    // The band stays above both tabs.
    expect(screen.getByText("3 memories on recall")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    await screen.findByRole("heading", { name: "Remember something" });
  });
});

describe("MemoryPanel: chat recordings", () => {
  const A1 = recording();
  const A2 = recording({ id: "sess-a2", title: "Refund policy", message_count: 3, last_activity_at: "2026-10-01T09:00:00+00:00" });
  const B1 = recording({ id: "sess-b1", title: "Standup notes", conversation_key: "slack:ops", surface: "slack", place: "ops" });

  async function openRecordings() {
    render(<MemoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Chat recordings" }));
  }

  it("asks the gateway for channel recordings only", async () => {
    sessions.mockResolvedValue(sessionPage([A1]));
    await openRecordings();
    await screen.findByText("Pricing question");
    expect(sessions).toHaveBeenLastCalledWith(50, 0, "channel");
  });

  it("groups the rows of one conversation under one heading", async () => {
    sessions.mockResolvedValue(sessionPage([A1, B1, A2]));
    await openRecordings();
    await screen.findByText("Pricing question");
    const groups = screen.getAllByRole("group");
    expect(groups.length).toBe(2);
    const team = groups.find((g) => g.textContent!.includes("telegram · team-room"))!;
    expect(within(team).getByText("Pricing question")).toBeTruthy();
    expect(within(team).getByText("Refund policy")).toBeTruthy();
    expect(within(team).queryByText("Standup notes")).toBeNull();
    expect(team.textContent).toContain("2 recordings");
    expect(team.textContent).toContain("6 messages");
  });

  it("does not show a row whose source is not channel", async () => {
    sessions.mockResolvedValue(sessionPage([recording({ id: "sess-cli", title: "Terminal chat", source: "cli", conversation_key: null, surface: null, place: null })]));
    await openRecordings();
    await screen.findByText("No chat recordings yet.");
    expect(screen.queryByText("Terminal chat")).toBeNull();
  });

  it("shows an empty state and no pager when an older gateway returns ordinary sessions with a large total", async () => {
    sessions.mockResolvedValue({
      sessions: [recording({ id: "sess-old", title: "Ordinary chat", source: undefined, conversation_key: undefined })],
      count: 1,
      offset: 0,
      total: 120,
    });
    await openRecordings();
    await screen.findByText("No chat recordings yet.");
    expect(screen.queryByText("Ordinary chat")).toBeNull();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
  });

  it("pages the recordings when channel rows are present", async () => {
    sessions.mockResolvedValue({ sessions: [A1], count: 1, offset: 0, total: 120 });
    await openRecordings();
    await screen.findByText("Pricing question");
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy();
  });

  it("says where recordings come from and how long they are kept when there are none", async () => {
    await openRecordings();
    await screen.findByText("No chat recordings yet.");
    expect(screen.getByText(/kept thirty days after the last message/)).toBeTruthy();
  });

  it("searches with source channel and returns to the list when cleared", async () => {
    sessions.mockResolvedValue(sessionPage([A1]));
    const hit: SearchResult = { session_id: "sess-a2", session_title: "Refund policy", role: "user", content: "Can I get a refund?", timestamp: "2026-10-01T09:00:00+00:00", rank: 1 };
    searchSessions.mockResolvedValue({ results: [hit], count: 1 });
    await openRecordings();
    await screen.findByText("Pricing question");
    const box = screen.getByLabelText("Search recordings") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "refund" } });
    await waitFor(() => expect(searchSessions).toHaveBeenLastCalledWith("refund", 30, "channel"));
    await screen.findByText("Can I get a refund?");
    expect(screen.queryByText("Pricing question")).toBeNull();
    fireEvent.change(box, { target: { value: "" } });
    await screen.findByText("Pricing question");
    expect(screen.queryByText("Can I get a refund?")).toBeNull();
  });

  it("names a search that found nothing", async () => {
    await openRecordings();
    await screen.findByText("No chat recordings yet.");
    fireEvent.change(screen.getByLabelText("Search recordings"), { target: { value: "zzzz" } });
    await screen.findByText("No recordings match “zzzz”.");
  });

  it("opens a recording and shows its transcript, read-only", async () => {
    sessions.mockResolvedValue(sessionPage([A1]));
    session.mockResolvedValue({
      id: "sess-a1",
      title: "Pricing question",
      model: "model-a",
      started_at: null,
      messages: [
        { role: "user", content: "What does the team plan cost?", timestamp: null },
        { role: "assistant", content: "It is billed per seat.", timestamp: null },
      ],
    });
    await openRecordings();
    fireEvent.click(await screen.findByRole("button", { name: "Open Pricing question" }));
    await screen.findByText("It is billed per seat.");
    expect(session).toHaveBeenCalledWith("sess-a1");
    expect(screen.getByText("What does the team plan cost?")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to recordings" }));
    await screen.findByText("Pricing question");
  });

  async function openDelete() {
    sessions.mockResolvedValue(sessionPage([A1, A2]));
    await openRecordings();
    fireEvent.click(await screen.findByRole("button", { name: "Delete this conversation in telegram · team-room" }));
    return screen.findByRole("dialog");
  }

  it("names the place and what stays before deleting a conversation", async () => {
    const dialog = await openDelete();
    expect(dialog.textContent).toContain("telegram · team-room");
    expect(dialog.textContent).toMatch(/every recording of the conversation in telegram · team-room is removed/i);
    expect(dialog.textContent).toMatch(/notes and scheduled jobs made in it stay/i);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("deletes the conversation, toasts the count and reloads the list", async () => {
    const dialog = await openDelete();
    sessions.mockResolvedValue(sessionPage([]));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith("sess-a1"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Removed 2 recordings"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("No chat recordings yet.");
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it("does not claim a removal when the gateway removed nothing", async () => {
    deleteSession.mockResolvedValue({ deleted: false, id: "sess-a1" });
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toastMessage).toHaveBeenCalledWith("That conversation was already gone."));
    expect(toastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reloads the recordings when the band's Refresh is pressed", async () => {
    sessions.mockResolvedValue(sessionPage([A1]));
    await openRecordings();
    await screen.findByText("Pricing question");
    expect(sessions).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(sessions).toHaveBeenCalledTimes(2));
  });

  it("keeps the dialog open and says the agent is answering on a 409", async () => {
    deleteSession.mockRejectedValue(new ApiError("a turn is running", 409, { error: "conflict" }));
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("The agent is answering in that conversation. Try again in a moment.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(sessions).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and shows the gateway's reason on another failure", async () => {
    deleteSession.mockRejectedValue(new ApiError("could not remove a copy", 500, {}));
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("could not remove a copy");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
