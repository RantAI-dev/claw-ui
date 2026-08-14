"use client";

import * as React from "react";
import { History, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import type { CronJob, CronRun, CronSchedule } from "@/lib/types";
import { CRON_PRESETS, describeCron, validateCron } from "@/lib/cron";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
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
  const { data, loading, error, refresh, refreshing } = useAsync(() => api.cron(), []);
  const [jobKind, setJobKind] = React.useState<"agent" | "shell">("agent");
  const [prompt, setPrompt] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [expr, setExpr] = React.useState("0 9 * * *");
  const [tz, setTz] = React.useState("");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<CronSchedule["kind"]>("cron");
  const [everyMin, setEveryMin] = React.useState("60");
  const [at, setAt] = React.useState("");
  const [model, setModel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; name: string } | null>(null);
  // A run the security policy refused, with the full reason — the operator can
  // re-issue it explicitly.
  const [pendingApproval, setPendingApproval] = React.useState<{ id: string; reason: string } | null>(
    null,
  );
  const [deleting, setDeleting] = React.useState(false);
  const [editing, setEditing] = React.useState<CronJob | null>(null);
  const [history, setHistory] = React.useState<CronJob | null>(null);

  const schedulePreview = describeCron(expr);
  const cronError = kind === "cron" ? validateCron(expr) : null;

  // Live refresh: a job firing in the background surfaces without a manual click.
  // `useAsync` keeps stale content mounted during a refresh, so this doesn't flash.
  React.useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const buildSchedule = (): CronSchedule | null => {
    if (kind === "every") {
      const mins = Number(everyMin);
      if (!Number.isFinite(mins) || mins < 1) {
        toast.error("Interval must be at least 1 minute");
        return null;
      }
      return { kind: "every", every_ms: Math.round(mins) * 60000 };
    }
    if (kind === "at") {
      const ms = at ? Date.parse(at) : NaN;
      if (!Number.isFinite(ms)) {
        toast.error("Pick a valid date and time");
        return null;
      }
      return { kind: "at", at: new Date(ms).toISOString() };
    }
    if (!expr.trim()) return null;
    const err = validateCron(expr);
    if (err) {
      toast.error(err);
      return null;
    }
    return { kind: "cron", expr: expr.trim(), tz: tz.trim() || undefined };
  };

  const create = async () => {
    const primaryEmpty = jobKind === "shell" ? !command.trim() : !prompt.trim();
    if (primaryEmpty) return;
    const schedule = buildSchedule();
    if (!schedule) return;

    const payload =
      jobKind === "shell"
        ? {
            schedule,
            job_type: "shell" as const,
            command: command.trim(),
            name: name.trim() || undefined,
          }
        : {
            schedule,
            job_type: "agent" as const,
            prompt: prompt.trim(),
            name: name.trim() || undefined,
            model: model.trim() || undefined,
          };
    setBusy(true);
    try {
      await api.createCron(payload);
      toast.success("Cron job created");
      setPrompt("");
      setCommand("");
      setName("");
      setModel("");
      setAt("");
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
  const run = async (id: string, approved = false) => {
    const t = toast.loading("Running job…");
    try {
      const r = await api.runCron(id, approved);
      const output = r.output || "";
      if (r.success) {
        toast.success("Job ran", { id: t, description: output.slice(0, 200) });
        refresh();
        return;
      }
      // A refusal by the security policy is not a failed job, and the reason
      // used to be truncated at 200 characters — which is exactly where the
      // policy's explanation lives. `approved=true` existed on the API with no
      // caller, so a gated job was simply unrunnable from the console. It is a
      // privileged path, so it is never sent silently.
      if (!approved && /approval|not approved|denied|policy/i.test(output)) {
        setPendingApproval({ id, reason: output });
        toast.dismiss(t);
        return;
      }
      toast.error("Job failed", { id: t, description: output.slice(0, 200) });
      refresh();
    } catch (e) {
      toast.error(`Run failed: ${describeApiError(e)}`, { id: t });
    }
  };
  const del = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteCron(pendingDelete.id);
      toast.success("Job deleted");
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setDeleting(false);
    }
  };

  const createDisabled =
    busy ||
    (jobKind === "shell" ? !command.trim() : !prompt.trim()) ||
    (kind === "cron" && (!expr.trim() || cronError != null));

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} spinning={refreshing} />}>
        Scheduled jobs {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>

      <Card className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            New {jobKind} job
          </div>
          <Select
            value={jobKind}
            onChange={(e) => setJobKind(e.target.value as "agent" | "shell")}
            aria-label="Job kind"
            className="h-7 w-28 text-xs"
          >
            <option value="agent">Agent</option>
            <option value="shell">Shell</option>
          </Select>
        </div>

        {jobKind === "agent" ? (
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt the agent runs on schedule…"
            rows={2}
          />
        ) : (
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Shell command to run on schedule…"
            aria-label="Shell command"
            className="h-8 font-mono text-xs"
          />
        )}

        {kind === "cron" && (
          <div className="flex flex-wrap gap-1">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.expr}
                type="button"
                onClick={() => setExpr(p.expr)}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as CronSchedule["kind"])}
            aria-label="Schedule type"
            className="h-8 w-36 text-xs"
          >
            <option value="cron">Cron expression</option>
            <option value="every">Every N minutes</option>
            <option value="at">Once at…</option>
          </Select>

          {kind === "cron" && (
            <>
              <Input
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                placeholder="0 9 * * *"
                aria-label="Cron expression"
                className="h-8 w-32 font-mono text-xs"
              />
              <Input
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                placeholder="tz (e.g. UTC)"
                aria-label="Timezone (IANA)"
                className="h-8 w-40 text-xs"
              />
            </>
          )}
          {kind === "every" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min="1"
                value={everyMin}
                onChange={(e) => setEveryMin(e.target.value)}
                aria-label="Interval in minutes"
                className="h-8 w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          )}
          {kind === "at" && (
            <Input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              aria-label="Run once at"
              className="h-8 w-52 text-xs"
            />
          )}

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (optional)"
            className="h-8 min-w-[120px] flex-1 text-xs"
          />
          <Button size="sm" onClick={create} disabled={createDisabled}>
            <Plus className="size-4" /> Create
          </Button>
        </div>

        {jobKind === "agent" && (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model override (optional — defaults to the agent's model)"
            className="h-8 font-mono text-xs"
          />
        )}

        {kind === "cron" && expr.trim() && cronError && (
          <p className="text-[11px] text-destructive">{cronError}</p>
        )}
        {kind === "cron" && expr.trim() && !cronError && (
          <p className="text-[11px] text-muted-foreground">
            {schedulePreview ? `Runs ${schedulePreview}` : "Custom cron schedule"} ·{" "}
            {tz.trim() ? tz.trim() : "server time zone"}
          </p>
        )}
        {kind === "every" && everyMin.trim() && (
          <p className="text-[11px] text-muted-foreground">
            Runs every {everyMin} minute{everyMin === "1" ? "" : "s"}
          </p>
        )}
      </Card>

      <PanelFrame loading={loading} error={error} empty={data?.count === 0} onRefresh={refresh}>
        <Card className="divide-y divide-border">
          {data?.jobs.map((j) => (
            <div
              key={j.id}
              className={cn("flex items-center gap-1.5 px-3 py-2.5", !j.enabled && "opacity-60")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{j.name || j.id.slice(0, 8)}</span>
                  <Badge variant="secondary" className="text-[10px]">{j.job_type}</Badge>
                  {!j.enabled && <Badge variant="warning" className="text-[10px]">paused</Badge>}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {j.expression || j.schedule.kind} · next {fmtWhen(j.next_run)}
                  {j.last_status ? ` · last: ${j.last_status} (${fmtWhen(j.last_run)})` : ""}
                </div>
                {(j.prompt || j.command) && (
                  <div className="truncate text-[11px] text-muted-foreground/80">
                    {j.job_type === "shell" ? j.command : j.prompt}
                  </div>
                )}
              </div>
              <IconButton
                onClick={() => toggle(j.id, !j.enabled)}
                title={j.enabled ? "Disable" : "Enable"}
                aria-label={j.enabled ? "Disable job" : "Enable job"}
                className={cn(j.enabled && "text-success hover:bg-success/10 hover:text-success")}
              >
                <Power className="size-3.5" />
              </IconButton>
              <IconButton onClick={() => run(j.id)} title="Run now" aria-label="Run job now">
                <Play className="size-3.5" />
              </IconButton>
              <IconButton
                onClick={() => setHistory(j)}
                title="Run history"
                aria-label={`Run history for ${j.name || j.id.slice(0, 8)}`}
              >
                <History className="size-3.5" />
              </IconButton>
              <IconButton
                onClick={() => setEditing(j)}
                title="Edit"
                aria-label={`Edit job ${j.name || j.id.slice(0, 8)}`}
              >
                <Pencil className="size-3.5" />
              </IconButton>
              <IconButton
                onClick={() => setPendingDelete({ id: j.id, name: j.name || j.id.slice(0, 8) })}
                title="Delete"
                aria-label={`Delete job ${j.name || j.id.slice(0, 8)}`}
                className="hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          ))}
        </Card>
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">
          Next-run times are shown in your local time zone; cron expressions run in the server&apos;s
          (or a job&apos;s chosen time zone).
        </p>
      </PanelFrame>

      <EditCronModal job={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <CronRunsModal job={history} onClose={() => setHistory(null)} />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete scheduled job?"
        description={
          pendingDelete
            ? `“${pendingDelete.name}” and its prompt will be removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete job"
        busy={deleting}
        onConfirm={del}
      />
      <ConfirmModal
        open={!!pendingApproval}
        onClose={() => setPendingApproval(null)}
        title="This job needs approval to run"
        description={pendingApproval?.reason}
        confirmLabel="Run with approval"
        onConfirm={async () => {
          const p = pendingApproval;
          setPendingApproval(null);
          if (p) await run(p.id, true);
        }}
      />
    </div>
  );
}

/** Edit an existing job's name, prompt/command, model, and (for cron jobs) the
 *  expression + timezone. Only changed fields are sent. */
function EditCronModal({
  job,
  onClose,
  onSaved,
}: {
  job: CronJob | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [expr, setExpr] = React.useState("");
  const [tz, setTz] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!job) return;
    setName(job.name ?? "");
    setPrompt(job.prompt ?? "");
    setCommand(job.command ?? "");
    setModel(job.model ?? "");
    setExpr(job.schedule.kind === "cron" ? job.schedule.expr : "");
    setTz(job.schedule.kind === "cron" ? job.schedule.tz ?? "" : "");
  }, [job]);

  if (!job) return null;
  const isCron = job.schedule.kind === "cron";
  const isShell = job.job_type === "shell";
  const cronError = isCron ? validateCron(expr) : null;

  const save = async () => {
    const body: Parameters<typeof api.updateCron>[1] = {};
    if (name !== (job.name ?? "")) body.name = name;
    if (isShell) {
      if (command !== (job.command ?? "")) body.command = command;
    } else {
      if (prompt !== (job.prompt ?? "")) body.prompt = prompt;
      if (model !== (job.model ?? "")) body.model = model;
    }
    if (isCron) {
      const origExpr = job.schedule.kind === "cron" ? job.schedule.expr : "";
      const origTz = job.schedule.kind === "cron" ? job.schedule.tz ?? "" : "";
      if (expr !== origExpr || tz !== origTz) {
        const err = validateCron(expr);
        if (err) {
          toast.error(err);
          return;
        }
        body.schedule = { kind: "cron", expr: expr.trim(), tz: tz.trim() || undefined };
      }
    }
    setBusy(true);
    try {
      await api.updateCron(job.id, body);
      toast.success("Job updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(`Update failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title="Edit scheduled job"
      description={job.name || job.id.slice(0, 8)}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || (isCron && cronError != null)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
          className="h-8 text-xs"
          aria-label="Name"
        />
        {isShell ? (
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="shell command"
            className="h-8 font-mono text-xs"
            aria-label="Shell command"
          />
        ) : (
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="prompt"
            rows={2}
            aria-label="Prompt"
          />
        )}
        {!isShell && (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model override (optional)"
            className="h-8 font-mono text-xs"
            aria-label="Model override"
          />
        )}
        {isCron && (
          <div className="flex flex-wrap gap-2">
            <Input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="0 9 * * *"
              className="h-8 w-36 font-mono text-xs"
              aria-label="Cron expression"
            />
            <Input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="tz (e.g. UTC)"
              className="h-8 w-40 text-xs"
              aria-label="Timezone"
            />
          </div>
        )}
        {isCron && cronError && <p className="text-[11px] text-destructive">{cronError}</p>}
      </div>
    </Modal>
  );
}

/** Durable run history for a job (replaces the ephemeral run toast). */
function CronRunsModal({ job, onClose }: { job: CronJob | null; onClose: () => void }) {
  const [runs, setRuns] = React.useState<CronRun[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!job) {
      setRuns(null);
      setError(null);
      return;
    }
    let alive = true;
    api
      .cronRuns(job.id)
      .then((r) => alive && setRuns(r.runs))
      .catch((e) => alive && setError(describeApiError(e)));
    return () => {
      alive = false;
    };
  }, [job]);

  if (!job) return null;

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title="Run history"
      description={job.name || job.id.slice(0, 8)}
    >
      <div className="max-h-[50vh] space-y-2 overflow-y-auto">
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        {!error && runs == null && <p className="text-[11px] text-muted-foreground">Loading…</p>}
        {runs != null && runs.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No runs yet.</p>
        )}
        {runs?.map((r) => (
          <details key={r.id} className="rounded border border-border px-2 py-1.5">
            <summary className="flex cursor-pointer items-center gap-2 text-[11px]">
              <Badge variant={r.status === "ok" ? "secondary" : "warning"} className="text-[10px]">
                {r.status}
              </Badge>
              <span className="text-muted-foreground">{fmtWhen(r.started_at)}</span>
              <span className="text-muted-foreground/70">
                {r.duration_ms != null ? `${r.duration_ms}ms` : ""}
              </span>
            </summary>
            {r.output && (
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[10px]">
                {r.output}
              </pre>
            )}
          </details>
        ))}
      </div>
    </Modal>
  );
}
