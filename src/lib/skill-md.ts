/**
 * Reading and patching a `SKILL.md` document.
 *
 * The editor holds exactly one piece of state: the raw markdown text. The Form
 * view is a *projection* of that text — it reads values out and writes edits
 * back into their regions. It is not a second copy of the data.
 *
 * That is the whole point. If form fields and markdown were held separately,
 * every switch between them would be a conversion, and conversions lose things:
 * a `## Troubleshooting` section the user typed by hand has no field to live in
 * and would vanish on the way back. With one text there is nothing to convert,
 * so nothing can be lost.
 *
 * Consequently `writeField` must always patch a region and leave every byte
 * outside it alone. Regenerating the document from known fields would
 * reintroduce exactly the loss this design exists to prevent.
 */

export interface SkillFields {
  name: string;
  description: string;
  tags: string[];
  instructions: string[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const INSTRUCTIONS_HEADING = /^##[ \t]+Instructions[ \t]*$/im;

/** The frontmatter block's inner text plus its bounds in `md`. */
function frontmatterSpan(md: string): { body: string; start: number; end: number } | null {
  const m = FRONTMATTER.exec(md);
  if (!m) return null;
  const body = m[1];
  const start = m[0].indexOf(body);
  return { body, start, end: start + body.length };
}

/** Value of a single-line `key: value` entry inside the frontmatter. */
function readFrontmatterValue(body: string, key: string): string | null {
  for (const line of body.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim() !== key) continue;
    return line.slice(idx + 1).trim();
  }
  return null;
}

/**
 * Parse `tags: [a, b]`. The gateway's loader is line-based and reads the same
 * single-line bracket form, so anything else is not a tag list we can edit.
 */
function parseTagList(raw: string | null): string[] {
  if (!raw) return [];
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Strip everything that would break out of a single-line `tags: [a, b]` entry.
 * The loader parses frontmatter line by line, so an embedded newline would
 * inject a whole new key — and `[`/`]`/`,` would add or end list elements.
 */
function sanitizeTag(tag: string): string {
  return tag
    .replace(/\s+/g, " ")
    .replace(/[[\],]/g, "")
    .trim();
}

/** Collapse to one line. Same reason as `sanitizeTag`: the loader is line-based. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The `## Instructions` list: bounds of the block and its `- ` items. */
function instructionsSpan(
  md: string,
): { items: string[]; start: number; end: number } | null {
  const heading = INSTRUCTIONS_HEADING.exec(md);
  if (!heading) return null;
  const afterHeading = heading.index + heading[0].length;
  const rest = md.slice(afterHeading);

  const lines = rest.split("\n");
  const items: string[] = [];
  let consumed = 0;
  for (const line of lines) {
    const isBullet = /^[ \t]*-[ \t]+/.test(line);
    const isBlank = line.trim() === "";
    // Stop at the first line that is neither a bullet nor blank padding —
    // the next heading, or prose. Trailing blanks before it are not consumed.
    if (!isBullet && !isBlank) break;
    if (isBullet) {
      items.push(line.replace(/^[ \t]*-[ \t]+/, "").trim());
      consumed += line.length + 1;
    } else if (items.length === 0) {
      consumed += line.length + 1; // blank line between heading and first item
    } else {
      break;
    }
  }
  return { items, start: afterHeading, end: afterHeading + consumed };
}

/**
 * Read the four editable fields, or `null` when the document does not match the
 * shape the Form view can safely patch.
 *
 * `null` is not a failure — it means "edit this in Markdown". The caller
 * disables the Form tab rather than degrading field by field, so there is one
 * rule to explain instead of a matrix.
 */
export function readFields(md: string): SkillFields | null {
  const fm = frontmatterSpan(md);
  if (!fm) return null;
  const name = readFrontmatterValue(fm.body, "name");
  if (name === null || name.trim() === "") return null;
  const instructions = instructionsSpan(md);
  if (!instructions) return null;

  return {
    name: name.trim(),
    description: (readFrontmatterValue(fm.body, "description") ?? "").trim(),
    tags: parseTagList(readFrontmatterValue(fm.body, "tags")),
    instructions: instructions.items,
  };
}

/** Replace, or append, a single-line `key: value` inside the frontmatter. */
function patchFrontmatter(md: string, key: string, rendered: string): string {
  const fm = frontmatterSpan(md);
  if (!fm) return md;
  const lines = fm.body.split(/\r?\n/);
  const idx = lines.findIndex((line) => {
    const i = line.indexOf(":");
    return i !== -1 && line.slice(0, i).trim() === key;
  });
  if (idx === -1) lines.push(`${key}: ${rendered}`);
  else lines[idx] = `${key}: ${rendered}`;
  return md.slice(0, fm.start) + lines.join("\n") + md.slice(fm.end);
}

/**
 * Return a new document with one field replaced. Every byte outside that
 * field's region is preserved — including sections the form has no concept of.
 */
export function writeField<K extends keyof SkillFields>(
  md: string,
  key: K,
  value: SkillFields[K],
): string {
  switch (key) {
    case "name":
      return patchFrontmatter(md, "name", oneLine(value as string));
    case "description":
      return patchFrontmatter(md, "description", oneLine(value as string));
    case "tags": {
      const tags = (value as string[]).map(sanitizeTag).filter(Boolean);
      return patchFrontmatter(md, "tags", `[${tags.join(", ")}]`);
    }
    case "instructions": {
      const span = instructionsSpan(md);
      if (!span) return md;
      const items = (value as string[]).map((i) => oneLine(i)).filter(Boolean);
      const block = items.length ? `\n${items.map((i) => `- ${i}`).join("\n")}\n` : "\n- \n";
      return md.slice(0, span.start) + block + md.slice(span.end);
    }
    default:
      return md;
  }
}

/** Starting document for a new skill — the shape `readFields` can parse. */
export function emptyTemplate(name = ""): string {
  return `---\nname: ${name}\ndescription: \ntags: []\n---\n\n# ${name}\n\n## Instructions\n- \n`;
}

/**
 * Preview of the directory the server will create.
 *
 * Mirrors the Rust `slugify` rule (lowercase, runs of non-alphanumerics to a
 * single `-`, trimmed, capped at 64). **Preview only** — the server derives the
 * real slug from the `name:` inside the document and is authoritative. Never
 * send this as if it were the address.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 64).replace(/^-+|-+$/g, "");
}
