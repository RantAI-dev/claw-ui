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

  it("returns null when name is empty", () => {
    expect(readFields(DOC.replace("name: Kopi Pagi", "name:   "))).toBeNull();
  });

  it("reads the template it ships", () => {
    expect(readFields(emptyTemplate("Kopi Pagi"))).not.toBeNull();
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
