"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PanelFrame, StatCard, KeyVal, SeverityBadge } from "./shared";

const PERSONA_PRESETS = [
  { value: "default", label: "Default" },
  { value: "concise_pro", label: "Concise Pro" },
  { value: "friendly_companion", label: "Friendly Companion" },
  { value: "research_analyst", label: "Research Analyst" },
  { value: "executive_assistant", label: "Executive Assistant" },
];

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
    >
      <RefreshCw className="size-3.5" /> Refresh
    </button>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

// ── Status ────────────────────────────────────────────────────────────────
export function StatusPanel() {
  const status = useAsync(() => api.status(), []);
  const doctor = useAsync(() => api.doctor(), []);
  const s = status.data;

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle action={<RefreshButton onClick={() => { status.refresh(); doctor.refresh(); }} />}>
          Runtime
        </SectionTitle>
        <PanelFrame loading={status.loading} error={status.error} onRefresh={status.refresh}>
          {s && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Version" value={s.version} />
                <StatCard label="Provider" value={s.provider || "—"} tone="accent" />
                <StatCard label="Paired" value={s.paired ? "Yes" : "No"} tone={s.paired ? "success" : "warning"} />
                <StatCard label="Autonomy" value={s.autonomy || "—"} />
              </div>
              <Card className="mt-3 p-4">
                <KeyVal k="Model" v={s.model || "—"} mono />
                <KeyVal k="Memory backend" v={s.memory_backend || "—"} />
                <KeyVal k="Workspace" v={s.workspace_dir || "—"} mono />
              </Card>
            </>
          )}
        </PanelFrame>
      </div>

      <div>
        <SectionTitle>Doctor checks</SectionTitle>
        <PanelFrame loading={doctor.loading} error={doctor.error} onRefresh={doctor.refresh}>
          <div className="space-y-1.5">
            {doctor.data?.results.map((r, i) => (
              <Card key={i} className="flex items-start gap-3 p-3">
                <SeverityBadge severity={r.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">{r.category}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.message}</p>
                  {r.hint && <p className="mt-0.5 text-[11px] text-accent">{r.hint}</p>}
                </div>
              </Card>
            ))}
          </div>
        </PanelFrame>
      </div>
    </div>
  );
}

// ── Sessions ──────────────────────────────────────────────────────────────
export function SessionsPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.sessions(100), []);
  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Sessions {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <Card className="divide-y divide-border">
          {data?.sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.title || "Untitled session"}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  <span className="font-mono">{s.id.slice(0, 8)}</span>
                  {s.model ? ` · ${s.model}` : ""} · {relativeTime(s.started_at)}
                </div>
              </div>
              <Badge variant="secondary">{s.message_count} msgs</Badge>
            </div>
          ))}
        </Card>
      </PanelFrame>
    </div>
  );
}

// ── Usage / Insights ────────────────────────────────────────────────────────
export function UsagePanel() {
  const insights = useAsync(() => api.insights(), []);
  const memStats = useAsync(() => api.memoryStats(), []);
  const i = insights.data;
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle action={<RefreshButton onClick={() => { insights.refresh(); memStats.refresh(); }} />}>
          Activity
        </SectionTitle>
        <PanelFrame loading={insights.loading} error={insights.error} onRefresh={insights.refresh}>
          {i && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Sessions" value={formatNumber(i.total_sessions)} />
              <StatCard label="Messages" value={formatNumber(i.total_messages)} />
              <StatCard label="Avg / session" value={i.avg_messages_per_session.toFixed(1)} />
              <StatCard label="Latest" value={relativeTime(i.latest_session_started_at)} tone="accent" />
            </div>
          )}
        </PanelFrame>
      </div>
      <div>
        <SectionTitle>Memory</SectionTitle>
        <PanelFrame loading={memStats.loading} error={memStats.error} onRefresh={memStats.refresh}>
          {memStats.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Backend" value={memStats.data.backend} />
              <StatCard label="Entries" value={formatNumber(memStats.data.total_entries)} />
              <StatCard
                label="Health"
                value={memStats.data.healthy ? "Healthy" : "Degraded"}
                tone={memStats.data.healthy ? "success" : "destructive"}
              />
            </div>
          )}
        </PanelFrame>
      </div>
    </div>
  );
}

// ── Providers ───────────────────────────────────────────────────────────────
export function ProvidersPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.providers(), []);
  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Providers {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} onRefresh={refresh}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data?.providers.map((p) => (
            <Card key={p.id} className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.display_name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{p.id}</div>
              </div>
              {p.local && <Badge variant="success">local</Badge>}
            </Card>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}

// ── Channels ────────────────────────────────────────────────────────────────
export function ChannelsPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.channels(), []);
  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Channels {data && <span className="text-muted-foreground">· {data.count} configured</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <div className="flex flex-wrap gap-2">
          {data?.configured.map((c) => (
            <Badge key={c} variant="accent" className="px-3 py-1 text-sm capitalize">
              {c}
            </Badge>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}

// ── Skills ──────────────────────────────────────────────────────────────────
export function SkillsPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.skills(), []);
  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Skills {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <div className="space-y-2">
          {data?.skills.map((s) => (
            <Card key={s.name} className="p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{s.name}</span>
                {s.version && <span className="text-[10px] text-muted-foreground">v{s.version}</span>}
              </div>
              {s.description && <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.tags?.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
                {s.tools?.map((t) => (
                  <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}

// ── Memory ──────────────────────────────────────────────────────────────────
export function MemoryPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.memory(100), []);
  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Memory entries {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <div className="space-y-2">
          {data?.entries.map((e, idx) => (
            <Card key={`${e.key}-${idx}`} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">{e.key}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{e.category}</Badge>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {e.content}
              </p>
              <div className="mt-1 text-[10px] text-muted-foreground">{relativeTime(e.timestamp)}</div>
            </Card>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}

// ── Cron ────────────────────────────────────────────────────────────────────
function fmtWhen(ts: string | number | null): string {
  if (ts == null) return "—";
  try {
    const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
    if (!Number.isFinite(ms)) return String(ts);
    return new Date(ms).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function CronPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.cron(), []);
  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Scheduled jobs {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <Card className="divide-y divide-border">
          {data?.jobs.map((j) => (
            <div key={j.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{j.name || j.id.slice(0, 8)}</span>
                  <Badge variant="secondary" className="text-[10px]">{j.job_type}</Badge>
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {j.expression} · next {fmtWhen(j.next_run)}
                  {j.last_status ? ` · last: ${j.last_status}` : ""}
                </div>
              </div>
              <Badge variant={j.enabled ? "success" : "secondary"}>{j.enabled ? "enabled" : "paused"}</Badge>
            </div>
          ))}
        </Card>
      </PanelFrame>
    </div>
  );
}

// ── Persona ─────────────────────────────────────────────────────────────────
export function PersonaPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.personality(), []);
  const [preset, setPreset] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data?.preset) setPreset(data.preset);
  }, [data?.preset]);

  const apply = async () => {
    if (!preset) return;
    setSaving(true);
    try {
      await api.setPersonality(preset);
      toast.success(`Preset set to “${preset}”`);
      refresh();
    } catch (e) {
      toast.error(`Failed to set preset: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refresh} />}>Personality</SectionTitle>
      <PanelFrame loading={loading} error={error} onRefresh={refresh}>
        {data && (
          <Card className="p-4">
            <KeyVal k="Profile" v={data.profile} />
            <KeyVal k="Preset" v={data.preset || "— not configured —"} />
            {data.name && <KeyVal k="Name" v={data.name} />}
            {data.role && <KeyVal k="Role" v={data.role} />}
            {data.tone && <KeyVal k="Tone" v={data.tone} />}
            {data.timezone && <KeyVal k="Timezone" v={data.timezone} />}
            {data.avoid && <KeyVal k="Avoid" v={data.avoid} />}
            <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              >
                <option value="" disabled>
                  Choose a preset…
                </option>
                {PERSONA_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Button
                onClick={apply}
                disabled={saving || !preset || preset === data.preset}
                size="sm"
              >
                {saving ? "Applying…" : "Apply preset"}
              </Button>
            </div>
          </Card>
        )}
      </PanelFrame>
    </div>
  );
}
