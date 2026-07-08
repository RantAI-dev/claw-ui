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
  Server,
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { EmptyState, IconButton, KeyVal, PanelFrame, SeverityBadge, StatTile } from "./shared";

const PERSONA_PRESETS = [
  { value: "default", label: "Default" },
  { value: "concise_pro", label: "Concise Pro" },
  { value: "friendly_companion", label: "Friendly Companion" },
  { value: "research_analyst", label: "Research Analyst" },
  { value: "executive_assistant", label: "Executive Assistant" },
];

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <RefreshCw /> Refresh
    </Button>
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
                <StatTile label="Version" value={s.version} />
                <StatTile label="Provider" value={s.provider || "—"} tone="accent" />
                <StatTile label="Paired" value={s.paired ? "Yes" : "No"} tone={s.paired ? "success" : "warning"} />
                <StatTile label="Autonomy" value={s.autonomy || "—"} />
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
              <StatTile label="Sessions" value={formatNumber(i.total_sessions)} />
              <StatTile label="Messages" value={formatNumber(i.total_messages)} />
              <StatTile label="Avg / session" value={i.avg_messages_per_session.toFixed(1)} />
              <StatTile label="Latest" value={relativeTime(i.latest_session_started_at)} tone="accent" />
            </div>
          )}
        </PanelFrame>
      </div>
      <div>
        <SectionTitle>Memory</SectionTitle>
        <PanelFrame loading={memStats.loading} error={memStats.error} onRefresh={memStats.refresh}>
          {memStats.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Backend" value={memStats.data.backend} />
              <StatTile label="Entries" value={formatNumber(memStats.data.total_entries)} />
              <StatTile
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
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="API base URL (optional)"
        />
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          type="password"
          placeholder="API key for this provider (leave blank to keep current)"
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

// Channels the backend supports (config schema). Telegram is fully manageable
// from the console today; the rest are configurable via the TUI/config only and
// are surfaced here as "under development" until their console flow ships.
const OTHER_CHANNELS: { key: string; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "discord", label: "Discord" },
  { key: "slack", label: "Slack" },
  { key: "signal", label: "Signal" },
  { key: "matrix", label: "Matrix" },
  { key: "mattermost", label: "Mattermost" },
  { key: "email", label: "Email" },
  { key: "irc", label: "IRC" },
  { key: "imessage", label: "iMessage" },
  { key: "linq", label: "Linq (SMS/RCS)" },
  { key: "nextcloud_talk", label: "Nextcloud Talk" },
  { key: "lark", label: "Lark / Feishu" },
  { key: "dingtalk", label: "DingTalk" },
  { key: "qq", label: "QQ" },
];

/** Pull the Telegram allowlist out of GET /config (the bot token itself is redacted). */
function telegramAllowlist(config: Record<string, unknown> | null): string[] {
  const cc = config?.["channels_config"] as Record<string, unknown> | undefined;
  const tg = cc?.["telegram"] as Record<string, unknown> | undefined;
  const allowed = tg?.["allowed_users"];
  return Array.isArray(allowed) ? (allowed as string[]) : [];
}

export function ChannelsPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.channels(), []);
  const cfg = useAsync(() => api.config(), []);
  const tgConnected = !!data?.configured.includes("telegram");

  const refreshNow = () => {
    refresh();
    cfg.refresh();
  };
  // Channel config changes reload the runtime (a few seconds), so refetch after a
  // short settle delay — an instant refetch would race the gateway restart.
  const refreshAfterReload = () => {
    setTimeout(refreshNow, 3000);
  };

  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refreshNow} />}>
        Channels {data && <span className="text-muted-foreground">· {data.count} configured</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} onRefresh={refreshNow}>
        <TelegramCard
          connected={tgConnected}
          allowedUsers={telegramAllowlist(cfg.data)}
          onReload={refreshAfterReload}
        />

        <div className="mt-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            More channels
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OTHER_CHANNELS.map((c) => (
              <UnderDevelopmentChannel
                key={c.key}
                label={c.label}
                active={!!data?.configured.includes(c.key)}
              />
            ))}
          </div>
        </div>
      </PanelFrame>
    </div>
  );
}

function TelegramCard({
  connected,
  allowedUsers,
  onReload,
}: {
  connected: boolean;
  allowedUsers: string[];
  onReload: () => void;
}) {
  const [token, setToken] = React.useState("");
  const [users, setUsers] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Prefill the allowlist editor with the saved list once connected.
  const savedAllowlist = allowedUsers.join(", ");
  React.useEffect(() => {
    if (connected) setUsers(savedAllowlist);
  }, [connected, savedAllowlist]);

  const parseUsers = () =>
    users
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const notify = (r: { warning?: string | null; note?: string }) => {
    if (r.warning) toast.warning(r.warning);
    else if (r.note) toast.message(r.note);
  };

  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await api.connectTelegram(t, parseUsers());
      toast.success(`Connected Telegram @${r.bot_username}`);
      notify(r);
      setToken("");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAllowlist = async () => {
    setBusy(true);
    try {
      const r = await api.updateTelegramAllowlist(parseUsers());
      toast.success("Allowlist updated");
      notify(r);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect Telegram? The saved bot token will be cleared — you'll need to re-enter it from @BotFather to reconnect.",
      )
    )
      return;
    setBusy(true);
    try {
      await api.disconnectTelegram();
      toast.success("Disconnected Telegram");
      setUsers("");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          Telegram
          {connected ? (
            <Badge variant="success" className="text-[10px] uppercase tracking-wide">
              connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              not connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {connected ? (
          <>
            <label className="text-xs text-muted-foreground">
              Allowed user ids / usernames (comma-separated)
            </label>
            <Input
              placeholder="Leave empty to deny all senders"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Saving reloads the runtime to apply — no need to re-enter the bot token.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={saveAllowlist} disabled={busy}>
                  {busy ? "Saving…" : "Save allowlist"}
                </Button>
                <Button size="sm" variant="destructive" onClick={disconnect} disabled={busy}>
                  Disconnect
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Input
              type="password"
              placeholder="Bot token (from @BotFather)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <Input
              placeholder="Allowed user ids / usernames (comma-separated)"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                The token is validated with Telegram, then saved (encrypted at rest). Leave allowed
                users empty to deny all senders.
              </span>
              <Button size="sm" onClick={connect} disabled={busy || !token.trim()}>
                {busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UnderDevelopmentChannel({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {active && (
          <Badge variant="success" className="text-[9px] uppercase tracking-wide">
            active
          </Badge>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {active ? "Running · manage via TUI" : "Under development"}
      </div>
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
                      <IconButton
                        onClick={() => toggle(s.name, !enabled)}
                        title={enabled ? "Disable" : "Enable"}
                        className={cn(enabled && "text-success hover:bg-success/10 hover:text-success")}
                      >
                        <Power className="size-3.5" />
                      </IconButton>
                      <IconButton
                        onClick={() => uninstall(s.name)}
                        disabled={busy}
                        title="Uninstall"
                        className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </IconButton>
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
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ClawHub skills…"
              className="pl-8 pr-8"
            />
            {hubLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {hubError ? (
            <EmptyState tone="destructive" title="ClawHub unavailable" hint={hubError} />
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
                <EmptyState className="col-span-full" title="No skills found." />
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
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="A durable fact or preference the agent should remember…"
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 font-mono text-xs"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
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
                    <IconButton
                      onClick={() => del(e.key)}
                      disabled={w}
                      title="Forget"
                      className="hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {w ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </IconButton>
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
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt the agent runs on schedule…"
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="0 9 * * *"
            className="h-8 w-32 font-mono text-xs"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (optional)"
            className="h-8 min-w-[120px] flex-1 text-xs"
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
              <IconButton
                onClick={() => toggle(j.id, !j.enabled)}
                title={j.enabled ? "Disable" : "Enable"}
                className={cn(j.enabled && "text-success hover:bg-success/10 hover:text-success")}
              >
                <Power className="size-3.5" />
              </IconButton>
              <IconButton onClick={() => run(j.id)} title="Run now">
                <Play className="size-3.5" />
              </IconButton>
              <IconButton
                onClick={() => del(j.id)}
                title="Delete"
                className="hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </IconButton>
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
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="min-w-0 flex-1"
              >
                <option value="" disabled>
                  Choose a preset…
                </option>
                {PERSONA_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
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

// ── Knowledge Graph ───────────────────────────────────────────────────────────
// Whole-KB entity/relation explorer (SP-3); lives in ./kb-graph-panel.tsx.
export { KbGraphPanel } from "./kb-graph-panel";

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
          <Input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="provider"
          />
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model"
            className="font-mono text-xs"
          />
          <Input
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="temperature"
            type="number"
            step="0.1"
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
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (e.g. github)"
            className="h-8 w-40 font-mono text-xs"
          />
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="command (e.g. npx)"
            className="h-8 w-32 font-mono text-xs"
          />
          <Input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="args (space-separated, e.g. -y @modelcontextprotocol/server-github)"
            className="h-8 min-w-[200px] flex-1 font-mono text-xs"
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
          <EmptyState
            icon={<Server className="size-6" />}
            title="No MCP servers configured yet"
            hint="Add one above — it connects on the next daemon restart."
          />
        ) : (
          <Card className="divide-y divide-border">
            {servers.map(([n, s]) => {
              const sArgs = Array.isArray(s?.args) ? (s.args as string[]) : [];
              const cmd = [s?.command as string, ...sArgs].filter(Boolean).join(" ");
              const w = working === n;
              return (
                <div key={n} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium">{n}</span>
                      <Badge variant="secondary" className="text-[10px]">stdio</Badge>
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground" title={cmd}>
                      {cmd || "—"}
                    </div>
                  </div>
                  <IconButton
                    onClick={() => remove(n)}
                    disabled={w}
                    title="Remove"
                    className="shrink-0 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {w ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </IconButton>
                </div>
              );
            })}
          </Card>
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
        <div className="space-y-5">
          {/* Autonomy level — editable */}
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Autonomy level
            </div>
            <div className="flex flex-wrap gap-2">
              {AUTONOMY_LEVELS.map((l) => {
                const on = normLevel(l.id) === normLevel(level);
                return (
                  <Button
                    key={l.id}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => patch({ level: l.id }, `Autonomy level → ${l.label}`)}
                    style={on ? { borderColor: l.dot, color: l.dot } : undefined}
                  >
                    <span
                      className="inline-block size-[7px] rounded-full"
                      style={{ background: l.dot }}
                    />
                    {l.label}
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{activeLevel?.blurb || ""}</p>
          </div>

          {/* Limits — read-only */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="autonomy level" value={activeLevel?.label || level} />
            <StatTile label="action cap" value={maxActions != null ? `${maxActions} / hr` : "—"} />
            <StatTile
              label="cost / day"
              value={maxCostCents != null ? `$${(maxCostCents / 100).toFixed(2)}` : "—"}
            />
            <StatTile
              label="workspace only"
              value={bool("workspace_only") ? "On" : "Off"}
              tone={bool("workspace_only") ? "success" : "default"}
            />
          </div>

          {/* Per-tool auto-approve — editable switches */}
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tool policy · auto-approve runs without asking
            </div>
            <Card className="divide-y divide-border">
              {BUILTIN_TOOLS.map((tool) => {
                const auto = autoApprove.includes(tool);
                const ask = alwaysAsk.includes(tool);
                return (
                  <div key={tool} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="font-mono text-[13px]">{tool}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
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
            </Card>
          </div>

          {/* Shell allowlist — editable chips */}
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Shell allowlist · {allowed.length}
            </div>
            {allowed.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {allowed.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-1.5 font-mono">
                    {c}
                    <button
                      onClick={() => !busy && removeCmd(c)}
                      title="Remove"
                      className="inline-flex cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCmd();
                }}
                placeholder="add command (e.g. docker)"
                className="max-w-60"
              />
              <Button size="sm" onClick={addCmd} disabled={busy || !cmd.trim()}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>

          {/* Forbidden paths — read-only */}
          {forbidden.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Forbidden paths · {forbidden.length} (read-only)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {forbidden.map((p) => (
                  <Badge key={p} variant="outline" className="font-mono text-muted-foreground">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {bool("block_high_risk_commands") ? "High-risk commands blocked. " : ""}
            {bool("require_approval_for_medium_risk") ? "Medium-risk requires approval. " : ""}
            Changes apply to new agent runs; the daemon reloads policy on restart.
          </p>
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
