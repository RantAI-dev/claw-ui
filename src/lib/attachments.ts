// Client-side helpers for chat document attachments. Files are ingested into
// the RantaiClaw KB (scoped per-conversation via the `categories`/`category`
// field == a client-generated conversation id), then relevant chunks are
// retrieved on each send and injected into the SENT message only.
import { describeIngestError } from "@/lib/kb";

// Accepted upload extensions: documents + common code/text formats.
// Source of truth: RantAIClaw src/kb/file/mod.rs (MARKDOWN/PDF/IMAGE/TEXT
// extension lists) — every entry here MUST appear there or the upload
// transfers fully and then fails server-side. .docx/.xlsx are deliberately
// absent: they need the non-default kb-office build feature (RantAIClaw
// plan 111 option (a) — a stock gateway rejects them after the transfer).
export const ACCEPT_EXTS = [
  ".pdf",
  ".md",
  ".txt",
  ".csv",
  ".json",
  // common code extensions
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".rb",
  ".php",
  ".sh",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
  ".sql",
];

export const MAX_FILES = 5;
export const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** Value for an <input type="file" accept=...> attribute. */
export function acceptAttr(): string {
  return ACCEPT_EXTS.join(",");
}

// Images are ingested the same way as documents — the KB's vision-LLM
// extractor posts them to a chat-completions endpoint at ingest time, so a
// vision-capable model AND a credential ARE required (the old comment
// claimed otherwise — plan 111).
export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic"];

/** Value for an image <input type="file" accept=...> attribute. */
export function imageAcceptAttr(): string {
  return IMAGE_EXTS.join(",");
}

export interface IngestResult {
  document_id: string;
  chunks_stored: number;
  /** Characters the gateway extracted from the upload (absent on older gateways). */
  chars_extracted?: number;
  /** The gateway's own "this extracted poorly" flag (under ~100 chars per page). */
  low_text_density?: boolean;
}

/**
 * Ingest scope. Chat attachments pass a conversation id (sent as `categories`
 * for per-conversation retrieval scoping); KB uploads pass `{ groups }` so the
 * gateway links the document to the knowledge-base group(s) at ingest time —
 * no separate link round-trip and no UUID-in-`categories` pollution.
 */
export type IngestScope = string | { groups: string[] };

/**
 * Upload one file to the KB ingest proxy. Throws an Error whose message is an
 * operator sentence (see `describeIngestError`): the gateway's own `detail`
 * for an unsupported type is just the filename, and its missing-OCR-key
 * failure names an env var, so neither is shown raw.
 */
export async function ingestFile(file: File, scope: IngestScope): Promise<IngestResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  // Send the gateway's own field names so the proxy can forward the body
  // verbatim (no server-side re-parse/rename) — see /api/rc/kb/ingest.
  if (typeof scope === "string") {
    form.append("categories", scope);
  } else {
    form.append("groups", scope.groups.join(","));
  }

  const res = await fetch("/api/rc/kb/ingest", { method: "POST", body: form });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new Error(
      describeIngestError({ status: res.status, body: data, text, statusText: res.statusText }),
    );
  }
  const obj = (data || {}) as {
    document_id?: string;
    chunks_stored?: number;
    chars_extracted?: number;
    low_text_density?: boolean;
  };
  const out: IngestResult = {
    document_id: String(obj.document_id || ""),
    chunks_stored: Number(obj.chunks_stored || 0),
  };
  if (typeof obj.chars_extracted === "number") out.chars_extracted = obj.chars_extracted;
  if (typeof obj.low_text_density === "boolean") out.low_text_density = obj.low_text_density;
  return out;
}

export interface KbSearchResult {
  context: string;
  sources: { document_title: string; section?: string; categories: string[] }[];
}

/**
 * Retrieve relevant KB context for a query within a conversation.
 *
 * `category` scopes to this conversation's ad-hoc attachments (as today).
 * `groups` (optional) additionally searches the given KB group ids — the union
 * of the per-chat selection and the persona's always-on bases. Passing groups
 * does not disable the per-conversation attachment search.
 *
 * Never throws — returns an empty result on any error so retrieval can never
 * block sending a message.
 */
export async function kbSearch(
  query: string,
  conversationId: string,
  groups?: string[],
): Promise<KbSearchResult> {
  try {
    const body: { query: string; category: string; top: number; groups?: string[] } = {
      query,
      category: conversationId,
      top: 8,
    };
    if (groups && groups.length) body.groups = groups;
    const res = await fetch("/api/rc/kb/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { context: "", sources: [] };
    const data = (await res.json()) as Partial<KbSearchResult> | null;
    return {
      context: typeof data?.context === "string" ? data.context : "",
      sources: Array.isArray(data?.sources) ? data.sources : [],
    };
  } catch {
    return { context: "", sources: [] };
  }
}
