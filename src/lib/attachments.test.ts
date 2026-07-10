import { describe, it, expect, vi, afterEach } from "vitest";
import { ingestFile } from "./attachments";

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
});
