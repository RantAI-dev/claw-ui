"use client";

import * as React from "react";
import { Loader2, Plus, Server, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import { EmptyState, IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";

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
  const [pendingRemove, setPendingRemove] = React.useState<string | null>(null);

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

  const remove = async () => {
    const n = pendingRemove;
    if (!n) return;
    setWorking(n);
    try {
      await api.deleteMcpServer(n);
      toast.success(`Removed “${n}” · applies on daemon restart`);
      setPendingRemove(null);
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
                    onClick={() => setPendingRemove(n)}
                    disabled={w}
                    title="Remove"
                    aria-label={`Remove MCP server ${n}`}
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

      <ConfirmModal
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        title="Remove MCP server?"
        description={
          pendingRemove
            ? `“${pendingRemove}” will be removed from the config; the runtime drops it on the next daemon restart.`
            : undefined
        }
        confirmLabel="Remove"
        busy={!!working}
        onConfirm={remove}
      />
    </div>
  );
}
