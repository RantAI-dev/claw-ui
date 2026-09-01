import { describe, expect, it } from "vitest";
import {
  countLine,
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
  it("pluralises the count line", () => {
    expect(countLine(1, 1)).toBe("1 knowledge base · 1 document");
    expect(countLine(3, 1200)).toBe("3 knowledge bases · 1,200 documents");
    expect(countLine(0, 0)).toBe("0 knowledge bases · 0 documents");
  });
});
