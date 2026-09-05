import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

/**
 * A contract test for every call `api` exports.
 *
 * `api.ts` reaches ~59 endpoints and thirteen component suites mock it away, so
 * a path or method typo shipped green. This asserts the three things that
 * actually cross the process boundary — URL, method, request body — for each
 * call.
 *
 * The table is checked against the module rather than hand-listed: `CASES` must
 * name exactly the keys `api` exports, so a new endpoint fails this suite until
 * someone writes its contract down. That is the point — the expectation here is
 * the contract, and it has to be written by a person, not derived from the code
 * it is meant to pin.
 */

type Case = {
  /** Arguments to invoke the call with. */
  args: unknown[];
  /** Expected URL, prefix included. */
  url: string;
  /** Expected HTTP method; absent means the call sends none, i.e. GET. */
  method?: string;
  /** Expected request body, already parsed; absent means no body. */
  body?: unknown;
};

// Values with characters that must survive encoding — a call that interpolates
// a raw id instead of `encodeURIComponent`-ing it fails on these.
const SESSION = "session one/two";
const SLUG = "my skill";
const DOC = "doc one";
const GROUP = "group one";
const KEY = "memory key/one";

const CASES: Record<string, Case> = {
  status: { args: [], url: "/api/rc/status" },
  doctor: { args: [], url: "/api/rc/doctor" },
  insights: { args: [], url: "/api/rc/insights" },
  sessions: { args: [], url: "/api/rc/sessions?limit=100&offset=0" },
  session: {
    args: [SESSION],
    url: `/api/rc/sessions/${encodeURIComponent(SESSION)}`,
  },
  searchSessions: {
    args: ["needle"],
    url: "/api/rc/sessions/search",
    method: "POST",
    body: { query: "needle", limit: 30 },
  },
  setSessionTitle: {
    args: [SESSION, "New title"],
    url: `/api/rc/sessions/${encodeURIComponent(SESSION)}/title`,
    method: "PUT",
    body: { title: "New title" },
  },
  deleteSession: {
    args: [SESSION],
    url: `/api/rc/sessions/${encodeURIComponent(SESSION)}`,
    method: "DELETE",
  },
  forkSession: {
    args: [SESSION, "why"],
    url: `/api/rc/sessions/${encodeURIComponent(SESSION)}/fork`,
    method: "POST",
    body: { note: "why" },
  },
  skills: { args: [], url: "/api/rc/skills" },
  memory: {
    // The opts branch trims `q` and drops empty filters, so exercise it here.
    args: [50, 10, { q: "  needle  ", category: "user" }],
    url: "/api/rc/memory?limit=50&offset=10&q=needle&category=user",
  },
  memoryStats: { args: [], url: "/api/rc/memory/stats" },
  getMemory: { args: [KEY], url: `/api/rc/memory/${encodeURIComponent(KEY)}` },
  addMemory: {
    args: [{ content: "remember this", category: "user" }],
    url: "/api/rc/memory",
    method: "POST",
    body: { content: "remember this", category: "user" },
  },
  deleteMemory: {
    args: [KEY],
    url: `/api/rc/memory/${encodeURIComponent(KEY)}`,
    method: "DELETE",
  },
  personality: { args: [], url: "/api/rc/personality" },
  personalityPresets: { args: [], url: "/api/rc/personality/presets" },
  setPersonality: {
    args: [{ preset: "concise" }],
    url: "/api/rc/personality",
    method: "PUT",
    body: { preset: "concise" },
  },
  resolveApproval: {
    args: ["approval one", true],
    url: "/api/rc/approvals/approval%20one",
    method: "POST",
    body: { approve: true, always: false },
  },
  channels: { args: [], url: "/api/rc/channels" },
  connectTelegram: {
    args: ["bot-token", ["operator"]],
    url: "/api/rc/channels/telegram",
    method: "POST",
    body: { bot_token: "bot-token", allowed_users: ["operator"] },
  },
  updateTelegramAllowlist: {
    args: [["operator"]],
    url: "/api/rc/channels/telegram",
    method: "POST",
    body: { allowed_users: ["operator"] },
  },
  disconnectTelegram: {
    args: [],
    url: "/api/rc/channels/telegram",
    method: "DELETE",
  },
  providers: { args: [], url: "/api/rc/providers" },
  providerModels: {
    args: ["open ai"],
    url: "/api/rc/providers/open%20ai/models",
  },
  refreshProviderModels: {
    args: ["open ai"],
    url: "/api/rc/providers/open%20ai/models/refresh",
    method: "POST",
  },
  cron: { args: [], url: "/api/rc/cron" },
  createCron: {
    args: [{ schedule: { every_ms: 60000 }, prompt: "check" }],
    url: "/api/rc/cron",
    method: "POST",
    body: { schedule: { every_ms: 60000 }, prompt: "check" },
  },
  updateCron: {
    args: ["cron one", { enabled: false }],
    url: "/api/rc/cron/cron%20one",
    method: "PUT",
    body: { enabled: false },
  },
  deleteCron: {
    args: ["cron one"],
    url: "/api/rc/cron/cron%20one",
    method: "DELETE",
  },
  runCron: {
    args: ["cron one"],
    url: "/api/rc/cron/cron%20one/run",
    method: "POST",
  },
  cronRuns: { args: ["cron one"], url: "/api/rc/cron/cron%20one/runs?limit=50" },
  setSkillEnabled: {
    args: [SLUG, true],
    url: `/api/rc/skills/${encodeURIComponent(SLUG)}/enabled`,
    method: "PUT",
    body: { enabled: true },
  },
  skillContent: {
    args: [SLUG],
    url: `/api/rc/skills/${encodeURIComponent(SLUG)}/content`,
  },
  saveSkillContent: {
    args: [SLUG, "# body"],
    url: `/api/rc/skills/${encodeURIComponent(SLUG)}/content`,
    method: "PUT",
    body: { content: "# body" },
  },
  createSkill: {
    args: ["Kopi Pagi", "# body"],
    url: "/api/rc/skills",
    method: "POST",
    body: { name: "Kopi Pagi", content: "# body" },
  },
  installSkill: {
    // The wire field is `slug`, not `reference` — the rename is the contract.
    args: ["@owner/slug"],
    url: "/api/rc/skills/install",
    method: "POST",
    body: { slug: "@owner/slug" },
  },
  uninstallSkill: {
    args: [SLUG],
    url: `/api/rc/skills/${encodeURIComponent(SLUG)}`,
    method: "DELETE",
  },
  // The only call that does NOT go through the gateway proxy: ClawHub browse
  // is served by the Next route at /api/clawhub.
  clawhub: {
    args: ["kopi", { fresh: true }],
    url: "/api/clawhub?q=kopi&fresh=1",
  },
  config: { args: [], url: "/api/rc/config" },
  setConfigModel: {
    args: [{ provider: "openai", model: "gpt-4o-mini" }],
    url: "/api/rc/config/model",
    method: "PUT",
    body: { provider: "openai", model: "gpt-4o-mini" },
  },
  setAutonomy: {
    args: [{ level: "supervised" }],
    url: "/api/rc/config/autonomy",
    method: "PUT",
    body: { level: "supervised" },
  },
  addMcpServer: {
    args: ["my server", { command: "npx", args: ["-y", "pkg"] }],
    url: "/api/rc/config/mcp_servers/my%20server",
    method: "POST",
    body: { command: "npx", args: ["-y", "pkg"] },
  },
  deleteMcpServer: {
    args: ["my server"],
    url: "/api/rc/config/mcp_servers/my%20server",
    method: "DELETE",
  },
  secrets: { args: [], url: "/api/rc/secrets" },
  setSecrets: {
    args: [{ api_key: "k" }],
    url: "/api/rc/secrets",
    method: "PUT",
    body: { api_key: "k" },
  },
  kbGroups: { args: [], url: "/api/rc/kb/groups" },
  kbCreateGroup: {
    args: [{ name: "Handbook" }],
    url: "/api/rc/kb/groups",
    method: "POST",
    body: { name: "Handbook" },
  },
  kbUpdateGroup: {
    args: [GROUP, { name: "Renamed" }],
    url: `/api/rc/kb/groups/${encodeURIComponent(GROUP)}`,
    method: "PUT",
    body: { name: "Renamed" },
  },
  kbDeleteGroup: {
    args: [GROUP],
    url: `/api/rc/kb/groups/${encodeURIComponent(GROUP)}`,
    method: "DELETE",
  },
  kbGroupDocuments: {
    args: [GROUP],
    url: `/api/rc/kb/groups/${encodeURIComponent(GROUP)}/documents`,
  },
  kbGetDocument: {
    args: [DOC],
    url: `/api/rc/kb/documents/${encodeURIComponent(DOC)}`,
  },
  kbAddDocToGroup: {
    args: [GROUP, DOC],
    url: `/api/rc/kb/groups/${encodeURIComponent(GROUP)}/documents`,
    method: "POST",
    body: { document_id: DOC },
  },
  kbRemoveDocFromGroup: {
    args: [GROUP, DOC],
    url: `/api/rc/kb/groups/${encodeURIComponent(GROUP)}/documents/${encodeURIComponent(DOC)}`,
    method: "DELETE",
  },
  kbDeleteDocument: {
    args: [DOC],
    url: `/api/rc/kb/documents/${encodeURIComponent(DOC)}`,
    method: "DELETE",
  },
  kbGraph: {
    args: [{ group: "Handbook", limit: 25 }],
    url: "/api/rc/kb/graph?group=Handbook&limit=25",
  },
  kbDocumentIntelligence: {
    args: [DOC],
    url: `/api/rc/kb/documents/${encodeURIComponent(DOC)}/intelligence`,
  },
  kbReExtractDocument: {
    args: [DOC],
    url: `/api/rc/kb/documents/${encodeURIComponent(DOC)}/re-extract`,
    method: "POST",
  },
  getKnowledge: { args: [], url: "/api/rc/config/knowledge" },
  setKnowledge: {
    args: [{ enabled: true }],
    url: "/api/rc/config/knowledge",
    method: "PUT",
    body: { enabled: true },
  },
};

function recordFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => "{}",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api contract", () => {
  it("covers every call the module exports", () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(api).sort());
  });

  for (const [name, expected] of Object.entries(CASES)) {
    it(`${name} hits ${expected.method ?? "GET"} ${expected.url}`, async () => {
      const fetchMock = recordFetch();
      const call = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name];
      await call(...expected.args);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
      expect(url).toBe(expected.url);
      expect(init?.method).toBe(expected.method);

      if (expected.body === undefined) {
        expect(init?.body).toBeUndefined();
      } else {
        expect(JSON.parse(String(init?.body))).toEqual(expected.body);
      }
    });
  }
});
