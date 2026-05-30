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
  autonomy: string;
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
}

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
}

export interface ChannelsInfo {
  configured: string[];
  count: number;
}

export interface ProviderInfo {
  id: string;
  display_name: string;
  aliases: string[];
  local: boolean;
}

// ---- Chat SSE event frames ----
export type ChatEvent =
  | { type: "chunk"; text: string }
  | { type: "usage"; model: string; prompt: number; completion: number; total: number; cost_usd: number }
  | { type: "tool_call_start"; id: string; name: string; args: unknown }
  | { type: "tool_call_end"; id: string; ok: boolean; output_preview: string }
  | { type: "error"; message: string }
  | { type: "done"; text: string; cancelled: boolean }
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
}

export interface ToolCall {
  id: string;
  name: string;
  args?: unknown;
  ok?: boolean;
  outputPreview?: string;
  done?: boolean;
}
