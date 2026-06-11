"use client";

import * as React from "react";
import {
  RefreshCw,
  Plus,
  Play,
  Trash2,
  Power,
  Loader2,
  KeyRound,
  Save,
  Eye,
  EyeOff,
  Search,
  Download,
  Star,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { BUILTIN_TOOLS } from "@/lib/console";
import { ModelPicker } from "@/components/ui/model-picker";
import { Combobox } from "@/components/ui/combobox";
import type { ClawHubSkill } from "@/lib/types";
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
    <button onClick={onClick} className="gbtn">
      <RefreshCw /> Refresh
    </button>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[13px] font-medium tracking-tight">{children}</h3>
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
  const catalog = useAsync(() => api.providers(), []);
  const secrets = useAsync(() => api.secrets(), []);
  const info = useAsync(() => api.status(), []);
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  const [key, setKey] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (secrets.data?.provider) setProvider(secrets.data.provider);
    if (secrets.data?.api_url) setUrl(secrets.data.api_url);
  }, [secrets.data?.provider, secrets.data?.api_url]);
  React.useEffect(() => {
    if (info.data?.model) setModel(info.data.model);
  }, [info.data?.model]);

  const active = secrets.data?.provider;
  const keyPresent = secrets.data?.api_key_present;

  const changeProvider = (next: string) => setProvider(next);

  const save = async () => {
    setBusy(true);
    try {
      const providerChanged = provider && provider !== active;
      const modelChanged = model && model !== info.data?.model;
      if (providerChanged || modelChanged) {
        await api.setConfigModel({
          provider: providerChanged ? provider : undefined,
          model: model || undefined,
        });
      }
      if (key.trim() || url.trim()) {
        await api.setSecrets({ api_key: key.trim() || undefined, api_url: url.trim() || undefined });
      }
      toast.success(`Saved — ${provider || active} · ${model || "model unchanged"}`);
      setKey("");
      secrets.refresh();
      info.refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        action={<RefreshButton onClick={() => { catalog.refresh(); secrets.refresh(); }} />}
      >
        Providers {catalog.data && <span className="text-muted-foreground">· {catalog.data.count}</span>}
      </SectionTitle>

      <Card className="space-y-3 p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Active provider & key
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Currently:</span>
          <Badge variant="accent">{active || "none"}</Badge>
          <Badge variant={keyPresent ? "success" : "warning"}>{keyPresent ? "key set" : "no key"}</Badge>
          {secrets.data?.encrypt_at_rest && <span className="text-[10px]">· encrypted at rest</span>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Combobox
            items={(catalog.data?.providers ?? []).map((p) => ({
              value: p.id,
              label: p.display_name,
              hint: p.local ? "local" : undefined,
            }))}
            value={provider}
            onChange={changeProvider}
            placeholder="Choose provider…"
            searchPlaceholder="Search provider…"
            emptyText="No providers"
          />
          <ModelPicker
            provider={provider}
            value={model}
            onChange={setModel}
            defaultModel={info.data?.model}
          />
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="API base URL (optional)"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          type="password"
          placeholder="API key for this provider (leave blank to keep current)"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy || !provider}>
            <KeyRound className="size-4" /> Save provider &amp; key
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Sets the active provider; key stored encrypted, never shown back.
          </span>
        </div>
      </Card>

      <PanelFrame loading={catalog.loading} error={catalog.error} onRefresh={catalog.refresh}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.data?.providers.map((p) => (
            <Card
              key={p.id}
              className={cn("flex items-center justify-between p-3", p.id === active && "border-accent/50")}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.display_name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{p.id}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.id === active && <Badge variant="accent">active</Badge>}
                {p.local && <Badge variant="success">local</Badge>}
              </div>
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
  const installed = useAsync(() => api.skills(), []);
  const [view, setView] = React.useState<"installed" | "browse">("installed");
  const [query, setQuery] = React.useState("");
  const [hub, setHub] = React.useState<ClawHubSkill[] | null>(null);
  const [hubLoading, setHubLoading] = React.useState(false);
  const [hubError, setHubError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<string | null>(null);

  const installedNames = React.useMemo(
    () => new Set((installed.data?.skills || []).map((s) => s.name.toLowerCase())),
    [installed.data],
  );

  // Nothing installed yet → open the marketplace so there's something to do.
  const autoSwitched = React.useRef(false);
  React.useEffect(() => {
    if (!autoSwitched.current && installed.data && installed.data.count === 0) {
      autoSwitched.current = true;
      setView("browse");
    }
  }, [installed.data]);

  React.useEffect(() => {
    if (view !== "browse") return;
    setHubLoading(true);
    setHubError(null);
    const t = setTimeout(
      async () => {
        try {
          const { items } = await api.clawhub(query.trim() || undefined);
          setHub(items);
        } catch (e) {
          setHubError(e instanceof Error ? e.message : String(e));
          setHub([]);
        } finally {
          setHubLoading(false);
        }
      },
      query.trim() ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [view, query]);

  const toggle = async (name: string, enabled: boolean) => {
    try {
      await api.setSkillEnabled(name, enabled);
      toast.success(`${name} ${enabled ? "enabled" : "disabled"}`);
      installed.refresh();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  const install = async (slug: string) => {
    setWorking(slug);
    const t = toast.loading(`Installing ${slug}…`);
    try {
      await api.installSkill(slug);
      toast.success(`Installed ${slug}`, { id: t });
      installed.refresh();
    } catch (e) {
      toast.error(`Install failed: ${e instanceof Error ? e.message : e}`, { id: t });
    } finally {
      setWorking(null);
    }
  };

  const uninstall = async (name: string) => {
    setWorking(name);
    try {
      await api.uninstallSkill(name);
      toast.success(`Removed ${name}`);
      installed.refresh();
    } catch (e) {
      toast.error(`Remove failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  const SegBtn = ({ v, children }: { v: "installed" | "browse"; children: React.ReactNode }) => (
    <button
      onClick={() => {
        autoSwitched.current = true;
        setView(v);
      }}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
        view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg bg-secondary/60 p-1">
          <SegBtn v="installed">
            Installed{installed.data ? ` · ${installed.data.count}` : ""}
          </SegBtn>
          <SegBtn v="browse">Browse ClawHub</SegBtn>
        </div>
        {view === "installed" && <RefreshButton onClick={installed.refresh} />}
      </div>

      {view === "installed" ? (
        <PanelFrame
          loading={installed.loading}
          error={installed.error}
          empty={installed.data?.count === 0}
          onRefresh={installed.refresh}
        >
          <div className="space-y-2">
            {installed.data?.skills.map((s) => {
              const enabled = s.enabled !== false;
              const busy = working === s.name;
              return (
                <Card key={s.name} className={cn("p-3", !enabled && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{s.name}</span>
                    {s.version && <span className="text-[10px] text-muted-foreground">v{s.version}</span>}
                    {!enabled && <Badge variant="warning" className="text-[10px]">disabled</Badge>}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => toggle(s.name, !enabled)}
                        title={enabled ? "Disable" : "Enable"}
                        className={cn(
                          "rounded-md p-1.5 cursor-pointer",
                          enabled ? "text-success hover:bg-success/10" : "text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        <Power className="size-3.5" />
                      </button>
                      <button
                        onClick={() => uninstall(s.name)}
                        disabled={busy}
                        title="Uninstall"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
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
              );
            })}
          </div>
        </PanelFrame>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ClawHub skills…"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {hubLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {hubError ? (
            <div className="py-8 text-center text-sm text-destructive">ClawHub: {hubError}</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {(hub || []).map((s) => {
                const isInstalled = installedNames.has(s.slug.toLowerCase());
                const busy = working === s.slug;
                return (
                  <Card key={s.slug} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{s.displayName}</span>
                          {s.version && <span className="text-[10px] text-muted-foreground">v{s.version}</span>}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{s.slug}</div>
                      </div>
                      {isInstalled ? (
                        <Badge variant="success" className="shrink-0">installed</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => install(s.slug)}
                          disabled={busy}
                          className="shrink-0"
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                          Install
                        </Button>
                      )}
                    </div>
                    {s.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {s.stars != null && (
                        <span className="flex items-center gap-0.5">
                          <Star className="size-3" /> {formatNumber(s.stars)}
                        </span>
                      )}
                      {s.downloads != null && (
                        <span className="flex items-center gap-0.5">
                          <Download className="size-3" /> {formatNumber(s.downloads)}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
              {!hubLoading && hub && hub.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No skills found.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Memory ──────────────────────────────────────────────────────────────────
const MEMORY_CATEGORIES = ["core", "daily", "conversation"];

export function MemoryPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.memory(100), []);
  const [content, setContent] = React.useState("");
  const [category, setCategory] = React.useState("core");
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);

  const add = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api.addMemory({ content: content.trim(), category });
      toast.success("Fact stored");
      setContent("");
      refresh();
    } catch (e) {
      toast.error(`Store failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const del = async (key: string) => {
    setWorking(key);
    try {
      await api.deleteMemory(key);
      toast.success("Fact forgotten");
      refresh();
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Memory entries {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>

      <Card className="space-y-2 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Store a fact
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="A durable fact or preference the agent should remember…"
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring scrollbar-thin"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={add} disabled={busy || !content.trim()}>
            <Plus className="size-4" /> Store
          </Button>
        </div>
      </Card>

      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <div className="space-y-2">
          {data?.entries.map((e, idx) => {
            const w = working === e.key;
            return (
              <Card key={`${e.key}-${idx}`} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{e.key}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {e.category}
                    </Badge>
                    <button
                      onClick={() => del(e.key)}
                      disabled={w}
                      title="Forget"
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer disabled:opacity-50"
                    >
                      {w ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {e.content}
                </p>
                <div className="mt-1 text-[10px] text-muted-foreground">{relativeTime(e.timestamp)}</div>
              </Card>
            );
          })}
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
  const [prompt, setPrompt] = React.useState("");
  const [expr, setExpr] = React.useState("0 9 * * *");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const create = async () => {
    if (!prompt.trim() || !expr.trim()) return;
    setBusy(true);
    try {
      await api.createCron({
        schedule: { kind: "cron", expr: expr.trim() },
        prompt: prompt.trim(),
        name: name.trim() || undefined,
      });
      toast.success("Cron job created");
      setPrompt("");
      setName("");
      refresh();
    } catch (e) {
      toast.error(`Create failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await api.updateCron(id, { enabled });
      refresh();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };
  const run = async (id: string) => {
    const t = toast.loading("Running job…");
    try {
      const r = await api.runCron(id);
      toast[r.success ? "success" : "error"](r.success ? "Job ran" : "Job failed", {
        id: t,
        description: (r.output || "").slice(0, 200),
      });
      refresh();
    } catch (e) {
      toast.error(`Run failed: ${e instanceof Error ? e.message : e}`, { id: t });
    }
  };
  const del = async (id: string) => {
    try {
      await api.deleteCron(id);
      toast.success("Job deleted");
      refresh();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} />}>
        Scheduled jobs {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>

      <Card className="space-y-2 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          New agent job
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt the agent runs on schedule…"
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring scrollbar-thin"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="0 9 * * *"
            className="h-8 w-32 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (optional)"
            className="h-8 min-w-[120px] flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="sm" onClick={create} disabled={busy || !prompt.trim() || !expr.trim()}>
            <Plus className="size-4" /> Create
          </Button>
        </div>
      </Card>

      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <Card className="divide-y divide-border">
          {data?.jobs.map((j) => (
            <div key={j.id} className="flex items-center gap-1.5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{j.name || j.id.slice(0, 8)}</span>
                  <Badge variant="secondary" className="text-[10px]">{j.job_type}</Badge>
                  {!j.enabled && <Badge variant="warning" className="text-[10px]">paused</Badge>}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {j.expression} · next {fmtWhen(j.next_run)}
                  {j.last_status ? ` · last: ${j.last_status}` : ""}
                </div>
              </div>
              <button
                onClick={() => toggle(j.id, !j.enabled)}
                title={j.enabled ? "Disable" : "Enable"}
                className={cn(
                  "rounded-md p-1.5 cursor-pointer",
                  j.enabled ? "text-success hover:bg-success/10" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                <Power className="size-3.5" />
              </button>
              <button
                onClick={() => run(j.id)}
                title="Run now"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <Play className="size-3.5" />
              </button>
              <button
                onClick={() => del(j.id)}
                title="Delete"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              >
                <Trash2 className="size-3.5" />
              </button>
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
  const groups = useAsync(() => api.kbGroups(), []);
  const [preset, setPreset] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Always-on KB ids, seeded from the saved personality.
  const [alwaysOn, setAlwaysOn] = React.useState<string[]>([]);
  const [savingKbs, setSavingKbs] = React.useState(false);

  React.useEffect(() => {
    if (data?.preset) setPreset(data.preset);
  }, [data?.preset]);
  React.useEffect(() => {
    if (data) setAlwaysOn(Array.isArray(data.always_on_kbs) ? data.always_on_kbs : []);
  }, [data]);

  const apply = async () => {
    if (!preset) return;
    setSaving(true);
    try {
      // Preserve the always-on KB binding when changing the preset.
      await api.setPersonality({ preset, always_on_kbs: alwaysOn });
      toast.success(`Preset set to “${preset}”`);
      refresh();
    } catch (e) {
      toast.error(`Failed to set preset: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  // Toggle a KB in the always-on set and persist immediately (preserving the preset).
  const toggleKb = async (id: string) => {
    const next = alwaysOn.includes(id) ? alwaysOn.filter((x) => x !== id) : [...alwaysOn, id];
    setAlwaysOn(next);
    setSavingKbs(true);
    try {
      await api.setPersonality({ preset: data?.preset || preset || undefined, always_on_kbs: next });
      toast.success("Always-on knowledge bases updated");
      refresh();
    } catch (e) {
      // Roll back the optimistic toggle on failure.
      setAlwaysOn(alwaysOn);
      toast.error(`Failed to update: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSavingKbs(false);
    }
  };

  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={() => { refresh(); groups.refresh(); }} />}>
        Personality
      </SectionTitle>
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

            {/* Always-on knowledge bases — retrieved on every chat regardless of per-chat selection. */}
            <div className="mt-4 border-t border-border/60 pt-4">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Always-on knowledge bases
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Selected bases are searched on every conversation for this persona.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(groups.data || []).length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {groups.loading ? "Loading…" : "No knowledge bases yet."}
                  </span>
                ) : (
                  (groups.data || []).map((g) => {
                    const on = alwaysOn.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleKb(g.id)}
                        disabled={savingKbs}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50",
                          on
                            ? "border-accent/60 bg-accent/10 text-accent"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        title={g.description || g.name}
                      >
                        {g.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        )}
      </PanelFrame>
    </div>
  );
}

// ── Knowledge Bases ───────────────────────────────────────────────────────────
// The full KB UI lives in ./kb-panel.tsx; re-exported here so existing importers
// (ops-view.tsx imports KbPanel from panels.tsx) keep resolving unchanged.
export { KbPanel } from "./kb-panel";

// ── Config ──────────────────────────────────────────────────────────────────
export function ConfigPanel() {
  const cfg = useAsync(() => api.config(), []);
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);

  React.useEffect(() => {
    if (cfg.data) {
      setProvider((cfg.data.default_provider as string) || "");
      setModel((cfg.data.default_model as string) || "");
      setTemp(cfg.data.default_temperature != null ? String(cfg.data.default_temperature) : "");
    }
  }, [cfg.data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.setConfigModel({
        provider: provider || undefined,
        model: model || undefined,
        temperature: temp ? Number(temp) : undefined,
      });
      toast.success("Config updated");
      cfg.refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} />}>Config</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Default model
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="provider"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model"
            className="h-9 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="temperature"
            type="number"
            step="0.1"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button size="sm" onClick={save} disabled={busy}>
          <Save className="size-4" /> Save model
        </Button>
      </Card>

      <div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {showRaw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showRaw ? "Hide" : "Show"} full config (secrets redacted)
        </button>
        {showRaw && (
          <PanelFrame loading={cfg.loading} error={cfg.error} onRefresh={cfg.refresh}>
            <pre className="mt-2 max-h-[460px] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] scrollbar-thin">
              {JSON.stringify(cfg.data, null, 2)}
            </pre>
          </PanelFrame>
        )}
      </div>
    </div>
  );
}

// ── MCP Servers ─────────────────────────────────────────────────────────────
export function McpPanel() {
  const cfg = useAsync(() => api.config(), []);
  const servers = React.useMemo(() => {
    const m = (cfg.data?.mcp_servers ?? {}) as Record<string, Record<string, unknown>>;
    return Object.entries(m);
  }, [cfg.data]);

  const [name, setName] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [args, setArgs] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);

  const add = async () => {
    if (!name.trim() || !command.trim()) return;
    setBusy(true);
    try {
      await api.addMcpServer(name.trim(), {
        command: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
      });
      toast.success(`Added MCP server “${name.trim()}” · applies on daemon restart`);
      setName("");
      setCommand("");
      setArgs("");
      cfg.refresh();
    } catch (e) {
      toast.error(`Add failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: string) => {
    setWorking(n);
    try {
      await api.deleteMcpServer(n);
      toast.success(`Removed “${n}” · applies on daemon restart`);
      cfg.refresh();
    } catch (e) {
      toast.error(`Remove failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} />}>
        Configured servers <span className="text-muted-foreground">· {servers.length}</span>
      </SectionTitle>

      <Card className="space-y-2 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Add a stdio MCP server
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (e.g. github)"
            className="h-8 w-40 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="command (e.g. npx)"
            className="h-8 w-32 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="args (space-separated, e.g. -y @modelcontextprotocol/server-github)"
            className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="sm" onClick={add} disabled={busy || !name.trim() || !command.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Persisted to <code>[mcp_servers]</code>; the runtime connects on the next daemon restart.
        </p>
      </Card>

      <PanelFrame loading={cfg.loading} error={cfg.error} onRefresh={cfg.refresh}>
        {servers.length === 0 ? (
          <div className="card" style={{ padding: "28px 18px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              No MCP servers configured yet — add one above.
            </div>
          </div>
        ) : (
          <div className="rows">
            {servers.map(([n, s]) => {
              const sArgs = Array.isArray(s?.args) ? (s.args as string[]) : [];
              const cmd = [s?.command as string, ...sArgs].filter(Boolean).join(" ");
              const w = working === n;
              return (
                <div className="row" key={n}>
                  <span className="r-dot" style={{ background: "var(--accent-teal)" }} />
                  <span className="r-name">{n}</span>
                  <span className="r-proto">stdio</span>
                  <span className="r-note">{cmd || "—"}</span>
                  <button
                    onClick={() => remove(n)}
                    disabled={w}
                    title="Remove"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer disabled:opacity-50"
                  >
                    {w ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PanelFrame>
    </div>
  );
}

// ── Tools & Autonomy ────────────────────────────────────────────────────────
const AUTONOMY_LEVELS = [
  { id: "read_only", label: "Read-only", dot: "var(--accent-purple)", blurb: "Observe only — no actions taken." },
  { id: "supervised", label: "Supervised", dot: "var(--brand-sky)", blurb: "Acts, but risky operations require approval." },
  { id: "full", label: "Full", dot: "var(--accent-green)", blurb: "Autonomous execution within policy bounds." },
];
const normLevel = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, "");

export function ToolsPanel() {
  const cfg = useAsync(() => api.config(), []);
  const a = (cfg.data?.autonomy ?? {}) as Record<string, unknown>;

  const arr = (k: string): string[] => (Array.isArray(a[k]) ? (a[k] as string[]) : []);
  const bool = (k: string): boolean => a[k] === true;
  const num = (k: string): number | null => (typeof a[k] === "number" ? (a[k] as number) : null);

  const level = (a.level as string) || "supervised";
  const maxActions = num("max_actions_per_hour");
  const maxCostCents = num("max_cost_per_day_cents");
  const autoApprove = arr("auto_approve");
  const alwaysAsk = arr("always_ask");
  const allowed = arr("allowed_commands");
  const forbidden = arr("forbidden_paths");

  const [busy, setBusy] = React.useState(false);
  const [cmd, setCmd] = React.useState("");

  const patch = async (body: Parameters<typeof api.setAutonomy>[0], msg?: string) => {
    setBusy(true);
    try {
      await api.setAutonomy(body);
      if (msg) toast.success(msg);
      cfg.refresh();
    } catch (e) {
      toast.error(`Update failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleTool = (tool: string) => {
    const next = autoApprove.includes(tool)
      ? autoApprove.filter((t) => t !== tool)
      : [...autoApprove, tool];
    patch({ auto_approve: next });
  };
  const addCmd = () => {
    const c = cmd.trim();
    if (!c) return;
    if (!allowed.includes(c)) patch({ allowed_commands: [...allowed, c] }, `Allowed “${c}”`);
    setCmd("");
  };
  const removeCmd = (c: string) => patch({ allowed_commands: allowed.filter((x) => x !== c) });

  const activeLevel = AUTONOMY_LEVELS.find((l) => normLevel(l.id) === normLevel(level));

  return (
    <div className="space-y-5">
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} />}>Policy</SectionTitle>
      <PanelFrame loading={cfg.loading} error={cfg.error} onRefresh={cfg.refresh}>
        {/* Autonomy level — editable */}
        <div style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Autonomy level
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {AUTONOMY_LEVELS.map((l) => {
              const on = normLevel(l.id) === normLevel(level);
              return (
                <button
                  key={l.id}
                  className="gbtn"
                  disabled={busy}
                  onClick={() => patch({ level: l.id }, `Autonomy level → ${l.label}`)}
                  style={
                    on
                      ? { borderColor: l.dot, color: l.dot, background: "oklch(1 0 0 / 3%)" }
                      : undefined
                  }
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: l.dot, display: "inline-block" }} />
                  {l.label}
                </button>
              );
            })}
          </div>
          <div className="auto-blurb" style={{ minHeight: 0, marginTop: 8 }}>
            {activeLevel?.blurb || ""}
          </div>
        </div>

        {/* Limits — read-only */}
        <div className="stat-strip">
          <div className="stat-cell">
            <div className="s-fig" style={{ textTransform: "capitalize" }}>
              {activeLevel?.label || level}
            </div>
            <div className="s-lab">autonomy level</div>
          </div>
          <div className="stat-cell">
            <div className="s-fig">
              {maxActions ?? "—"} <small>/ hr</small>
            </div>
            <div className="s-lab">action cap</div>
          </div>
          <div className="stat-cell">
            <div className="s-fig">{maxCostCents != null ? `$${(maxCostCents / 100).toFixed(2)}` : "—"}</div>
            <div className="s-lab">cost / day</div>
          </div>
          <div className="stat-cell">
            <div className="s-fig" style={{ color: bool("workspace_only") ? "var(--accent-green)" : "var(--foreground)" }}>
              {bool("workspace_only") ? "On" : "Off"}
            </div>
            <div className="s-lab">workspace only</div>
          </div>
        </div>

        {/* Per-tool auto-approve — editable switches */}
        <div style={{ marginTop: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Tool policy · auto-approve runs without asking
          </div>
          <div className="rows">
            {BUILTIN_TOOLS.map((tool) => {
              const auto = autoApprove.includes(tool);
              const ask = alwaysAsk.includes(tool);
              return (
                <div className="row" key={tool}>
                  <span className="r-name" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                    {tool}
                  </span>
                  <span className="r-note">
                    {ask ? "always prompts (Manual)" : auto ? "runs without asking" : "follows level default"}
                  </span>
                  <div
                    className={"switch" + (auto ? " on" : "")}
                    onClick={() => !busy && toggleTool(tool)}
                    role="switch"
                    aria-checked={auto}
                    title={auto ? "Auto-approved" : "Requires approval"}
                  >
                    <i />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shell allowlist — editable chips */}
        <div style={{ marginTop: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Shell allowlist · {allowed.length}
          </div>
          {allowed.length > 0 && (
            <div className="chips" style={{ marginBottom: 10 }}>
              {allowed.map((c) => (
                <span className="lchip" key={c}>
                  {c}
                  <span
                    onClick={() => !busy && removeCmd(c)}
                    style={{ cursor: "pointer", color: "var(--muted-foreground)", display: "inline-flex" }}
                    title="Remove"
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </span>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCmd();
              }}
              placeholder="add command (e.g. docker)"
              className="field-input"
              style={{ maxWidth: 240 }}
            />
            <Button size="sm" onClick={addCmd} disabled={busy || !cmd.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
        </div>

        {/* Forbidden paths — read-only */}
        {forbidden.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Forbidden paths · {forbidden.length} (read-only)
            </div>
            <div className="chips">
              {forbidden.map((p) => (
                <span className="lchip dim" key={p}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="auto-blurb" style={{ minHeight: 0, marginTop: 16 }}>
          {bool("block_high_risk_commands") ? "High-risk commands blocked. " : ""}
          {bool("require_approval_for_medium_risk") ? "Medium-risk requires approval. " : ""}
          Changes apply to new agent runs; the daemon reloads policy on restart.
        </div>
      </PanelFrame>
    </div>
  );
}

// ── Secrets ─────────────────────────────────────────────────────────────────
export function SecretsPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.secrets(), []);
  const [key, setKey] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    if (!key.trim() && !url.trim()) return;
    setBusy(true);
    try {
      await api.setSecrets({ api_key: key.trim() || undefined, api_url: url.trim() || undefined });
      toast.success("Secret saved (encrypted at rest)");
      setKey("");
      setUrl("");
      refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} />}>Secrets</SectionTitle>
      <PanelFrame loading={loading} error={error} onRefresh={refresh}>
        {data && (
          <Card className="space-y-3 p-4">
            <KeyVal k="Provider" v={data.provider || "—"} />
            <KeyVal k="API key" v={data.api_key_present ? "set ✓" : "not set"} />
            {data.api_url && <KeyVal k="API URL" v={data.api_url} mono />}
            <KeyVal k="Encrypted at rest" v={data.encrypt_at_rest ? "yes" : "no"} />
            <div className="space-y-2 border-t border-border/60 pt-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Set provider key
              </div>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                type="password"
                placeholder="API key for the active provider"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="API base URL (optional)"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button size="sm" onClick={save} disabled={busy || (!key.trim() && !url.trim())}>
                <KeyRound className="size-4" /> Save key
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Stored encrypted in the active profile. Never displayed back.
              </p>
            </div>
          </Card>
        )}
      </PanelFrame>
    </div>
  );
}
