// Mirrors the RantaiClaw /api/v1 response shapes (see docs/DESIGN.md §5).

export interface SessionSummary {
  id: string;
  title: string | null;
  model: string | null;
  started_at: number | string | null;
  message_count: number;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
  timestamp: number | string | null;
}

export interface SessionDetail {
  id: string;
  title: string | null;
  model: string | null;
  started_at: number | string | null;
  messages: SessionMessage[];
}

export interface SearchResult {
  session_id: string;
  session_title: string | null;
  role: string;
  content: string;
  timestamp: number | string | null;
  rank: number;
}

export interface StatusInfo {
  version: string;
  provider: string;
  model: string;
  memory_backend: string;
  /** Raw enforcement level — `Supervised`, `ReadOnly`, or `Full`. */
  autonomy: string;
  /** Active preset rung. Absent on older gateways: the level alone cannot tell
   *  Manual from Smart, since both are `Supervised`. */
  autonomy_preset?: string;
  workspace_dir: string;
  paired: boolean;
  runtime: unknown;
}

export interface DoctorResult {
  name: string;
  category: string;
  severity: string;
  message: string;
  hint: string | null;
  duration_ms: number;
}

export interface Insights {
  total_sessions: number;
  total_messages: number;
  avg_messages_per_session: number;
  latest_session_id: string | null;
  latest_session_started_at: number | string | null;
}

export interface Skill {
  name: string;
  version: string | null;
  description: string | null;
  tags: string[];
  tools: string[];
  enabled?: boolean;
  active?: boolean;
  reasons?: string[];
}

export interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  stars?: number;
  downloads?: number;
  version?: string;
}

export interface SecretsInfo {
  provider: string;
  api_url: string | null;
  api_key_present: boolean;
  encrypt_at_rest: boolean;
}

export type CronSchedule =
  | { kind: "cron"; expr: string; tz?: string | null }
  | { kind: "at"; at: string }
  | { kind: "every"; every_ms: number };

export interface MemoryEntry {
  key: string;
  category: string;
  content: string;
  timestamp: number | string | null;
  session_id: string | null;
}

export interface MemoryStats {
  backend: string;
  total_entries: number;
  healthy: boolean;
}

export interface Personality {
  profile: string;
  preset: string | null;
  name?: string;
  timezone?: string;
  role?: string | null;
  tone?: string | null;
  avoid?: string | null;
  configured?: boolean;
  /** KB group ids the agent always retrieves from, regardless of per-chat selection. */
  always_on_kbs?: string[];
}

// ---- Knowledge Base groups ----
export interface KbGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  document_count?: number;
  created_at?: number | string | null;
  updated_at?: number | string | null;
}

export interface KnowledgeStatus {
  embedding_configured: boolean;
  vision_configured: boolean;
  /** Effective source of the embedding key, reported without revealing it. */
  source: "config" | "env" | "none";
}

export interface KbDocument {
  id: string;
  title: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: number | string | null;
  categories?: string[];
  mime_type?: string | null;
  retrieval_count?: number;
  updated_at?: number | string | null;
}

// Full document record — GET /api/v1/kb/documents/{id}. Mirrors the Rust
// `Document` struct: `id` is a serde newtype (plain string), the timestamps
// serialize as ISO 8601 strings, and `content` carries the full extracted text.
export interface KbDocumentDetail {
  id: string;
  title: string | null;
  content: string;
  file_type: string | null;
  file_size: number | null;
  created_at: number | string | null;
  categories?: string[];
  subcategory?: string | null;
  mime_type?: string | null;
  retrieval_count?: number;
  updated_at?: number | string | null;
}

// ---- KB Document Intelligence (SP-2 entity/relation graph) ----
// Whole-KB knowledge graph — GET /api/v1/kb/graph?group=&limit=
export interface KbGraphNode {
  id: string;
  name: string;
  entity_type: string;
  degree: number;
  doc_count: number;
}
export interface KbGraphEdge {
  source: string;
  target: string;
  relation_type: string;
  /** Number of source relation rows collapsed into this deduped edge. */
  weight?: number;
}
/** Whether intelligence extraction is on, and the model it uses. */
export interface KbCapability {
  intelligence_enabled: boolean;
  extraction_model: string;
}
export interface KbGraph {
  nodes: KbGraphNode[];
  edges: KbGraphEdge[];
  stats?: {
    total_nodes?: number;
    total_edges?: number;
    /** Scope-wide totals (before the top-N cap); `truncated` when capped below. */
    corpus_entities?: number;
    corpus_relations?: number;
    truncated?: boolean;
  };
  capability?: KbCapability;
}

// Per-document extracted intelligence — GET /api/v1/kb/documents/{id}/intelligence
export interface KbEntity {
  id: string;
  name: string;
  entity_type: string;
  confidence: number;
}
export interface KbRelation {
  id: string;
  source: string;
  target: string;
  relation_type: string;
  confidence: number;
}
export interface KbDocumentIntelligence {
  entities: KbEntity[];
  relations: KbRelation[];
  stats?: {
    total_entities?: number;
    total_relations?: number;
    entity_types?: Record<string, number>;
    relation_types?: Record<string, number>;
  };
  capability?: KbCapability;
}
// POST /api/v1/kb/documents/{id}/re-extract → re-run extraction (returns counts)
export interface KbReExtractResult {
  document_id: string;
  entities: number;
  relations: number;
}

export interface ChannelsInfo {
  configured: string[];
  count: number;
}

/** Result of the "connect Telegram" / allowlist-update flow (validate + persist). */
export interface TelegramConnectResult {
  connected: boolean;
  channel: string;
  /** Bot username from the live `getMe` probe — null on an allowlist-only update. */
  bot_username: string | null;
  allowed_users: number;
  experimental?: boolean;
  warning?: string | null;
  note?: string;
}

export interface ProviderInfo {
  id: string;
  display_name: string;
  aliases: string[];
  local: boolean;
}

/** A provider's model catalog, served by the gateway from the same cache the TUI uses. */
export interface ModelCatalog {
  provider: string;
  models: string[];
  default: string;
  /** "cache" (from models_cache.json) or "curated" (hardcoded fallback). */
  source: string;
  age_secs: number | null;
  count: number;
}

export interface CronJob {
  id: string;
  name: string | null;
  expression: string;
  schedule: CronSchedule;
  job_type: string; // "agent" | "shell"
  command: string;
  prompt: string | null;
  session_target: string; // "isolated" | "main"
  model: string | null;
  enabled: boolean;
  delete_after_run: boolean;
  created_at: string;
  delivery: { mode: string; channel: string | null; to: string | null; best_effort: boolean };
  next_run: string | number | null;
  last_run: string | number | null;
  last_status: string | null;
  last_output: string | null;
}

export interface CronRun {
  id: number;
  job_id: string;
  started_at: string;
  finished_at: string;
  status: string; // "ok" | "error"
  output: string | null;
  duration_ms: number | null;
}

// ---- Chat SSE event frames ----
export type ChatEvent =
  | { type: "chunk"; text: string }
  | { type: "usage"; model: string; prompt: number; completion: number; total: number; cost_usd: number }
  | { type: "tool_call_start"; id: string; name: string; args: unknown }
  | { type: "tool_call_end"; id: string; ok: boolean; output_preview: string }
  | { type: "approval_request"; id: string; tool: string; args: unknown }
  | { type: "error"; message: string }
  | { type: "done"; text: string; cancelled: boolean; session_id?: string | null }
  | { type: "reload_complete" }
  | { type: "compaction_start"; original_count: number; keep_last: number }
  | { type: "compaction_complete"; summary: string; original_count: number; keep_last: number; kept_count: number };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolCalls?: ToolCall[];
  usage?: { total: number; cost_usd: number } | null;
  error?: string | null;
  /** Assistant turn was stopped/aborted before completing. Excluded — together
   *  with its paired user message — from the SENT history so a cancelled topic
   *  never bleeds into the next prompt. */
  cancelled?: boolean;
  /** KB document titles retrieved for this assistant turn (citations). */
  sources?: string[];
  /** Filenames the user had attached when sending this user turn. */
  attachments?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  args?: unknown;
  ok?: boolean;
  outputPreview?: string;
  done?: boolean;
}

// A document attached to a chat and ingested into the KB (scoped by conversation id).
export interface Attachment {
  id: string;
  name: string;
  chunks: number;
  status: "uploading" | "ready" | "error";
  error?: string;
}
