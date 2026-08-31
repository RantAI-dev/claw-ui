// Client-side API — talks to the Next.js proxy at /api/rc/* (never the gateway directly).
import type {
  ChannelsInfo,
  ClawHubSkill,
  CronJob,
  CronRun,
  CronSchedule,
  DoctorResult,
  GatewayConfig,
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
  PersonaPreset,
  ProviderInfo,
  SearchResult,
  SecretsInfo,
  SessionDetail,
  SessionFork,
  SessionSummary,
  Skill,
  StatusInfo,
  TelegramConnectResult,
} from "./types";

/**
 * A non-2xx response, carrying the parsed body so callers can act on a
 * structured error instead of only its message.
 *
 * `message` is unchanged from what `rc` used to throw, so every existing
 * `catch (e) { toast(e.message) }` behaves exactly as before.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * An operator-facing sentence for a failed request.
 *
 * `ApiError` has carried `status` and the parsed `body` since it was written,
 * and its comment says callers can act on it — but two of roughly twenty-two
 * mutation handlers did, and the rest flattened it to `.message`. So a session
 * expiry, a restarting gateway and a genuine 400 all rendered identically, and
 * the operator had no way to tell "log in again" from "wait a moment" from
 * "your input was wrong".
 */
export function describeApiError(e: unknown): string {
  if (!(e instanceof ApiError)) {
    const msg = e instanceof Error ? e.message : String(e);
    // fetch() rejects with a bare TypeError ("Failed to fetch") when the console's
    // own server cannot be reached; that string names neither cause nor action.
    if (e instanceof TypeError && /fetch/i.test(msg)) {
      return "The console could not reach its server. Check the connection and try again.";
    }
    // AbortSignal.timeout() rejects with a DOMException whose message is the
    // browser's own ("The operation was aborted due to timeout").
    if ((e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) || /aborted due to timeout/i.test(msg)) {
      return "The request timed out. Try again.";
    }
    return msg;
  }
  switch (e.status) {
    case 401:
    case 403:
      return `Not authorised; sign in again. (${e.message})`;
    case 503:
      // The gateway also answers 503 for a feature that is switched off
      // ("The Knowledge Base is turned off…"); that message is the truth, and
      // "may be restarting" over it named the wrong cause.
      if (e.message && !/unreachable|connect|refused|timed? ?out/i.test(e.message)) return e.message;
      return `The gateway is unreachable; it may be restarting. (${e.message})`;
    case 502:
    case 504:
      return `The gateway is unreachable; it may be restarting. (${e.message})`;
    default:
      return e.message;
  }
}

async function rc<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/rc/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    // Check status BEFORE parsing: a non-JSON error body (a proxy 502/504 HTML
    // page, a plain-text gateway error) would otherwise throw a SyntaxError with
    // no `status`, so `describeApiError`'s 401/403 and 502/503/504 branches —
    // written for exactly these failures — became unreachable.
    let parsed: unknown = null;
    let detail: unknown = res.statusText;
    try {
      parsed = text ? JSON.parse(text) : null;
      const obj = parsed as { detail?: unknown; error?: unknown } | null;
      detail = obj?.detail || obj?.error || res.statusText;
    } catch {
      detail = text.slice(0, 200) || res.statusText;
    }
    throw new ApiError(
      typeof detail === "string" ? detail : JSON.stringify(detail),
      res.status,
      parsed,
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  status: () => rc<StatusInfo>("status"),
  doctor: () => rc<{ results: DoctorResult[] }>("doctor"),
  insights: () => rc<Insights>("insights"),
  sessions: (limit = 100, offset = 0) =>
    rc<{ sessions: SessionSummary[]; count: number }>(
      `sessions?limit=${limit}&offset=${offset}`,
    ),
  session: (id: string) =>
    rc<SessionDetail>(`sessions/${encodeURIComponent(id)}`),
  searchSessions: (query: string, limit = 30) =>
    rc<{ results: SearchResult[]; count: number }>("sessions/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),
  setSessionTitle: (id: string, title: string) =>
    rc<{ id: string; title: string }>(
      `sessions/${encodeURIComponent(id)}/title`,
      {
        method: "PUT",
        body: JSON.stringify({ title }),
      },
    ),
  deleteSession: (id: string) =>
    rc<{ deleted: boolean; id: string }>(`sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  /** Branch a new session from an existing one. The parent is left open; the
   *  child carries `parent_session_id` and a system message naming the origin. */
  forkSession: (id: string, note?: string) =>
    rc<SessionFork>(`sessions/${encodeURIComponent(id)}/fork`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  skills: () => rc<{ skills: Skill[]; count: number }>("skills"),
  memory: (
    limit = 100,
    offset = 0,
    opts: { q?: string; category?: string } = {},
  ) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    // Absent params mean "no filter" server-side, so only send what narrows.
    if (opts.q?.trim()) params.set("q", opts.q.trim());
    if (opts.category) params.set("category", opts.category);
    return rc<{
      entries: MemoryEntry[];
      count: number;
      total: number;
      listed: number;
      offset: number;
    }>(`memory?${params}`);
  },
  memoryStats: () => rc<MemoryStats>("memory/stats"),
  personality: () => rc<Personality>("personality"),
  personalityPresets: () =>
    rc<{ presets: PersonaPreset[] }>("personality/presets"),
  setPersonality: (body: {
    preset?: string;
    name?: string;
    role?: string;
    tone?: string;
    avoid?: string;
    timezone?: string;
    always_on_kbs?: string[];
  }) =>
    rc<Personality>("personality", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  /** Resolve an in-browser tool-approval modal raised mid-chat (WebModal backend).
   *  `always` (approve only) allowlists the tool for the rest of the session so it
   *  stops prompting; deny cancels the whole turn. */
  resolveApproval: (id: string, approve: boolean, always = false) =>
    rc<{ resolved: boolean; id: string; approved: boolean; always?: boolean }>(
      `approvals/${encodeURIComponent(id)}`,
      { method: "POST", body: JSON.stringify({ approve, always }) },
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
    rc<{ disconnected: boolean; channel: string; restarts_runtime?: boolean }>(
      "channels/telegram",
      {
        method: "DELETE",
      },
    ),
  providers: () =>
    rc<{ providers: ProviderInfo[]; count: number }>("providers"),
  // Model catalog for a provider — resolved by the gateway from the SAME on-disk
  // cache + curated fallback the TUI uses, so the UI never drifts. `source` is
  // "cache" | "curated"; `refreshProviderModels` repopulates the cache from the
  // live provider API (mirrors `rantaiclaw models refresh`).
  providerModels: (id: string) =>
    rc<ModelCatalog>(`providers/${encodeURIComponent(id)}/models`),
  refreshProviderModels: (id: string) =>
    rc<ModelCatalog>(`providers/${encodeURIComponent(id)}/models/refresh`, {
      method: "POST",
    }),
  cron: () => rc<{ jobs: CronJob[]; count: number }>("cron"),
  createCron: (body: {
    schedule: CronSchedule;
    job_type?: "agent" | "shell";
    prompt?: string;
    command?: string;
    name?: string;
    model?: string;
    session_target?: "isolated" | "main";
    delete_after_run?: boolean;
    // `warning` is present (additive) when a shell job was created but its
    // command would be refused by the scheduler's fire-time gate, so it will not
    // run on its schedule.
  }) =>
    rc<CronJob & { warning?: string }>("cron", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCron: (
    id: string,
    body: {
      enabled?: boolean;
      name?: string;
      prompt?: string;
      command?: string;
      model?: string;
      schedule?: CronSchedule;
      session_target?: "isolated" | "main";
      delete_after_run?: boolean;
    },
  ) =>
    rc<CronJob>(`cron/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteCron: (id: string) =>
    rc<{ id: string; deleted: boolean }>(`cron/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  runCron: (id: string, approved = false) =>
    rc<{ id: string; success: boolean; output: string }>(
      `cron/${encodeURIComponent(id)}/run${approved ? "?approved=true" : ""}`,
      { method: "POST" },
    ),
  cronRuns: (id: string, limit = 50) =>
    rc<{ runs: CronRun[]; count: number }>(
      `cron/${encodeURIComponent(id)}/runs?limit=${limit}`,
    ),
  // Skill routes address by `slug` (the directory name), not by `name`. The
  // gateway runs the path parameter through `validate_slug`, which rejects
  // spaces — so a skill whose display name is "Kopi Pagi" is only reachable at
  // `kopi-pagi`. Passing `name` here 400s for every skill written by hand.
  setSkillEnabled: (slug: string, enabled: boolean) =>
    rc<{ name: string; enabled: boolean }>(
      `skills/${encodeURIComponent(slug)}/enabled`,
      {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      },
    ),
  // Raw SKILL.md. Both refuse (403) any skill the user did not author — its
  // body becomes the agent's standing instructions, so only skills they own
  // are editable here.
  skillContent: (slug: string) =>
    rc<{ slug: string; name: string; content: string }>(
      `skills/${encodeURIComponent(slug)}/content`,
    ),
  saveSkillContent: (slug: string, content: string) =>
    rc<{ slug: string; name: string; written: boolean }>(
      `skills/${encodeURIComponent(slug)}/content`,
      {
        method: "PUT",
        body: JSON.stringify({ content }),
      },
    ),
  // Creating takes the display name — the slug does not exist yet, and the
  // server derives it from the `name:` inside `content`.
  createSkill: (name: string, content: string) =>
    rc<{ name: string; slug: string; created: boolean }>("skills", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  // ClawHub registry — browse top-by-stars, or search with q. Goes via the Next
  // /api/clawhub proxy (not the gateway).
  clawhub: async (q?: string): Promise<{ items: ClawHubSkill[] }> => {
    const res = await fetch(
      `/api/clawhub${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || d.error || "ClawHub error");
    return d;
  },
  // `reference` is a bare slug or the publisher-qualified `@owner/slug`.
  // A bare slug that several publishers share comes back as `409
  // ambiguous_skill_slug` with the candidates on `ApiError.body.matches` —
  // the gateway never picks a publisher for us.
  installSkill: (reference: string) =>
    rc<{ slug: string; installed: boolean }>("skills/install", {
      method: "POST",
      body: JSON.stringify({ slug: reference }),
    }),
  uninstallSkill: (slug: string) =>
    rc<{ name: string; removed: boolean }>(
      `skills/${encodeURIComponent(slug)}`,
      {
        method: "DELETE",
      },
    ),
  config: () => rc<GatewayConfig>("config"),
  setConfigModel: (body: {
    provider?: string;
    model?: string;
    temperature?: number;
  }) =>
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
    rc<Record<string, unknown>>("config/autonomy", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  addMcpServer: (
    name: string,
    body: { command: string; args?: string[]; env?: Record<string, string> },
  ) =>
    rc<{ name: string; added: boolean; count: number }>(
      `config/mcp_servers/${encodeURIComponent(name)}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  deleteMcpServer: (name: string) =>
    rc<{ name: string; removed: boolean; count: number }>(
      `config/mcp_servers/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  addMemory: (body: {
    content: string;
    key?: string;
    category?: string;
    session_id?: string;
  }) =>
    rc<{ key: string; stored: boolean; notes: string[] }>("memory", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteMemory: (key: string) =>
    rc<{ key: string; removed: boolean }>(`memory/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),
  secrets: () => rc<SecretsInfo>("secrets"),
  setSecrets: (body: { api_key?: string; api_url?: string }) =>
    rc<{ ok: boolean; api_key_present: boolean }>("secrets", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  // ---- Knowledge Base groups (a "Knowledge Base" == a group) ----
  kbGroups: () => rc<KbGroup[]>("kb/groups"),
  kbCreateGroup: (body: {
    name: string;
    description?: string;
    color?: string;
  }) =>
    rc<KbGroup>("kb/groups", { method: "POST", body: JSON.stringify(body) }),
  kbUpdateGroup: (
    id: string,
    body: { name?: string; description?: string; color?: string },
  ) =>
    rc<KbGroup>(`kb/groups/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  kbDeleteGroup: (id: string) =>
    rc<{ id: string; deleted: boolean }>(
      `kb/groups/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    ),
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
    rc<{ id: string; mode: string }>(
      `kb/documents/${encodeURIComponent(docId)}`,
      {
        method: "DELETE",
      },
    ),
  // ---- KB Document Intelligence (SP-2 entity/relation graph) ----
  kbGraph: (opts?: { group?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.group) q.set("group", opts.group);
    if (opts?.limit) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return rc<KbGraph>(`kb/graph${qs ? `?${qs}` : ""}`);
  },
  kbDocumentIntelligence: (docId: string) =>
    rc<KbDocumentIntelligence>(
      `kb/documents/${encodeURIComponent(docId)}/intelligence`,
    ),
  kbReExtractDocument: (docId: string) =>
    rc<KbReExtractResult>(
      `kb/documents/${encodeURIComponent(docId)}/re-extract`,
      { method: "POST" },
    ),
  // ---- Knowledge Base credentials ([knowledge] config) ----
  getKnowledge: () => rc<KnowledgeStatus>("config/knowledge"),
  setKnowledge: (body: {
    enabled?: boolean;
    embedding_api_key?: string;
    vision_api_key?: string;
  }) =>
    rc<{ enabled?: boolean; embedding_configured: boolean; vision_configured: boolean }>(
      "config/knowledge",
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    ),
};
