import { describe, expect, it } from "vitest";
import { emptyTemplate, readFields, slugify, writeField } from "./skill-md";

const DOC = `---
name: Kopi Pagi
description: Panduan menyeduh kopi V60.
tags: [coffee, v60]
---

# Kopi Pagi

## Instructions
- Rasio 1:15 sampai 1:17
- Bloom 30-45 detik

## Troubleshooting
Terlalu asam: gilingan lebih halus.
`;

/** Type `text` the way the form does — one keystroke at a time, each one a
 *  full write-into-the-markdown / read-back-out round trip. */
function type(md: string, key: "name" | "description", text: string): string {
  let doc = md;
  for (const ch of text) {
    doc = writeField(doc, key, (readFields(doc)?.[key] ?? "") + ch);
  }
  return doc;
}

describe("readFields", () => {
  it("reads the four editable fields", () => {
    expect(readFields(DOC)).toEqual({
      name: "Kopi Pagi",
      description: "Panduan menyeduh kopi V60.",
      tags: ["coffee", "v60"],
      instructions: ["Rasio 1:15 sampai 1:17", "Bloom 30-45 detik"],
    });
  });

  it("returns null when the document has no frontmatter", () => {
    expect(readFields("# Just a heading\n")).toBeNull();
  });

  it("returns null when the Instructions list is gone", () => {
    // The Form view cannot safely patch a document it cannot locate regions
    // in, so the caller disables the tab rather than guessing.
    expect(readFields(DOC.replace("## Instructions", "## Steps"))).toBeNull();
  });

  it("still reads a document whose name is blank", () => {
    // This asserted `toBeNull()` before, which encoded the bug: a blank name
    // is the normal starting state of a skill being written, not a document
    // the form cannot handle. Whether it is *saveable* is a separate question
    // the editor and the gateway both answer.
    const blank = readFields(DOC.replace("name: Kopi Pagi", "name:   "));
    expect(blank).not.toBeNull();
    expect(blank?.name).toBe("");
    expect(blank?.description).toBe("Panduan menyeduh kopi V60.");
  });

  it("returns null when the name key is missing entirely", () => {
    // Distinct from an empty value: there is no line for the form to patch.
    const noName = "---\ndescription: x\n---\n\n## Instructions\n- a\n";
    expect(readFields(noName)).toBeNull();
  });

  it("reads the template the editor actually opens with", () => {
    // Regression. The earlier version of this test passed a name —
    // `emptyTemplate("Kopi Pagi")` — but the editor calls `emptyTemplate()`
    // with none, so the empty-name path was never exercised. `readFields`
    // rejected it, and every new skill opened straight into the markdown view
    // under "this file's structure was changed by hand". Caught by clicking
    // the button, not by this suite.
    const fields = readFields(emptyTemplate());
    expect(fields).not.toBeNull();
    expect(fields?.name).toBe("");
    // The template ships one empty bullet, so the form opens with a single
    // blank step ready to type into rather than no rows at all.
    expect(fields?.instructions).toEqual([""]);
  });

  it("reads the template when a name is supplied", () => {
    expect(readFields(emptyTemplate("Kopi Pagi"))?.name).toBe("Kopi Pagi");
  });
});

describe("writeField", () => {
  it("preserves sections the form has no field for", () => {
    // This is the property the whole single-source-of-truth design exists for.
    const out = writeField(DOC, "description", "Diperbarui.");
    expect(out).toContain("## Troubleshooting");
    expect(out).toContain("Terlalu asam: gilingan lebih halus.");
    expect(readFields(out)?.description).toBe("Diperbarui.");
  });

  it("keeps the title heading in step with the name", () => {
    // Regression: the form patched only the frontmatter, so a skill created
    // through the console shipped with a bare `# ` as its visible title — and
    // that heading is part of the body the model reads.
    const out = writeField(emptyTemplate(), "name", "Kopi Sore");
    expect(out).toContain("name: Kopi Sore");
    expect(out).toContain("# Kopi Sore");
    expect(out).not.toMatch(/^# *$/m);
  });

  it("does not mistake a sub-heading for the title", () => {
    const out = writeField(DOC, "name", "Kopi Sore");
    expect(out).toContain("# Kopi Sore");
    expect(out).toContain("## Instructions");
    expect(out).toContain("## Troubleshooting");
  });

  it("leaves the other fields untouched", () => {
    const out = writeField(DOC, "name", "Kopi Sore");
    const fields = readFields(out);
    expect(fields?.name).toBe("Kopi Sore");
    expect(fields?.description).toBe("Panduan menyeduh kopi V60.");
    expect(fields?.tags).toEqual(["coffee", "v60"]);
    expect(fields?.instructions).toHaveLength(2);
  });

  it("round-trips instructions without touching the next heading", () => {
    const out = writeField(DOC, "instructions", ["Satu", "Dua", "Tiga"]);
    expect(readFields(out)?.instructions).toEqual(["Satu", "Dua", "Tiga"]);
    expect(out).toContain("## Troubleshooting");
  });

  it("lets a space be typed in the middle of a value", () => {
    // Regression. The form has no state of its own: every keystroke writes the
    // whole field into the markdown and reads it back out. Both halves used to
    // trim, so a trailing space was deleted before the next character arrived
    // and "Kopi Pagi" could only ever be typed as "KopiPagi".
    expect(readFields(type(emptyTemplate(), "name", "Kopi Pagi"))?.name).toBe(
      "Kopi Pagi",
    );
    const blank = writeField(DOC, "description", "");
    expect(
      readFields(type(blank, "description", "Dua kata"))?.description,
    ).toBe("Dua kata");
  });

  it("keeps a step the user has emptied out", () => {
    // Same root cause on the list: normalizing during editing dropped a blank
    // row, so "Add step" did nothing while other steps existed, and clearing a
    // step deleted it mid-edit.
    const out = writeField(DOC, "instructions", ["Satu", ""]);
    expect(readFields(out)?.instructions).toEqual(["Satu", ""]);
  });

  it("collapses a multi-line description to one line", () => {
    // The loader parses frontmatter line by line: a newline here would be read
    // as the start of a new key.
    const out = writeField(DOC, "description", "Baris satu\nbaris dua");
    expect(out).toContain("description: Baris satu baris dua");
    expect(readFields(out)?.description).toBe("Baris satu baris dua");
  });

  it("strips characters that would break out of the tag list", () => {
    const out = writeField(DOC, "tags", ["ok", "ev]il, metadata: x", "a\nb"]);
    expect(out).toContain("tags: [ok, evil metadata: x, a b]");
    expect(readFields(out)?.tags).toEqual(["ok", "evil metadata: x", "a b"]);
  });

  it("is a no-op when the region cannot be found", () => {
    const noFm = "# Heading\n\n## Instructions\n- x\n";
    expect(writeField(noFm, "name", "X")).toBe(noFm);
  });
});

describe("slugify", () => {
  it("mirrors the server rule", () => {
    expect(slugify("Kopi Pagi")).toBe("kopi-pagi");
    expect(slugify("  Kopi   Pagi!! ")).toBe("kopi-pagi");
    expect(slugify("Weather Reporter")).toBe("weather-reporter");
  });

  it("returns empty when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = slugify("a".repeat(70) + " b");
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("-")).toBe(false);
  });
});
