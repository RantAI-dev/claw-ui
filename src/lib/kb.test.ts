import { describe, expect, it } from "vitest";
import {
  DEFAULT_KB_PRESET,
  INK_HEX,
  KB_PRESETS,
  contrastRatio,
  isPreset,
  kbVerdict,
  presetName,
  tileInk,
  deleteDocCopy,
  deleteGroupCopy,
  describeIngestError,
  duplicateTitles,
  fileStem,
  ingestNote,
  unlinkDocCopy,
} from "./kb";

const err = (status: number, body: unknown, text = "", statusText = "") =>
  describeIngestError({ status, body, text, statusText });

describe("describeIngestError", () => {
  it("names the extension and the accepted types for an unsupported file", () => {
    expect(err(400, { error: "unsupported_file_type", detail: "weird.xyz" })).toBe(
      ".xyz is not a supported type. Supported: PDF, Markdown, text and code files, images.",
    );
  });
  it("falls back to 'this file' when the name has no extension", () => {
    expect(err(400, { error: "unsupported_file_type", detail: "README" })).toMatch(
      /^this file is not a supported type/,
    );
  });
  it("turns the gateway's missing vision key into the console's field", () => {
    expect(
      err(400, {
        error: "bad_request",
        detail: "No API key configured: set KB_EXTRACT_VISION_API_KEY or OPENROUTER_API_KEY",
      }),
    ).toBe("Image uploads need an OCR / vision key. Add one under Knowledge Base settings.");
  });
  it("reports the proxy's size cap", () => {
    expect(err(413, { error: "file_too_large", detail: "Max 20 MB" })).toBe("too large (max 20 MB)");
  });
  it("reports an unreachable gateway from the proxy body or the middleware sentence", () => {
    expect(err(502, { error: "gateway_unreachable", detail: "fetch failed" })).toBe(
      "The console could not reach the RantaiClaw gateway. Retry once it is back.",
    );
    expect(err(502, { error: "x", detail: "The console could not reach the RantaiClaw gateway." })).toMatch(
      /could not reach the RantaiClaw gateway\. Retry/,
    );
  });
  it("passes a 404 detail through and falls back to the body text then the status", () => {
    expect(err(404, { error: "not_found", detail: "group abc not found" })).toBe("group abc not found");
    expect(err(500, null, "<html>boom</html>", "Internal Server Error")).toBe("<html>boom</html>");
    expect(err(500, null, "", "Internal Server Error")).toBe("Internal Server Error");
  });
});

describe("ingestNote", () => {
  it("flags a thin extraction with the count", () => {
    expect(ingestNote({ chunks_stored: 1, chars_extracted: 66, low_text_density: true })).toEqual({
      text: "ready, thin: 66 characters extracted; it may retrieve poorly",
      thin: true,
    });
  });
  it("reports the count for a normal extraction", () => {
    expect(ingestNote({ chunks_stored: 2, chars_extracted: 1405, low_text_density: false })).toEqual({
      text: "ready · 1,405 characters extracted",
      thin: false,
    });
  });
  it("never calls a document thin when the gateway sent no measurement", () => {
    expect(ingestNote({ chunks_stored: 1 })).toEqual({ text: "ready", thin: false });
  });
});

describe("removal copy", () => {
  it("says what a delete does to this console, with the count", () => {
    const five = deleteGroupCopy({ name: "Product Docs", document_count: 5 });
    expect(five.title).toBe("Delete knowledge base");
    expect(five.body).toContain("Its 5 documents are not deleted");
    expect(five.body).toContain("rantaiclaw kb list");
    expect(five.body).not.toContain("library");
    expect(deleteGroupCopy({ name: "Legal", document_count: 1 }).body).toContain("Its 1 document is not deleted");
    expect(deleteGroupCopy({ name: "Legal", document_count: 0 }).body).toBe("Delete “Legal”? It holds no documents.");
    expect(deleteGroupCopy({ name: "Legal" }).body).toBe("Delete “Legal”? It holds no documents.");
  });
  it("says an unlink is not a delete and where the document goes", () => {
    const s = unlinkDocCopy("notes", "Product Docs");
    expect(s).toContain("Remove “notes” from “Product Docs”? It is not deleted.");
    expect(s).toContain("rantaiclaw kb list");
    expect(s).not.toContain("library");
  });
  it("keeps the delete-document consequence without the library", () => {
    expect(deleteDocCopy("data")).toBe(
      "Delete “data”? It leaves every knowledge base and stops being used for retrieval.",
    );
  });
});

describe("duplicates and counts", () => {
  it("strips the extension the way the gateway titles a document", () => {
    expect(fileStem("notes.md")).toBe("notes");
    expect(fileStem("archive.tar.gz")).toBe("archive.tar");
    expect(fileStem(".env")).toBe(".env");
    expect(fileStem("dir/report.txt")).toBe("report");
  });
  it("lists the stems that already exist, once each", () => {
    const files = [{ name: "notes.md" }, { name: "new.md" }, { name: "notes.txt" }];
    expect(duplicateTitles(files, [{ title: "notes" }, { title: null }])).toEqual(["notes"]);
    expect(duplicateTitles(files, [])).toEqual([]);
  });
});

describe("kbVerdict", () => {
  const on = { enabled: true, embedding_configured: true, vision_configured: false, source: "config" };

  it("says retrieval is off, with the next move, before any key exists", () => {
    const v = kbVerdict({ enabled: false, embedding_configured: false, vision_configured: false, source: "none" }, null);
    expect(v).toEqual({
      headline: "Document retrieval is off",
      tone: "warn",
      meta: [],
      detail: "Add an embedding key to activate the Knowledge Base.",
    });
  });

  it("keeps the stored key visible when retrieval is paused", () => {
    const v = kbVerdict({ enabled: false, embedding_configured: true, vision_configured: false, source: "config" }, null);
    expect(v.tone).toBe("warn");
    expect(v.meta).toEqual(["key stored"]);
    expect(v.detail).toBe("Activate to resume retrieval. The key is kept.");
  });

  it("treats a keyed older gateway without the enabled field as on", () => {
    const v = kbVerdict({ embedding_configured: true, vision_configured: false, source: "env" }, []);
    expect(v.headline).toBe("Nothing to retrieve yet");
  });

  it("flags an active setup with no bases, then no documents", () => {
    expect(kbVerdict(on, []).headline).toBe("Nothing to retrieve yet");
    expect(kbVerdict(on, [{ document_count: 0 }]).headline).toBe("No documents to retrieve yet");
    expect(kbVerdict(on, [{ document_count: 0 }]).meta).toEqual(["1 knowledge base"]);
  });

  it("answers with the document count and the key facts when ready", () => {
    const v = kbVerdict(
      { ...on, vision_configured: true },
      [{ document_count: 5 }, { document_count: 1 }, {}],
    );
    expect(v).toEqual({
      headline: "6 documents ready to retrieve",
      tone: "ok",
      meta: ["3 knowledge bases", "OCR on", "key from config"],
    });
  });
});

describe("colours", () => {
  const legacy = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  const inkHex = (ink: string) => (ink === "#ffffff" ? "#ffffff" : INK_HEX);

  it("ships eight named hex presets and a deterministic default", () => {
    expect(KB_PRESETS).toHaveLength(8);
    for (const p of KB_PRESETS) expect(p.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(KB_PRESETS.map((p) => p.name)).size).toBe(8);
    expect(DEFAULT_KB_PRESET).toBe("#0d63d0");
    expect(presetName("#0d63d0")).toBe("Blue");
    expect(presetName("#0D63D0")).toBe("Blue");
    expect(isPreset("#eab308")).toBe(false);
    expect(isPreset(null)).toBe(false);
  });

  it("gives every preset and every legacy colour a glyph that passes 3:1", () => {
    for (const hex of [...KB_PRESETS.map((p) => p.hex), ...legacy]) {
      const ratio = contrastRatio(inkHex(tileInk(hex)), hex);
      expect(ratio, `${hex} with ${tileInk(hex)} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses ink on light colours and on the non-hex sky default, white on dark ones", () => {
    expect(tileInk("#80cb87")).toBe("var(--brand-ink)");
    expect(tileInk("#eab308")).toBe("var(--brand-ink)");
    expect(tileInk("var(--brand-sky)")).toBe("var(--brand-ink)");
    expect(tileInk(null)).toBe("var(--brand-ink)");
    expect(tileInk("#574399")).toBe("#ffffff");
    expect(tileInk("#0d63d0")).toBe("#ffffff");
    expect(contrastRatio("#ffffff", "#574399")).toBeCloseTo(7.87, 1);
  });
});
