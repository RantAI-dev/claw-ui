// Client-side API — talks to the Next.js proxy at /api/rc/* (never the gateway directly).
import type {
  ChannelsInfo,
  ClawHubSkill,
  CronJob,
  CronSchedule,
  DoctorResult,
  Insights,
  KbDocument,
  KbDocumentDetail,
  KbDocumentIntelligence,
  KbGraph,
  KbGroup,
  KbReExtractResult,
  KnowledgeStatus,
  MemoryEntry,
  MemoryStats,
  ModelCatalog,
  Personality,
  ProviderInfo,
  SearchResult,
  SecretsInfo,
  SessionDetail,
  SessionSummary,
  Skill,
  StatusInfo,
  TelegramConnectResult,
} from "./types";

async function rc<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/rc/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail || data?.error || res.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const api = {
  status: () => rc<StatusInfo>("status"),
  doctor: () => rc<{ results: DoctorResult[] }>("doctor"),
  insights: () => rc<Insights>("insights"),
  sessions: (limit = 100) =>
    rc<{ sessions: SessionSummary[]; count: number }>(`sessions?limit=${limit}`),
  session: (id: string) => rc<SessionDetail>(`sessions/${encodeURIComponent(id)}`),
  searchSessions: (query: string, limit = 30) =>
    rc<{ results: SearchResult[]; count: number }>("sessions/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),
  setSessionTitle: (id: string, title: string) =>
    rc<{ id: string; title: string }>(`sessions/${encodeURIComponent(id)}/title`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    }),
  deleteSession: (id: string) =>
    rc<{ deleted: boolean; id: string }>(`sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  skills: () => rc<{ skills: Skill[]; count: number }>("skills"),
  memory: (limit = 100) =>
    rc<{ entries: MemoryEntry[]; count: number }>(`memory?limit=${limit}`),
  memoryStats: () => rc<MemoryStats>("memory/stats"),
  personality: () => rc<Personality>("personality"),
  setPersonality: (body: {
    preset?: string;
    name?: string;
    role?: string;
    tone?: string;
    avoid?: string;
    always_on_kbs?: string[];
  }) =>
    rc<Personality>("personality", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  /** Resolve an in-browser tool-approval modal raised mid-chat (WebModal backend). */
  resolveApproval: (id: string, approve: boolean) =>
    rc<{ resolved: boolean; id: string; approved: boolean }>(
      `approvals/${encodeURIComponent(id)}`,
      { method: "POST", body: JSON.stringify({ approve }) },
    ),
  channels: () => rc<ChannelsInfo>("channels"),
  // Experimental: connect a Telegram channel from the console. The gateway
  // validates the token against Telegram (getMe) before persisting it.
  connectTelegram: (bot_token: string, allowed_users: string[]) =>
    rc<TelegramConnectResult>("channels/telegram", {
      method: "POST",
      body: JSON.stringify({ bot_token, allowed_users }),
    }),
  // Update the allowlist of an already-connected Telegram channel without
  // re-sending the bot token (the gateway keeps the saved token).
  updateTelegramAllowlist: (allowed_users: string[]) =>
    rc<TelegramConnectResult>("channels/telegram", {
      method: "POST",
      body: JSON.stringify({ allowed_users }),
    }),
  disconnectTelegram: () =>
    rc<{ disconnected: boolean; channel: string }>("channels/telegram", {
      method: "DELETE",
    }),
  providers: () => rc<{ providers: ProviderInfo[]; count: number }>("providers"),
  // Model catalog for a provider — resolved by the gateway from the SAME on-disk
  // cache + curated fallback the TUI uses, so the UI never drifts. `source` is
  // "cache" | "curated"; `refreshProviderModels` repopulates the cache from the
  // live provider API (mirrors `rantaiclaw models refresh`).
  providerModels: (id: string) =>
    rc<ModelCatalog>(`providers/${encodeURIComponent(id)}/models`),
  refreshProviderModels: (id: string) =>
    rc<ModelCatalog>(`providers/${encodeURIComponent(id)}/models/refresh`, { method: "POST" }),
  cron: () => rc<{ jobs: CronJob[]; count: number }>("cron"),
  createCron: (body: { schedule: CronSchedule; prompt: string; name?: string; model?: string }) =>
    rc<CronJob>("cron", { method: "POST", body: JSON.stringify(body) }),
  updateCron: (
    id: string,
    body: { enabled?: boolean; name?: string; prompt?: string; model?: string; schedule?: CronSchedule },
  ) => rc<CronJob>(`cron/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCron: (id: string) =>
    rc<{ id: string; deleted: boolean }>(`cron/${encodeURIComponent(id)}`, { method: "DELETE" }),
  runCron: (id: string) =>
    rc<{ id: string; success: boolean; output: string }>(`cron/${encodeURIComponent(id)}/run`, {
      method: "POST",
    }),
  setSkillEnabled: (name: string, enabled: boolean) =>
    rc<{ name: string; enabled: boolean }>(`skills/${encodeURIComponent(name)}/enabled`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  // ClawHub registry — browse top-by-stars, or search with q. Goes via the Next
  // /api/clawhub proxy (not the gateway).
  clawhub: async (q?: string): Promise<{ items: ClawHubSkill[] }> => {
    const res = await fetch(`/api/clawhub${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || d.error || "ClawHub error");
    return d;
  },
  installSkill: (slug: string) =>
    rc<{ slug: string; installed: boolean }>("skills/install", {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),
  uninstallSkill: (name: string) =>
    rc<{ name: string; removed: boolean }>(`skills/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  config: () => rc<Record<string, unknown>>("config"),
  setConfigModel: (body: { provider?: string; model?: string; temperature?: number }) =>
    rc<{
      default_provider: string | null;
      default_model: string | null;
      default_temperature: number;
      /** Present when the switched provider has no usable credential yet. */
      warning?: string;
    }>("config/model", { method: "PUT", body: JSON.stringify(body) }),
  setAutonomy: (body: {
    level?: string;
    auto_approve?: string[];
    always_ask?: string[];
    allowed_commands?: string[];
    forbidden_paths?: string[];
    max_actions_per_hour?: number;
    max_cost_per_day_cents?: number;
    workspace_only?: boolean;
    block_high_risk_commands?: boolean;
    require_approval_for_medium_risk?: boolean;
  }) =>
    rc<Record<string, unknown>>("config/autonomy", { method: "PUT", body: JSON.stringify(body) }),
  addMcpServer: (name: string, body: { command: string; args?: string[]; env?: Record<string, string> }) =>
    rc<{ name: string; added: boolean; count: number }>(
      `config/mcp_servers/${encodeURIComponent(name)}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  deleteMcpServer: (name: string) =>
    rc<{ name: string; removed: boolean; count: number }>(
      `config/mcp_servers/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  addMemory: (body: { content: string; key?: string; category?: string; session_id?: string }) =>
    rc<{ key: string; stored: boolean }>("memory", { method: "POST", body: JSON.stringify(body) }),
  deleteMemory: (key: string) =>
    rc<{ key: string; removed: boolean }>(`memory/${encodeURIComponent(key)}`, { method: "DELETE" }),
  secrets: () => rc<SecretsInfo>("secrets"),
  setSecrets: (body: { api_key?: string; api_url?: string }) =>
    rc<{ ok: boolean; api_key_present: boolean }>("secrets", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  // ---- Knowledge Base groups (a "Knowledge Base" == a group) ----
  kbGroups: () => rc<KbGroup[]>("kb/groups"),
  kbCreateGroup: (body: { name: string; description?: string; color?: string }) =>
    rc<KbGroup>("kb/groups", { method: "POST", body: JSON.stringify(body) }),
  kbUpdateGroup: (id: string, body: { name?: string; description?: string; color?: string }) =>
    rc<KbGroup>(`kb/groups/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  kbDeleteGroup: (id: string) =>
    rc<{ id: string; deleted: boolean }>(`kb/groups/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  kbGroupDocuments: (id: string) =>
    rc<KbDocument[]>(`kb/groups/${encodeURIComponent(id)}/documents`),
  // Fetch a single document's full record (including `content`, the full
  // extracted text) for the viewer's Preview tab.
  kbGetDocument: (docId: string) =>
    rc<KbDocumentDetail>(`kb/documents/${encodeURIComponent(docId)}`),
  kbAddDocToGroup: (id: string, docId: string) =>
    rc<{ ok: boolean }>(`kb/groups/${encodeURIComponent(id)}/documents`, {
      method: "POST",
      body: JSON.stringify({ document_id: docId }),
    }),
  kbRemoveDocFromGroup: (id: string, docId: string) =>
    rc<{ ok: boolean }>(
      `kb/groups/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`,
      { method: "DELETE" },
    ),
  // Delete a document from the library entirely (soft-delete by default: it stops
  // being retrieved and leaves every KB). Distinct from kbRemoveDocFromGroup, which
  // only unlinks the doc from one group and leaves the row active.
  kbDeleteDocument: (docId: string) =>
    rc<{ id: string; mode: string }>(`kb/documents/${encodeURIComponent(docId)}`, {
      method: "DELETE",
    }),
  // ---- KB Document Intelligence (SP-2 entity/relation graph) ----
  kbGraph: (opts?: { group?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.group) q.set("group", opts.group);
    if (opts?.limit) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return rc<KbGraph>(`kb/graph${qs ? `?${qs}` : ""}`);
  },
  kbDocumentIntelligence: (docId: string) =>
    rc<KbDocumentIntelligence>(`kb/documents/${encodeURIComponent(docId)}/intelligence`),
  kbReExtractDocument: (docId: string) =>
    rc<KbReExtractResult>(`kb/documents/${encodeURIComponent(docId)}/re-extract`, { method: "POST" }),
  // ---- Knowledge Base credentials ([knowledge] config) ----
  getKnowledge: () => rc<KnowledgeStatus>("config/knowledge"),
  setKnowledge: (body: { embedding_api_key?: string; vision_api_key?: string }) =>
    rc<{ embedding_configured: boolean; vision_configured: boolean }>("config/knowledge", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
