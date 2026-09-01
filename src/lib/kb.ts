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

export function countLine(groups: number, docs: number): string {
  return `${formatNumber(groups)} knowledge base${groups === 1 ? "" : "s"} · ${formatNumber(docs)} document${docs === 1 ? "" : "s"}`;
}
