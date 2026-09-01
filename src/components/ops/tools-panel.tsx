"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { GatewayAutonomy } from "@/lib/types";
import { AUTONOMY, AUTONOMY_CHANGED, autonomyPreset } from "@/lib/console";
import {
  autoApproveEffective,
  hasWildcard,
  rungFromAutonomy,
  rungToAutonomyPayload,
  toolOutcome,
  toolRows,
} from "@/lib/autonomy";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle, StatTile } from "./shared";

export function ToolsPanel() {
  const cfg = useAsync(() => api.config(), []);
  const a: GatewayAutonomy = cfg.data?.autonomy ?? {};

  const arr = (k: string): string[] => (Array.isArray(a[k]) ? (a[k] as string[]) : []);
  const bool = (k: string): boolean => a[k] === true;
  const num = (k: string): number | null => (typeof a[k] === "number" ? (a[k] as number) : null);

  const maxActions = num("max_actions_per_hour");
  const maxCostCents = num("max_cost_per_day_cents");
  const autoApprove = arr("auto_approve");
  const allowed = arr("allowed_commands");
  const forbidden = arr("forbidden_paths");

  // The rung through the classifier the rail and Status also use, so the
  // three surfaces cannot disagree on one config.
  const rung = rungFromAutonomy(a);
  const preset = autonomyPreset(rung);

  // A rung written on the rail broadcasts; re-read so this panel follows it
  // (it used to keep the old rung until a manual Refresh).
  const refresh = cfg.refresh;
  React.useEffect(() => {
    window.addEventListener(AUTONOMY_CHANGED, refresh);
    return () => window.removeEventListener(AUTONOMY_CHANGED, refresh);
  }, [refresh]);

  const [busy, setBusy] = React.useState(false);
  const [cmd, setCmd] = React.useState("");
  const [actionsInput, setActionsInput] = React.useState("");
  const [costInput, setCostInput] = React.useState("");

  // Seed the editable caps from the loaded config (both are mandatory positive
  // values on the backend — there is no "unlimited").
  React.useEffect(() => {
    if (!cfg.data) return;
    setActionsInput(maxActions != null ? String(maxActions) : "");
    setCostInput(maxCostCents != null ? String(maxCostCents / 100) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const patch = async (
    body: Parameters<typeof api.setAutonomy>[0],
    msg?: string,
    opts?: { broadcast?: boolean },
  ) => {
    setBusy(true);
    try {
      await api.setAutonomy(body);
      if (msg) toast.success(msg);
      // A rung write is shared state: tell the rail and Status (the listener
      // above re-reads this panel too, so no direct refresh is needed).
      if (opts?.broadcast) window.dispatchEvent(new Event(AUTONOMY_CHANGED));
      else cfg.refresh();
    } catch (e) {
      toast.error(`Update failed: ${describeApiError(e)}`);
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

  const saveLimits = () => {
    if (actionsInput.trim() === "" || costInput.trim() === "") {
      toast.error("Enter both an actions and a cost cap");
      return;
    }
    const a = Math.round(Number(actionsInput));
    const c = Math.round(Number(costInput) * 100);
    // The backend rejects a zero action cap (must be > 0); guard here so the
    // save doesn't fail server-side with a raw error.
    if (!Number.isFinite(a) || a < 1) {
      toast.error("Actions / hour must be at least 1");
      return;
    }
    if (!Number.isFinite(c) || c < 0) {
      toast.error("Cost / day must be 0 or more");
      return;
    }
    patch({ max_actions_per_hour: a, max_cost_per_day_cents: c }, "Rate & cost caps updated");
  };

  return (
    <div className="space-y-5">
      <SectionTitle action={<RefreshButton onClick={cfg.refresh} />}>Policy</SectionTitle>
      <PanelFrame loading={cfg.loading} error={cfg.error} loaded={cfg.loaded} onRefresh={cfg.refresh}>
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
                    onClick={() =>
                      patch(rungToAutonomyPayload(p.id, a), `Autonomy set to ${p.label}`, {
                        broadcast: true,
                      })
                    }
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

          {/* Flags — read-only */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="block high-risk"
              value={bool("block_high_risk_commands") ? "On" : "Off"}
              tone={bool("block_high_risk_commands") ? "success" : "warning"}
            />
            <StatTile
              label="workspace only"
              value={bool("workspace_only") ? "On" : "Off"}
              tone={bool("workspace_only") ? "success" : "default"}
            />
          </div>

          {/* Rate & cost caps — editable */}
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Rate &amp; cost caps
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                actions / hour
                <Input
                  type="number"
                  min="1"
                  value={actionsInput}
                  onChange={(e) => setActionsInput(e.target.value)}
                  className="h-8 w-28"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                cost / day ($)
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  className="h-8 w-28"
                />
              </label>
              <Button size="sm" onClick={saveLimits} disabled={busy}>
                Save caps
              </Button>
            </div>
          </div>

          {/* Per-tool auto-approve — editable switches */}
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tool policy · auto-approve runs without asking
            </div>
            <Card className="divide-y divide-border">
              {hasWildcard(a) && (
                <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
                  Every tool prompts (Manual): the always-ask list is the wildcard.
                </div>
              )}
              {toolRows(a).map((tool) => {
                const auto = autoApprove.includes(tool);
                // The word is the runtime's decision for this tool in this
                // config (level, then always-ask, then auto-approve); the
                // switch is disabled when it would not change that.
                const outcome = toolOutcome(tool, a);
                const effective = autoApproveEffective(tool, a);
                return (
                  <div key={tool} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="font-mono text-[13px]">{tool}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
                      {outcome}
                    </span>
                    <button
                      type="button"
                      className={"switch" + (auto ? " on" : "")}
                      onClick={() => toggleTool(tool)}
                      disabled={busy || !effective}
                      role="switch"
                      aria-checked={auto}
                      aria-label={`Auto-approve ${tool}`}
                      title={outcome}
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
