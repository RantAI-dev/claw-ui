"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { AUTONOMY, BUILTIN_TOOLS, autonomyPreset, levelToRung, rungToAutonomyPayload } from "@/lib/console";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle, StatTile } from "./shared";

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

  // Map the gateway's real level (+always_ask count) onto the shared 4-rung
  // ladder so this panel and the chat-shell control speak the same vocabulary.
  const rung = levelToRung(level, alwaysAsk.length);
  const preset = autonomyPreset(rung);

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
    if (allowed.includes(c)) toast.message(`“${c}” is already in the allowlist`);
    else patch({ allowed_commands: [...allowed, c] }, `Allowed “${c}”`);
    setCmd("");
  };
  const removeCmd = (c: string) => patch({ allowed_commands: allowed.filter((x) => x !== c) });

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
              {AUTONOMY.map((p) => {
                const on = p.id === rung;
                return (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => patch(rungToAutonomyPayload(p.id), `Autonomy → ${p.label}`)}
                    style={on ? { borderColor: p.dot, color: p.dot } : undefined}
                  >
                    <span
                      className="inline-block size-[7px] rounded-full"
                      style={{ background: p.dot }}
                    />
                    {p.label}
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{preset.blurb}</p>
          </div>

          {/* Limits — read-only */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="block high-risk"
              value={bool("block_high_risk_commands") ? "On" : "Off"}
              tone={bool("block_high_risk_commands") ? "success" : "warning"}
            />
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
                    <button
                      type="button"
                      className={"switch" + (auto ? " on" : "")}
                      onClick={() => toggleTool(tool)}
                      disabled={busy}
                      role="switch"
                      aria-checked={auto}
                      aria-label={`Auto-approve ${tool}`}
                      title={auto ? "Auto-approved" : "Requires approval"}
                    >
                      <i />
                    </button>
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
