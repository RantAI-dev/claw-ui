import { describe, it, expect, vi, afterEach } from "vitest";
import { ingestFile, listConversationFiles } from "./attachments";

afterEach(() => vi.restoreAllMocks());

/** Extract the string form-fields from the first fetch call's FormData body. */
function fieldsFrom(mock: ReturnType<typeof vi.fn>): Record<string, string> {
  const body = mock.mock.calls[0][1].body as FormData;
  const out: Record<string, string> = {};
  for (const [k, v] of body.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

describe("ingestFile", () => {
  it("KB upload sends the groups field, not categories", async () => {
    const m = vi.fn(
      async () =>
        new Response(JSON.stringify({ document_id: "d1", chunks_stored: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", m);
    await ingestFile(new File(["x"], "a.txt"), { groups: ["grp"] });
    const f = fieldsFrom(m);
    expect(f.groups).toBe("grp");
    expect(f.categories).toBeUndefined();
  });

  it("chat upload still sends categories (unchanged)", async () => {
    const m = vi.fn(
      async () =>
        new Response(JSON.stringify({ document_id: "d1", chunks_stored: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", m);
    await ingestFile(new File(["x"], "a.txt"), "conv-1");
    const f = fieldsFrom(m);
    expect(f.categories).toBe("conv-1");
    expect(f.groups).toBeUndefined();
  });

  it("carries the gateway's extraction measurement on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ document_id: "d1", chunks_stored: 1, chars_extracted: 66, low_text_density: true }),
            { status: 200 },
          ),
      ),
    );
    const r = await ingestFile(new File(["x"], "data.csv"), { groups: ["grp"] });
    expect(r).toEqual({ document_id: "d1", chunks_stored: 1, chars_extracted: 66, low_text_density: true });
  });

  it("leaves the measurement absent when an older gateway does not send it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ document_id: "d1", chunks_stored: 1 }), { status: 200 })),
    );
    const r = await ingestFile(new File(["x"], "a.txt"), { groups: ["grp"] });
    expect(r).toEqual({ document_id: "d1", chunks_stored: 1 });
  });

  it("throws sentences, not the gateway's detail, for the three failures an operator meets", async () => {
    const fail = (status: number, body: unknown) =>
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

    fail(400, { error: "unsupported_file_type", detail: "weird.xyz" });
    await expect(ingestFile(new File(["x"], "weird.xyz"), { groups: ["g"] })).rejects.toThrow(
      /^\.xyz is not a supported type\. Supported: PDF, Markdown, text and code files, images\.$/,
    );

    fail(400, {
      error: "bad_request",
      detail: "No API key configured: set KB_EXTRACT_VISION_API_KEY or OPENROUTER_API_KEY",
    });
    await expect(ingestFile(new File(["x"], "pixel.png"), { groups: ["g"] })).rejects.toThrow(
      "Image uploads need an OCR / vision key. Add one under Knowledge Base settings.",
    );

    fail(502, { error: "gateway_unreachable", detail: "fetch failed" });
    await expect(ingestFile(new File(["x"], "a.txt"), "conv-1")).rejects.toThrow(
      "The console could not reach the RantaiClaw gateway. Retry once it is back.",
    );
  });
});

describe("listConversationFiles", () => {
  it("keeps only the documents whose categories name the conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { id: "d1", title: "a.md", categories: ["conv-1"] },
              { id: "d2", title: "b.md", categories: ["conv-2"] },
              { id: "d3", title: "c.md", categories: ["conv-1", "other"] },
              { id: "d4", title: "d.md", categories: [] },
            ]),
            { status: 200 },
          ),
      ),
    );
    expect(await listConversationFiles("conv-1")).toEqual([
      { document_id: "d1", title: "a.md" },
      { document_id: "d3", title: "c.md" },
    ]);
  });

  it("requests the document list through the console proxy", async () => {
    const m = vi.fn(async (_url: string, _init?: RequestInit) => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", m);
    await listConversationFiles("conv-1");
    expect(m.mock.calls[0][0]).toBe("/api/rc/kb/documents");
  });

  it("returns no files when the knowledge base is off or the request fails", async () => {
    for (const reply of [
      () => new Response("nope", { status: 404 }),
      () => new Response("boom", { status: 500 }),
      () => new Response("not json", { status: 200 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => reply()));
      expect(await listConversationFiles("conv-1")).toEqual([]);
    }
  });

  it("returns no files when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await listConversationFiles("conv-1")).toEqual([]);
  });
});
