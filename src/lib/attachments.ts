// Client-side helpers for chat document attachments. Files are ingested into
// the RantaiClaw KB (scoped per-conversation via the `categories`/`category`
// field == a client-generated conversation id), then relevant chunks are
// retrieved on each send and injected into the SENT message only.

// Accepted upload extensions: documents + common code/text formats.
export const ACCEPT_EXTS = [
  ".pdf",
  ".docx",
  ".xlsx",
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
  ".css",
  ".sql",
];

export const MAX_FILES = 5;
export const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** Value for an <input type="file" accept=...> attribute. */
export function acceptAttr(): string {
  return ACCEPT_EXTS.join(",");
}

// Images are ingested the same way as documents — the KB's vision-LLM extractor
// reads them into searchable text at ingest time (no vision chat model needed).
export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/** Value for an image <input type="file" accept=...> attribute. */
export function imageAcceptAttr(): string {
  return IMAGE_EXTS.join(",");
}

export interface IngestResult {
  document_id: string;
  chunks_stored: number;
}

/**
 * Ingest scope. Chat attachments pass a conversation id (sent as `categories`
 * for per-conversation retrieval scoping); KB uploads pass `{ groups }` so the
 * gateway links the document to the knowledge-base group(s) at ingest time —
 * no separate link round-trip and no UUID-in-`categories` pollution.
 */
export type IngestScope = string | { categories: string } | { groups: string[] };

/**
 * Upload one file to the KB ingest proxy. Throws a clear Error on any non-ok
 * response.
 */
export async function ingestFile(file: File, scope: IngestScope): Promise<IngestResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  // Send the gateway's own field names so the proxy can forward the body
  // verbatim (no server-side re-parse/rename) — see /api/rc/kb/ingest.
  if (typeof scope === "string") {
    form.append("categories", scope);
  } else if ("groups" in scope) {
    form.append("groups", scope.groups.join(","));
  } else {
    form.append("categories", scope.categories);
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
    const obj = data as { detail?: unknown; error?: unknown } | null;
    const detail = obj?.detail || obj?.error || text || res.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  const obj = (data || {}) as { document_id?: string; chunks_stored?: number };
  return {
    document_id: String(obj.document_id || ""),
    chunks_stored: Number(obj.chunks_stored || 0),
  };
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
