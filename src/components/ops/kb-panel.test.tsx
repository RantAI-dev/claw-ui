// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { KbDocument, KbGroup, KnowledgeStatus } from "@/lib/types";

const getKnowledge = vi.fn();
const setKnowledge = vi.fn();
const kbGroups = vi.fn();
const kbGroupDocuments = vi.fn();
const kbCreateGroup = vi.fn();
const kbUpdateGroup = vi.fn();
const kbDeleteGroup = vi.fn();
const kbRemoveDocFromGroup = vi.fn();
const kbDeleteDocument = vi.fn();
const ingestFile = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

// Keep the real `ApiError` / `describeApiError` (useAsync maps every failure
// through them); only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    getKnowledge: () => getKnowledge(),
    setKnowledge: (body: unknown) => setKnowledge(body),
    kbGroups: () => kbGroups(),
    kbGroupDocuments: (id: string) => kbGroupDocuments(id),
    kbCreateGroup: (body: unknown) => kbCreateGroup(body),
    kbUpdateGroup: (id: string, body: unknown) => kbUpdateGroup(id, body),
    kbDeleteGroup: (id: string) => kbDeleteGroup(id),
    kbRemoveDocFromGroup: (id: string, doc: string) => kbRemoveDocFromGroup(id, doc),
    kbDeleteDocument: (doc: string) => kbDeleteDocument(doc),
  },
}));
vi.mock("@/lib/attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attachments")>()),
  ingestFile: (...a: unknown[]) => ingestFile(...a),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
  },
}));
// The graph and the viewer bring a canvas library and a markdown renderer;
// neither is under test here.
vi.mock("./graph-lens", () => ({ GraphLens: () => <div data-testid="graph-lens" /> }));
vi.mock("./doc-viewer-drawer", () => ({
  DocViewerDrawer: () => <div role="dialog" aria-label="viewer" />,
}));

import { ApiError } from "@/lib/api";
import { getFileTypeIcon } from "@/lib/file-type";
import { KbPanel } from "./kb-panel";

const ON: KnowledgeStatus = {
  enabled: true,
  embedding_configured: true,
  vision_configured: false,
  source: "config",
};
const OFF: KnowledgeStatus = {
  enabled: false,
  embedding_configured: false,
  vision_configured: false,
  source: "none",
};

function group(over: Partial<KbGroup> = {}): KbGroup {
  return {
    id: "g-product",
    name: "Product Docs",
    description: "Specs, RFCs and runbooks for the Orion Platform.",
    color: "#eab308",
    document_count: 5,
    ...over,
  };
}
const GROUPS: KbGroup[] = [
  group({ id: "g-legal", name: "Legal", description: "Contracts.", color: "#8b5cf6", document_count: 0 }),
  group({ id: "g-long", name: "An Unreasonably Long Knowledge Base Name", description: null, color: "#22c55e", document_count: 0 }),
  group(),
];

function doc(over: Partial<KbDocument> = {}): KbDocument {
  return {
    id: "d-notes-0000",
    title: "notes",
    file_type: "markdown",
    file_size: 405,
    created_at: "2026-09-01T07:17:51Z",
    retrieval_count: 0,
    ...over,
  };
}
const DOCS: KbDocument[] = [doc(), doc({ id: "d-data-0000", title: "data", file_type: "text", file_size: 66 })];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The card's opener is the "Open knowledge base X" wrapper before step 2 and
// the name button after it; both names match this pattern.
const opener = (name: string) => new RegExp(`^(Open knowledge base )?${name}$`);

async function openProductDocs() {
  fireEvent.click(await screen.findByRole("button", { name: opener("Product Docs") }));
  await screen.findByRole("heading", { level: 3, name: "Product Docs" });
}

beforeEach(() => {
  vi.clearAllMocks();
  getKnowledge.mockResolvedValue(ON);
  kbGroups.mockResolvedValue(GROUPS);
  kbGroupDocuments.mockResolvedValue(DOCS);
});
afterEach(() => cleanup());

describe("KbPanel gate and status", () => {
  it("shows the activation form and never asks for groups while the Knowledge Base is off", async () => {
    getKnowledge.mockResolvedValue(OFF);
    render(<KbPanel />);
    await screen.findByText("Activate Knowledge Base");
    expect(kbGroups).not.toHaveBeenCalled();
  });

  it("requests the status once per mount and names what it is loading", async () => {
    const d = deferred<KnowledgeStatus>();
    getKnowledge.mockReturnValue(d.promise);
    render(<KbPanel />);
    expect(screen.getByText("Loading Knowledge Base status…")).toBeTruthy();
    d.resolve(ON);
    await screen.findByText("Knowledge Base active");
    await screen.findByRole("button", { name: opener("Product Docs") });
    expect(getKnowledge).toHaveBeenCalledTimes(1);
  });

  it("Edit key: Save is disabled until a key is typed, then sends only that key", async () => {
    setKnowledge.mockResolvedValue({ enabled: true, embedding_configured: true, vision_configured: false });
    render(<KbPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit key" }));
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Embedding API key"), { target: { value: "k2" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(setKnowledge).toHaveBeenCalledTimes(1));
    expect(setKnowledge).toHaveBeenCalledWith({ embedding_api_key: "k2" });
    expect(toastSuccess).toHaveBeenCalledWith("Embedding key updated");
  });
});

describe("KbPanel list", () => {
  it("waits for the list before printing a count", async () => {
    const d = deferred<KbGroup[]>();
    kbGroups.mockReturnValue(d.promise);
    render(<KbPanel />);
    await screen.findByText("Loading knowledge bases…");
    expect(screen.queryByText(/knowledge bases? ·/)).toBeNull();
    d.resolve(GROUPS);
    await screen.findByText("3 knowledge bases · 5 documents");
  });

  it("keeps the cards when a refresh fails", async () => {
    kbGroups.mockResolvedValueOnce(GROUPS).mockRejectedValueOnce(new ApiError("boom", 502, {}));
    render(<KbPanel />);
    await screen.findByRole("button", { name: opener("Product Docs") });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/gateway is unreachable/);
    expect(screen.getByRole("button", { name: opener("Product Docs") })).toBeTruthy();
    expect(screen.getByRole("button", { name: opener("Legal") })).toBeTruthy();
  });

  it("says what a delete does to this console, with the count", async () => {
    render(<KbPanel />);
    await screen.findByRole("button", { name: opener("Product Docs") });
    fireEvent.click(screen.getByRole("button", { name: "Delete knowledge base Product Docs" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Its 5 documents are not deleted/)).toBeTruthy();
    expect(within(dialog).getByText(/rantaiclaw kb list/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Delete knowledge base Legal" }));
    const d2 = await screen.findByRole("dialog");
    expect(within(d2).getByText("Delete “Legal”? It holds no documents.")).toBeTruthy();
    expect(within(d2).queryByText(/library/)).toBeNull();
  });
});

describe("KbPanel detail", () => {
  it("keeps the documents when a refresh fails", async () => {
    kbGroupDocuments.mockResolvedValueOnce(DOCS).mockRejectedValueOnce(new ApiError("boom", 502, {}));
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    // The detail header has its own Refresh; the list's is gone with the list.
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/gateway is unreachable/);
    expect(screen.getByText("notes")).toBeTruthy();
    expect(screen.getByText("data")).toBeTruthy();
  });

  it("names the term and the total when a search matches nothing", async () => {
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    fireEvent.change(screen.getByPlaceholderText("Search documents…"), { target: { value: "zzz" } });
    expect(screen.getByText("No documents match “zzz”.")).toBeTruthy();
    expect(screen.getByText("Clear the search to see all 2 documents.")).toBeTruthy();
  });

  it("unlink says it is not a delete; delete keeps its consequence", async () => {
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove from this knowledge base" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Remove “notes” from “Product Docs”\? It is not deleted\./)).toBeTruthy();
    expect(within(dialog).queryByText(/library/)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: "Delete document" })[0]);
    const d2 = await screen.findByRole("dialog");
    expect(
      within(d2).getByText("Delete “notes”? It leaves every knowledge base and stops being used for retrieval."),
    ).toBeTruthy();
  });

  it("reports a thin extraction on the row and as a warning", async () => {
    ingestFile.mockResolvedValue({ document_id: "d", chunks_stored: 1, chars_extracted: 66, low_text_density: true });
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    const input = document.querySelector<HTMLInputElement>("input[type=file][accept^='.pdf']")!;
    const file = new File(["a,b\n1,2"], "data.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("ready, thin: 66 characters extracted; it may retrieve poorly");
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/data\.csv extracted only 66 characters/));
    // The stem already exists in this base: one more warning, after the success toast.
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/“data” already existed/));
    expect(toastSuccess).toHaveBeenCalledWith("Added 1 document to “Product Docs”");
  });

  it("prints the failure sentence on the row and in the toast", async () => {
    ingestFile.mockRejectedValue(
      new Error(".xyz is not a supported type. Supported: PDF, Markdown, text and code files, images."),
    );
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    const input = document.querySelector<HTMLInputElement>("input[type=file][accept^='.pdf']")!;
    fireEvent.change(input, { target: { files: [new File(["x"], "weird.xyz")] } });
    await screen.findByText(".xyz is not a supported type. Supported: PDF, Markdown, text and code files, images.");
    expect(toastError).toHaveBeenCalledWith(
      "weird.xyz: .xyz is not a supported type. Supported: PDF, Markdown, text and code files, images.",
    );
  });

  it("a plain success reads ready with the count and no warning", async () => {
    ingestFile.mockResolvedValue({ document_id: "d", chunks_stored: 2, chars_extracted: 1405, low_text_density: false });
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    const input = document.querySelector<HTMLInputElement>("input[type=file][accept^='.pdf']")!;
    fireEvent.change(input, { target: { files: [new File(["x"], "fresh.md")] } });
    await screen.findByText("ready · 1,405 characters extracted");
    expect(toastWarning).not.toHaveBeenCalled();
  });
});

describe("KbPanel keyboard, touch and semantics", () => {
  it("the name is the card's button and the card itself has no role", async () => {
    const { container } = render(<KbPanel />);
    await screen.findByRole("button", { name: "Product Docs" });
    expect(container.querySelector("[role=button][aria-label^='Open knowledge base']")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Product Docs" }));
    await screen.findByRole("heading", { level: 3, name: "Product Docs" });
  });

  it("Enter on a card's Edit opens the editor, not the base", async () => {
    render(<KbPanel />);
    const edit = await screen.findByRole("button", { name: "Edit knowledge base Legal" });
    fireEvent.keyDown(edit, { key: "Enter" });
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(edit);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit knowledge base" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("the dropzone's two controls each open their own chooser and nothing else", async () => {
    render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const images = screen.getByRole("button", { name: /Upload images instead/ });
    fireEvent.keyDown(images, { key: "Enter" });
    fireEvent.keyDown(images, { key: " " });
    expect(clickSpy).not.toHaveBeenCalled();
    fireEvent.click(images);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((clickSpy.mock.instances[0] as HTMLInputElement).accept.startsWith(".png")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /choose documents/ }));
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect((clickSpy.mock.instances[1] as HTMLInputElement).accept.startsWith(".pdf")).toBe(true);
    clickSpy.mockRestore();
  });

  it("the modal opens on Name, labels its fields and offers the colours as a radiogroup", async () => {
    render(<KbPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "New knowledge base" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(within(dialog).getByLabelText("Description")).toBeTruthy();
    const group = within(dialog).getByRole("radiogroup", { name: "Color" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(8);
    const checked = radios.find((r) => r.getAttribute("aria-checked") === "true")!;
    expect(checked).toBeTruthy();
    const i = radios.indexOf(checked);
    fireEvent.keyDown(checked, { key: "ArrowRight" });
    const next = radios[(i + 1) % radios.length];
    expect(next.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(next);
    expect(checked.getAttribute("aria-checked")).toBe("false");
  });

  it("a stored colour outside the presets is kept as 'Current colour'", async () => {
    kbGroups.mockResolvedValue([group({ id: "g-x", name: "Odd", color: "#eab308" })]);
    render(<KbPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit knowledge base Odd" }));
    const dialog = await screen.findByRole("dialog");
    const current = within(dialog).getByRole("radio", { name: "Current colour" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(9);
  });

  it("actions exist on touch, are 40px on coarse pointers, and clipped text carries a title", async () => {
    const { container } = render(<KbPanel />);
    await screen.findByRole("button", { name: "Product Docs" });
    const desc = screen.getByText("Specs, RFCs and runbooks for the Orion Platform.");
    expect(desc.getAttribute("title")).toBe("Specs, RFCs and runbooks for the Orion Platform.");
    const edit = screen.getByRole("button", { name: "Edit knowledge base Product Docs" });
    expect(edit.className).toContain("pointer-coarse:min-h-10");
    expect(edit.parentElement!.className).toContain("[@media(hover:none)]:opacity-100");
    await openProductDocs();
    await screen.findByText("notes");
    const view = screen.getAllByRole("button", { name: "View document" })[0];
    expect(view.className).toContain("pointer-coarse:min-h-10");
    expect(view.parentElement!.className).toContain("[@media(hover:none)]:opacity-100");
    expect(screen.getByText("notes").getAttribute("title")).toBe("notes");
    expect(container.querySelector("h3")!.getAttribute("title")).toBe("Product Docs");
  });

  it("puts focus on New knowledge base after a delete removes the trigger", async () => {
    kbDeleteGroup.mockResolvedValue({ id: "g-legal", deleted: true });
    kbGroups.mockResolvedValueOnce(GROUPS).mockResolvedValue(GROUPS.slice(1));
    render(<KbPanel />);
    const del = await screen.findByRole("button", { name: "Delete knowledge base Legal" });
    fireEvent.click(del);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(kbDeleteGroup).toHaveBeenCalledWith("g-legal"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete knowledge base Legal" })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "New knowledge base" })),
    );
  });

  it("puts focus on New knowledge base after deleting the base from its detail", async () => {
    kbDeleteGroup.mockResolvedValue({ id: "g-product", deleted: true });
    kbGroups.mockResolvedValueOnce(GROUPS).mockResolvedValue(GROUPS.slice(0, 2));
    render(<KbPanel />);
    await openProductDocs();
    fireEvent.click(screen.getByRole("button", { name: "Delete knowledge base" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 3 })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "New knowledge base" })),
    );
  });
});

describe("KbPanel colour, contrast, motion and icons", () => {
  it("colours the tile glyph by luminance: ink on light, white on dark, never text-white", async () => {
    kbGroups.mockResolvedValue([
      group({ id: "g-light", name: "Light", color: "#80cb87" }),
      group({ id: "g-dark", name: "Dark", color: "#574399" }),
      group({ id: "g-none", name: "None", color: null }),
    ]);
    const { container } = render(<KbPanel />);
    await screen.findByRole("button", { name: "Light" });
    const tiles = Array.from(container.querySelectorAll<HTMLElement>("[aria-hidden].size-11"));
    expect(tiles).toHaveLength(3);
    expect(tiles[0].style.color).toBe("var(--brand-ink)");
    expect(tiles[1].style.color).toBe("#ffffff");
    expect(tiles[2].style.color).toBe("var(--brand-ink)");
    expect(container.querySelector(".text-white")).toBeNull();
  });

  it("offers the token presets, defaults a new base to Blue, and never lifts or glows a card", async () => {
    const { container } = render(<KbPanel />);
    await screen.findByRole("button", { name: "Product Docs" });
    expect(container.querySelector(".hover\\:-translate-y-0\\.5")).toBeNull();
    expect(container.querySelector(".hover\\:shadow-md")).toBeNull();
    expect(container.querySelector(".backdrop-blur-sm")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New knowledge base" }));
    const dialog = await screen.findByRole("dialog");
    const radios = within(dialog).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Orange", "Blue", "Green", "Teal", "Sea green", "Purple", "Red", "Cornflower",
    ]);
    expect(within(dialog).getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("true");
  });

  it("marks intelligence with FileScan, not Sparkles, and prints the meta in normal case", async () => {
    const { container } = render(<KbPanel />);
    await openProductDocs();
    await screen.findByText("notes");
    const intel = screen.getAllByRole("button", { name: "Document intelligence" })[0];
    expect(intel.querySelector("svg")!.getAttribute("class")).toContain("lucide-file-scan");
    expect(container.querySelector(".lucide-sparkles")).toBeNull();
    expect(screen.getByText("405 B · markdown")).toBeTruthy();
    expect(container.querySelector(".font-mono")).toBeNull();
  });

  it("resolves only the five gateway file types", () => {
    expect(getFileTypeIcon("csv").Icon).toBe(getFileTypeIcon(undefined).Icon);
    expect(getFileTypeIcon("csv").iconColor).toBe(getFileTypeIcon(undefined).iconColor);
    expect(getFileTypeIcon("markdown").iconColor).toBe("text-chart-1");
    expect(getFileTypeIcon("TEXT").iconColor).toBe("text-muted-foreground");
    expect(getFileTypeIcon("pdf").iconColor).toBe("text-destructive");
  });
});
