// Client-side API — talks to the Next.js proxy at /api/rc/* (never the gateway directly).
import type {
  ChannelsInfo,
  CronJob,
  DoctorResult,
  Insights,
  MemoryEntry,
  MemoryStats,
  Personality,
  ProviderInfo,
  SearchResult,
  SessionDetail,
  SessionSummary,
  Skill,
  StatusInfo,
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
  setPersonality: (preset: string) =>
    rc<{ preset: string }>("personality", {
      method: "PUT",
      body: JSON.stringify({ preset }),
    }),
  channels: () => rc<ChannelsInfo>("channels"),
  providers: () => rc<{ providers: ProviderInfo[]; count: number }>("providers"),
  cron: () => rc<{ jobs: CronJob[]; count: number }>("cron"),
};
