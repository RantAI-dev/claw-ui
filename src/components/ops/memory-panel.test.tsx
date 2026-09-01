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
