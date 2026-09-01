// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MemoryEntry } from "@/lib/types";

const memory = vi.fn();
const getMemory = vi.fn();
const addMemory = vi.fn();
const deleteMemory = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastMessage = vi.fn();

// Keep the real `ApiError` / `describeApiError`; only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    memory: (...a: unknown[]) => memory(...a),
    getMemory: (key: string) => getMemory(key),
    addMemory: (body: unknown) => addMemory(body),
    deleteMemory: (key: string) => deleteMemory(key),
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

const ROWS = [
  entry(),
  entry({ key: "team/alpha notes", content: "Slash key test" }),
  entry({ key: `memory_${UUID}`, content: "Unnamed fact about the staging database." }),
];

function notFound() {
  return new ApiError("no memory with key", 404, { error: "not_found" });
}

async function fillRemember(content: string, name?: string) {
  const box = await screen.findByPlaceholderText(/durable fact/i);
  fireEvent.change(box, { target: { value: content } });
  if (name !== undefined) {
    fireEvent.change(screen.getByLabelText(/name this memory/i), { target: { value: name } });
  }
}

beforeEach(() => {
  memory.mockResolvedValue(page(ROWS));
  getMemory.mockRejectedValue(notFound());
  addMemory.mockResolvedValue({ key: "deploy-window", stored: true, notes: [] });
  deleteMemory.mockResolvedValue({ key: "deploy-window", removed: true });
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
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("of 3");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/The gateway is unreachable/);
    expect(screen.getByText(/Deploys go out on Tuesdays/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Memories");
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
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "zzzz", category: "" }),
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
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "daily" }),
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
      expect(memory).toHaveBeenLastCalledWith(50, 0, { q: "", category: "ops" }),
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
    const box = screen.getByLabelText("Remember something") as HTMLTextAreaElement;
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
