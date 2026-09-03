"use client";

import * as React from "react";
import { Loader2, Plus, Server, Trash2 } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { GatewayMcpServer } from "@/lib/types";
import { CONFIG_CHANGED } from "@/lib/console";
import { toast } from "sonner";
import { EmptyState, IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";

/** Split a command-line arg string into tokens, honoring single/double quotes so
 *  a path with spaces (e.g. --path "/a b") survives as one arg. Whitespace-split
 *  alone silently mangled those. */
function parseArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/** The page opens with the answer: how many servers the runtime will load,
 *  and which. */
function McpBand({ names }: { names: string[] }) {
  const n = names.length;
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ background: n > 0 ? "var(--accent-green)" : "var(--accent-orange)" }}
        />
        <h2 className="text-xl font-medium tracking-tight">
          {n === 0 ? "No MCP servers yet" : `${n} MCP ${n === 1 ? "server" : "servers"} configured`}
        </h2>
      </div>
      {n > 0 && (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">
          {names.slice(0, 4).join(" · ")}
          {n > 4 ? ` · +${n - 4} more` : ""}
        </p>
      )}
    </div>
  );
}

export function McpPanel() {
  const cfg = useAsync(() => api.config(), []);
  const servers = React.useMemo(() => {
    const m: Record<string, GatewayMcpServer> = cfg.data?.mcp_servers ?? {};
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
        args: parseArgs(args),
      });
      toast.success(`Added MCP server “${name.trim()}” · applies on daemon restart`);
      setName("");
      setCommand("");
      setArgs("");
      cfg.refresh();
      // Update the shell's MCP nav badge (a load-time snapshot).
      window.dispatchEvent(new Event(CONFIG_CHANGED));
    } catch (e) {
      toast.error(`Add failed: ${describeApiError(e)}`);
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
      // Update the shell's MCP nav badge (a load-time snapshot).
      window.dispatchEvent(new Event(CONFIG_CHANGED));
    } catch (e) {
      toast.error(`Remove failed: ${describeApiError(e)}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PanelFrame
            loading={cfg.loading}
            loadingLabel="Loading MCP servers…"
            error={cfg.error}
            loaded={cfg.loaded}
            onRefresh={cfg.refresh}
          >
            {cfg.data && <McpBand names={servers.map(([n]) => n)} />}
          </PanelFrame>
        </div>
        <RefreshButton onClick={cfg.refresh} spinning={cfg.refreshing} />
      </div>

      {/* The 7/5 split: the servers the runtime will load are the answer, the
          add-form composes in the narrow column like every other panel. */}
      {cfg.data && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <SectionTitle>
              Servers <span className="text-muted-foreground">· {servers.length}</span>
            </SectionTitle>
            {servers.length === 0 ? (
              <EmptyState
                icon={<Server className="size-6" />}
                title="No MCP servers configured yet"
                hint="Add one with the form beside this list. It connects on the next daemon restart."
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
                          {cmd || "no command recorded"}
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
          </div>

          <div className="min-w-0 lg:col-span-5">
            <SectionTitle>Add a server</SectionTitle>
            <p className="text-xs text-muted-foreground">
              Stdio transport: the runtime launches the command and speaks MCP over its
              stdin/stdout. Applies on the next daemon restart.
            </p>
            <Card className="mt-3 space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Server name"
                  placeholder="github"
                  className="h-8 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Command</span>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  aria-label="Command"
                  placeholder="npx"
                  className="h-8 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Arguments</span>
                <Input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  aria-label="Arguments"
                  placeholder={'-y @scope/pkg --path "/a b"'}
                  className="h-8 font-mono text-xs"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Space-separated; quote a value that contains spaces.
                </span>
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Persisted to <code>[mcp_servers]</code>.
                </span>
                <Button size="sm" onClick={add} disabled={busy || !name.trim() || !command.trim()}>
                  <Plus className="size-4" /> Add server
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

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
