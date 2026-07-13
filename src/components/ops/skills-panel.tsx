"use client";

import * as React from "react";
import { Download, Loader2, Power, Search, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { ClawHubSkill } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import { EmptyState, IconButton, PanelFrame, RefreshButton } from "./shared";

export function SkillsPanel() {
  const installed = useAsync(() => api.skills(), []);
  const [view, setView] = React.useState<"installed" | "browse">("installed");
  const [query, setQuery] = React.useState("");
  const [hub, setHub] = React.useState<ClawHubSkill[] | null>(null);
  const [hubLoading, setHubLoading] = React.useState(false);
  const [hubError, setHubError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<string | null>(null);
  const [pendingUninstall, setPendingUninstall] = React.useState<string | null>(null);

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

  const uninstall = async () => {
    const name = pendingUninstall;
    if (!name) return;
    setWorking(name);
    try {
      await api.uninstallSkill(name);
      toast.success(`Removed ${name}`);
      setPendingUninstall(null);
      installed.refresh();
    } catch (e) {
      toast.error(`Remove failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          value={view}
          onChange={(v) => {
            autoSwitched.current = true;
            setView(v);
          }}
          options={[
            { value: "installed", label: `Installed${installed.data ? ` · ${installed.data.count}` : ""}` },
            { value: "browse", label: "Browse ClawHub" },
          ]}
        />
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
                        onClick={() => setPendingUninstall(s.name)}
                        disabled={busy}
                        title="Uninstall"
                        aria-label={`Uninstall ${s.name}`}
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

      <ConfirmModal
        open={!!pendingUninstall}
        onClose={() => setPendingUninstall(null)}
        title="Uninstall skill?"
        description={
          pendingUninstall
            ? `“${pendingUninstall}” will be removed from the agent. You can reinstall it from ClawHub later.`
            : undefined
        }
        confirmLabel="Uninstall"
        busy={working === pendingUninstall}
        onConfirm={uninstall}
      />
    </div>
  );
}
