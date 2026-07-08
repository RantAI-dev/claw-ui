"use client";

import * as React from "react";
import { Play, Plus, Power, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";

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
