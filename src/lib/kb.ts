// Words and rules for the Knowledge Bases panel that do not need React: the
// sentences an upload failure or a thin extraction is reported with, the
// removal confirms, duplicate detection and the count line. Kept out of the
// component so a test can pin each sentence and so the chat composer's
// attachment path (which shares `ingestFile`) reports the same failure the
// same way.
import { formatNumber } from "@/lib/utils";

/** The accept list in words, for the failure sentence and the dropzone hint. */
export const SUPPORTED_UPLOADS = "PDF, Markdown, text and code files, images";

function extensionOf(name: string): string | null {
  const m = /(\.[^./\\\s]+)$/.exec(name.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * One sentence for a failed ingest, from the proxy's or the gateway's error
 * body. The gateway's `unsupported_file_type` carries only the filename as
 * `detail`, so without this mapping the operator read the filename twice and
 * nothing else; its missing-OCR-key failure names an env var the console user
 * never sees.
 */
export function describeIngestError(input: {
  status: number;
  body: unknown;
  text: string;
  statusText: string;
}): string {
  const obj = (input.body ?? null) as { error?: unknown; detail?: unknown } | null;
  const error = typeof obj?.error === "string" ? obj.error : "";
  const detail = typeof obj?.detail === "string" ? obj.detail : "";

  if (error === "unsupported_file_type") {
    const ext = extensionOf(detail);
    return `${ext ?? "this file"} is not a supported type. Supported: ${SUPPORTED_UPLOADS}.`;
  }
  if (/KB_EXTRACT_VISION_API_KEY/.test(detail)) {
    return "Image uploads need an OCR / vision key. Add one under Knowledge Base settings.";
  }
  if (error === "file_too_large") {
    return "too large (max 20 MB)";
  }
  if (error === "gateway_unreachable" || /could not reach/i.test(detail)) {
    return "The console could not reach the RantaiClaw gateway. Retry once it is back.";
  }
  if (input.status === 404 && detail) {
    return detail;
  }
  return detail || error || input.text.slice(0, 200) || input.statusText;
}

/**
 * The row text after a successful ingest. The gateway measures how much text
 * it extracted and flags a thin result (under ~100 characters per page); a
 * document that extracted poorly will retrieve poorly, and the operator is the
 * only one who can act on that. An older gateway that sends no measurement
 * reads as plain "ready", never as thin.
 */
export function ingestNote(r: {
  chunks_stored: number;
  chars_extracted?: number;
  low_text_density?: boolean;
}): { text: string; thin: boolean } {
  if (typeof r.chars_extracted !== "number") return { text: "ready", thin: false };
  const n = formatNumber(r.chars_extracted);
  if (r.low_text_density) {
    return { text: `ready, thin: ${n} characters extracted; it may retrieve poorly`, thin: true };
  }
  return { text: `ready · ${n} characters extracted`, thin: false };
}

/**
 * The delete-knowledge-base confirm. The console has no view of documents
 * outside a knowledge base, so a document whose last base is deleted is gone
 * from this UI (the CLI still lists it); the words say that instead of naming
 * a "library" the operator cannot visit here.
 */
export function deleteGroupCopy(g: { name: string; document_count?: number | null }): {
  title: string;
  body: string;
} {
  const n = g.document_count ?? 0;
  const title = "Delete knowledge base";
  if (n === 0) return { title, body: `Delete “${g.name}”? It holds no documents.` };
  const s = n === 1 ? "" : "s";
  const verb = n === 1 ? "is" : "are";
  return {
    title,
    body: `Delete “${g.name}”? Its ${formatNumber(n)} document${s} ${verb} not deleted, but any that belong to no other knowledge base disappear from this console (rantaiclaw kb list still shows them).`,
  };
}

export function unlinkDocCopy(docTitle: string, groupName: string): string {
  return `Remove “${docTitle}” from “${groupName}”? It is not deleted. It stays in any other knowledge base that lists it; if this was the only one, it disappears from this console (rantaiclaw kb list still shows it).`;
}

export function deleteDocCopy(docTitle: string): string {
  return `Delete “${docTitle}”? It leaves every knowledge base and stops being used for retrieval.`;
}

/** The gateway titles a document by its file stem (`notes.md` → `notes`). */
export function fileStem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}

/** Stems of the given files that already exist as titles, deduped, in order. */
export function duplicateTitles(
  files: { name: string }[],
  existing: { title: string | null }[],
): string[] {
  const titles = new Set(existing.map((d) => d.title).filter((t): t is string => !!t));
  const out: string[] = [];
  for (const f of files) {
    const stem = fileStem(f.name);
    if (titles.has(stem) && !out.includes(stem)) out.push(stem);
  }
  return out;
}

/**
 * The page's opening answer: can the agent retrieve, and from what? Follows
 * the Status / Channels / Providers / Schedules / Skills verdicts: a headline
 * with a tone dot, a mono meta line of counts, a detail that says the next
 * move when the tone is orange.
 */
export interface KbVerdict {
  headline: string;
  tone: "ok" | "warn";
  meta: string[];
  detail?: string;
}

export function kbVerdict(
  status: {
    enabled?: boolean;
    embedding_configured: boolean;
    vision_configured: boolean;
    source: string;
  },
  groups: { document_count?: number | null }[] | null,
): KbVerdict {
  const enabled = status.enabled ?? status.embedding_configured;
  if (!enabled) {
    if (status.embedding_configured) {
      return {
        headline: "Document retrieval is off",
        tone: "warn",
        meta: ["key stored"],
        detail: "Activate to resume retrieval. The key is kept.",
      };
    }
    return {
      headline: "Document retrieval is off",
      tone: "warn",
      meta: [],
      detail: "Add an embedding key to activate the Knowledge Base.",
    };
  }
  const bases = groups?.length ?? 0;
  const docs = (groups ?? []).reduce((n, g) => n + (g.document_count ?? 0), 0);
  if (bases === 0) {
    return {
      headline: "Nothing to retrieve yet",
      tone: "warn",
      meta: ["0 knowledge bases"],
      detail: "Create a knowledge base and upload documents into it.",
    };
  }
  const baseMeta = `${formatNumber(bases)} knowledge base${bases === 1 ? "" : "s"}`;
  if (docs === 0) {
    return {
      headline: "No documents to retrieve yet",
      tone: "warn",
      meta: [baseMeta],
      detail: "Upload files into a base so the agent can draw on them.",
    };
  }
  return {
    headline: `${formatNumber(docs)} document${docs === 1 ? "" : "s"} ready to retrieve`,
    tone: "ok",
    meta: [baseMeta, `OCR ${status.vision_configured ? "on" : "off"}`, `key from ${status.source}`],
  };
}

// ── Colours ──────────────────────────────────────────────────────────────────

/**
 * The knowledge-base colour presets: the console's accent tokens. The hex is
 * mirrored from `globals.css` because the value is persisted by the gateway
 * and read back by the chat picker's dot, which cannot resolve a `var()`.
 */
export const KB_PRESETS: { name: string; hex: string }[] = [
  { name: "Orange", hex: "#bb7851" },
  { name: "Blue", hex: "#0d63d0" },
  { name: "Green", hex: "#80cb87" },
  { name: "Teal", hex: "#388ca1" },
  { name: "Sea green", hex: "#32836a" },
  { name: "Purple", hex: "#574399" },
  { name: "Red", hex: "#bb5153" },
  { name: "Cornflower", hex: "#517fbb" },
];
/** A new base starts blue (the brand family); the same one every time. */
export const DEFAULT_KB_PRESET = KB_PRESETS[1].hex;
/** The tile colour when the gateway stored none. */
export const DEFAULT_KB_COLOR = "var(--brand-sky)";
/** `--brand-ink`, as a hex for contrast maths. */
export const INK_HEX = "#050a30";

export function isPreset(hex: string | null | undefined): boolean {
  return !!hex && KB_PRESETS.some((p) => p.hex.toLowerCase() === hex.toLowerCase());
}

export function presetName(hex: string): string | null {
  return KB_PRESETS.find((p) => p.hex.toLowerCase() === hex.toLowerCase())?.name ?? null;
}

const HEX6 = /^#([0-9a-f]{6})$/i;

/** WCAG relative luminance of a `#rrggbb` colour; `null` for anything else. */
export function relativeLuminance(hex: string): number | null {
  const m = HEX6.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two `#rrggbb` colours (1 when either is not hex). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The glyph colour for a colour tile: ink on light colours, white on dark
 * ones. The threshold (luminance 0.2) puts every preset and every colour the
 * old picker could have stored on the passing side of 3:1; a non-hex value
 * (the sky default) is light, so it gets ink.
 */
export function tileInk(color: string | null | undefined): string {
  const lum = color ? relativeLuminance(color) : null;
  if (lum === null) return "var(--brand-ink)";
  return lum >= 0.2 ? "var(--brand-ink)" : "#ffffff";
}
