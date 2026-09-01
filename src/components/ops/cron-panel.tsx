"use client";

import * as React from "react";
import { AlertTriangle, CalendarClock, History, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { api, ApiError, describeApiError } from "@/lib/api";
import type { CronJob, CronRun, CronSchedule } from "@/lib/types";
import {
  CRON_PRESETS,
  PAST_ONE_OFF,
  type ScheduleDraft,
  browserTimeZone,
  buildSchedule,
  createWarningReason,
  firstLine,
  fmtWhen,
  formatSchedule,
  isPastOneOffRefusal,
  jobState,
  previewSchedule,
  refusalReason,
  sameSchedule,
  scheduleDraftEmpty,
  scheduleDraftError,
  statusTone,
  statusWord,
  toLocalInput,
  whenMs,
} from "@/lib/cron";
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
import { EmptyState, IconButton, PanelFrame, RefreshButton, SectionTitle } from "./shared";

const POLL_MS = 15000;
const CRON_OFF = "Cron is off (cron.enabled=false)";

function jobLabel(j: Pick<CronJob, "id" | "name">): string {
  return j.name || j.id.slice(0, 8);
}

/** A feature-switch notice over the list (the gateway reports both switches
 *  with every list; the CLI prints the same warning on `cron list`). */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-warning/60 bg-warning/10 px-3 py-2 text-xs"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** The schedule fields of a draft, by kind; shared by the create card and Edit. */
function ScheduleFields({
  draft,
  onChange,
  now,
  idPrefix,
}: {
  draft: ScheduleDraft;
  onChange: (next: Partial<ScheduleDraft>) => void;
  now: number;
  idPrefix: string;
}) {
  return (
    <>
      {draft.kind === "cron" && (
        <>
          <Input
            value={draft.expr}
            onChange={(e) => onChange({ expr: e.target.value })}
            placeholder="0 9 * * *"
            aria-label="Cron expression"
            className="h-8 w-32 font-mono text-xs"
          />
          <Input
            value={draft.tz}
            onChange={(e) => onChange({ tz: e.target.value })}
            placeholder="zone (blank = UTC)"
            aria-label="Timezone (IANA)"
            className="h-8 w-40 text-xs"
          />
        </>
      )}
      {draft.kind === "every" && (
        <div className="flex items-center gap-1.5">
          <Input
            id={`${idPrefix}-every`}
            type="number"
            min="1"
            step="1"
            value={draft.everyMin}
            onChange={(e) => onChange({ everyMin: e.target.value })}
            aria-label="Interval in minutes"
            className="h-8 w-20 text-xs"
          />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
      )}
      {draft.kind === "at" && (
        <Input
          type="datetime-local"
          min={toLocalInput(now)}
          value={draft.at}
          onChange={(e) => onChange({ at: e.target.value })}
          aria-label="Run once at"
          className="h-8 w-52 text-xs"
        />
      )}
    </>
  );
}

/** The one line under a draft: the reason it does not build yet (red once the
 *  field has something in it), or what it will do. */
function DraftLine({ draft, now }: { draft: ScheduleDraft; now: number }) {
  const err = scheduleDraftError(draft, now);
  if (err) {
    return (
      <p className={cn("text-[11px]", scheduleDraftEmpty(draft) ? "text-muted-foreground" : "text-destructive")}>
        {err}
      </p>
    );
  }
  return <p className="text-[11px] text-muted-foreground">{previewSchedule(draft)}</p>;
}

/** What the row says beside the schedule: hidden API fields made visible. */
function scheduleExtras(j: CronJob): string {
  let s = "";
  if (j.schedule.kind === "at" && j.delete_after_run) s += ", then removed";
  if (j.session_target === "main") s += " · main session";
  if (j.delivery && j.delivery.mode && j.delivery.mode !== "none") {
    s += ` · announces to ${j.delivery.channel ?? j.delivery.mode}${j.delivery.to ? ` ${j.delivery.to}` : ""}`;
  }
  return s;
}

export function CronPanel() {
  const { data, loading, error, refresh, refreshing, loaded } = useAsync(() => api.cron(), []);
  const [jobKind, setJobKind] = React.useState<"agent" | "shell">("agent");
  const [prompt, setPrompt] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [name, setName] = React.useState("");
  const [model, setModel] = React.useState("");
  // The zone the operator sees is the honest default: a blank zone means UTC
  // on the gateway, not the server's clock.
  const [draft, setDraft] = React.useState<ScheduleDraft>(() => ({
    kind: "cron",
    expr: "0 9 * * *",
    tz: browserTimeZone(),
    everyMin: "60",
    at: "",
  }));
  const [busy, setBusy] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<CronJob | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [editing, setEditing] = React.useState<CronJob | null>(null);
  const [history, setHistory] = React.useState<CronJob | null>(null);
  // Re-read with every poll so an "overdue" row flips without a reload.
  const [now, setNow] = React.useState(() => Date.now());

  const patchDraft = (next: Partial<ScheduleDraft>) => setDraft((d) => ({ ...d, ...next }));

  // Live refresh: a job firing in the background surfaces without a manual click.
  // `useAsync` keeps stale content mounted during a refresh, so this doesn't flash.
  React.useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Absent on an older gateway → unknown, never "off".
  const cronOff = data?.cron_enabled === false;
  const schedulerOff = data?.scheduler_enabled === false;

  const primaryEmpty = jobKind === "shell" ? !command.trim() : !prompt.trim();
  const draftError = scheduleDraftError(draft, now);

  const create = async () => {
    if (primaryEmpty || draftError) return;
    const schedule = buildSchedule(draft);
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
      const created = await api.createCron(payload);
      // The API creates the job either way, but attaches `warning` when a shell
      // job's command would be refused by the scheduler's fire-time gate. The
      // console cannot force-run it (the approval is inert at fire time), so it
      // shows the reason and drops the API's force-run advice.
      if (created.warning) {
        toast.warning("Created, but it will not run on its schedule", {
          description: `${createWarningReason(created.warning)}. Use an allowlisted low-risk command.`,
        });
      } else {
        toast.success("Job created");
      }
      setPrompt("");
      setCommand("");
      setName("");
      setModel("");
      patchDraft({ at: "" });
      refresh();
    } catch (e) {
      toast.error(`Create failed: ${describeApiError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (j: CronJob, enabled: boolean) => {
    try {
      await api.updateCron(j.id, { enabled });
      toast.success(`${enabled ? "Resumed" : "Paused"} ${jobLabel(j)}`);
      refresh();
    } catch (e) {
      const msg = describeApiError(e);
      toast.error(isPastOneOffRefusal(msg) ? PAST_ONE_OFF : msg);
    }
  };
  const run = async (j: CronJob) => {
    const label = jobLabel(j);
    const t = toast.loading(`Running ${label}…`);
    try {
      const r = await api.runCron(j.id);
      const output = r.output || "";
      if (r.success) {
        // The receipt; the full output is in Run history.
        toast.success(`Ran ${label}`, { id: t, description: firstLine(output) });
        refresh();
        return;
      }
      // A policy refusal is not a failed job: it never ran, and the scheduled
      // path applies the same gate, so the job will not run on its own either.
      // There is no approval to offer: the gateway ignores one at fire time.
      const reason = refusalReason(output);
      if (reason) {
        toast.error("Blocked by policy", {
          id: t,
          description: `${reason}. It will not run on its schedule either.`,
        });
      } else {
        toast.error(`${label} failed`, { id: t, description: firstLine(output) });
      }
      refresh();
    } catch (e) {
      // The handler's own gate answers 400 with the policy sentence before
      // anything runs; every other failure is the request itself.
      const refused = e instanceof ApiError && e.status === 400;
      toast.error(refused ? "Run refused" : "Run failed", { id: t, description: describeApiError(e) });
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
      toast.error(`Delete failed: ${describeApiError(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const createDisabled = busy || cronOff || primaryEmpty || draftError != null;

  return (
    <div className="space-y-4">
      <SectionTitle action={<RefreshButton onClick={refresh} spinning={refreshing} />}>
        Scheduled jobs {data && <span className="text-muted-foreground">· {data.count}</span>}
      </SectionTitle>

      {schedulerOff && (
        <Notice>
          The scheduler loop is off (scheduler.enabled=false): these jobs will not fire until it
          is re-enabled.
        </Notice>
      )}
      {cronOff && <Notice>Cron is off (cron.enabled=false): jobs are read-only here.</Notice>}

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

        {draft.kind === "cron" && (
          <div className="flex flex-wrap gap-1">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.expr}
                type="button"
                onClick={() => patchDraft({ expr: p.expr })}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={draft.kind}
            onChange={(e) => patchDraft({ kind: e.target.value as CronSchedule["kind"] })}
            aria-label="Schedule type"
            className="h-8 w-36 text-xs"
          >
            <option value="cron">Cron expression</option>
            <option value="every">Every N minutes</option>
            <option value="at">Once at…</option>
          </Select>

          <ScheduleFields draft={draft} onChange={patchDraft} now={now} idPrefix="new" />

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (optional)"
            className="h-8 min-w-[120px] flex-1 text-xs"
          />
          <Button
            size="sm"
            onClick={create}
            disabled={createDisabled}
            title={cronOff ? CRON_OFF : undefined}
          >
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

        <DraftLine draft={draft} now={now} />
      </Card>

      <PanelFrame
        loading={loading}
        error={error}
        loaded={loaded}
        loadingLabel="Loading jobs…"
        onRefresh={refresh}
      >
        {data && data.count === 0 ? (
          <EmptyState
            icon={<CalendarClock className="size-6" />}
            title="No scheduled jobs yet."
            hint="Create one above. Jobs fire from the RantaiClaw daemon while it is running."
          />
        ) : (
          <>
            <Card className="divide-y divide-border">
              {data?.jobs.map((j) => {
                const label = jobLabel(j);
                const state = jobState(j, now);
                const pastOneOff = state === "ran-once" || state === "missed";
                const when =
                  state === "scheduled"
                    ? `next ${fmtWhen(j.next_run)}`
                    : state === "overdue"
                      ? `due since ${fmtWhen(j.next_run)}`
                      : state === "paused"
                        ? "paused"
                        : state === "ran-once"
                          ? `ran once at ${fmtWhen(j.last_run)}`
                          : `missed at ${fmtWhen(j.schedule.kind === "at" ? j.schedule.at : j.next_run)}`;
                return (
                  <div key={j.id} className="flex items-center gap-1.5 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{label}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {j.job_type}
                        </Badge>
                        {state === "overdue" && (
                          <Badge variant="warning" className="text-[10px]">
                            overdue
                          </Badge>
                        )}
                        {state === "paused" && (
                          <Badge variant="warning" className="text-[10px]">
                            paused
                          </Badge>
                        )}
                        {state === "ran-once" && (
                          <Badge variant="secondary" className="text-[10px]">
                            ran once
                          </Badge>
                        )}
                        {state === "missed" && (
                          <Badge variant="warning" className="text-[10px]">
                            missed
                          </Badge>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {formatSchedule(j.schedule)}
                        {scheduleExtras(j)} · {when}
                        {j.last_status
                          ? ` · last ${statusWord(j.last_status)} ${fmtWhen(j.last_run)}`
                          : ""}
                      </div>
                      {(j.prompt || j.command) && (
                        <div className="truncate text-[11px] text-muted-foreground/80">
                          {j.job_type === "shell" ? j.command : j.prompt}
                        </div>
                      )}
                    </div>
                    <IconButton
                      onClick={() => toggle(j, !j.enabled)}
                      disabled={cronOff || pastOneOff}
                      title={
                        cronOff ? CRON_OFF : pastOneOff ? PAST_ONE_OFF : j.enabled ? "Disable" : "Enable"
                      }
                      aria-label={j.enabled ? "Disable job" : "Enable job"}
                      className={cn(j.enabled && "text-success hover:bg-success/10 hover:text-success")}
                    >
                      <Power className="size-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => run(j)}
                      disabled={cronOff}
                      title={cronOff ? CRON_OFF : "Run now"}
                      aria-label="Run job now"
                    >
                      <Play className="size-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => setHistory(j)}
                      title="Run history"
                      aria-label={`Run history for ${label}`}
                    >
                      <History className="size-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => setEditing(j)}
                      disabled={cronOff}
                      title={cronOff ? CRON_OFF : "Edit"}
                      aria-label={`Edit job ${label}`}
                    >
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => setPendingDelete(j)}
                      disabled={cronOff}
                      title={cronOff ? CRON_OFF : "Delete"}
                      aria-label={`Delete job ${label}`}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                );
              })}
            </Card>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">
              Jobs fire from the RantaiClaw daemon (<code>rantaiclaw daemon</code>), not from this
              console. Times are shown in your local zone; a cron expression without a zone runs in
              UTC.
            </p>
          </>
        )}
      </PanelFrame>

      <EditCronModal
        job={editing}
        now={now}
        onClose={() => setEditing(null)}
        onSaved={refresh}
        disabledReason={cronOff ? CRON_OFF : null}
      />
      <CronRunsModal job={history} onClose={() => setHistory(null)} />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete scheduled job?"
        description={
          pendingDelete
            ? `“${jobLabel(pendingDelete)}” and its ${pendingDelete.job_type === "shell" ? "command" : "prompt"} will be removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete job"
        busy={deleting}
        onConfirm={del}
      />
    </div>
  );
}

function draftFromJob(job: CronJob): ScheduleDraft {
  const s = job.schedule;
  return {
    kind: s.kind,
    expr: s.kind === "cron" ? s.expr : "",
    tz: s.kind === "cron" ? (s.tz ?? "") : "",
    everyMin: s.kind === "every" ? String(s.every_ms / 60_000) : "60",
    at: s.kind === "at" ? toLocalInput(s.at) : "",
  };
}

/** Edit an existing job's name, prompt/command, model and its schedule (the
 *  expression + zone, the interval, or the one-off time). Only changed fields
 *  are sent. */
function EditCronModal({
  job,
  now,
  onClose,
  onSaved,
  disabledReason,
}: {
  job: CronJob | null;
  now: number;
  onClose: () => void;
  onSaved: () => void;
  /** Why Save is unavailable (cron switched off), or null. */
  disabledReason: string | null;
}) {
  const [name, setName] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [draft, setDraft] = React.useState<ScheduleDraft>({
    kind: "cron",
    expr: "",
    tz: "",
    everyMin: "60",
    at: "",
  });
  const [seed, setSeed] = React.useState<ScheduleDraft | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!job) return;
    setName(job.name ?? "");
    setPrompt(job.prompt ?? "");
    setCommand(job.command ?? "");
    setModel(job.model ?? "");
    const d = draftFromJob(job);
    setDraft(d);
    setSeed(d);
  }, [job]);

  if (!job) return null;
  const isShell = job.job_type === "shell";
  const patchDraft = (next: Partial<ScheduleDraft>) => setDraft((d) => ({ ...d, ...next }));
  // An untouched schedule is never re-validated (a past one-off may still be
  // renamed); a touched one must build.
  const untouched =
    seed != null &&
    draft.expr === seed.expr &&
    draft.tz === seed.tz &&
    draft.everyMin === seed.everyMin &&
    draft.at === seed.at;
  const draftError = untouched ? null : scheduleDraftError(draft, now);
  const pastOneOff = job.schedule.kind === "at" && (whenMs(job.schedule.at) ?? Infinity) <= now;

  const save = async () => {
    const body: Parameters<typeof api.updateCron>[1] = {};
    if (name !== (job.name ?? "")) body.name = name;
    if (isShell) {
      if (command !== (job.command ?? "")) body.command = command;
    } else {
      if (prompt !== (job.prompt ?? "")) body.prompt = prompt;
      if (model !== (job.model ?? "")) body.model = model;
    }
    if (!untouched && !draftError) {
      const built = buildSchedule(draft);
      if (!sameSchedule(built, job.schedule)) body.schedule = built;
    }
    setBusy(true);
    try {
      await api.updateCron(job.id, body);
      toast.success("Job updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(`Update failed: ${describeApiError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title="Edit scheduled job"
      description={jobLabel(job)}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={busy || disabledReason != null || draftError != null}
            title={disabledReason ?? undefined}
          >
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
        <div className="flex flex-wrap items-center gap-2">
          {draft.kind === "every" && (
            <label htmlFor="edit-every" className="text-xs text-muted-foreground">
              Interval (minutes)
            </label>
          )}
          <ScheduleFields draft={draft} onChange={patchDraft} now={now} idPrefix="edit" />
        </div>
        {pastOneOff && untouched && (
          <p className="text-[11px] text-muted-foreground">
            This one-off&apos;s time has passed. Give it a new time to run it again.
          </p>
        )}
        {!untouched && <DraftLine draft={draft} now={now} />}
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
      description={jobLabel(job)}
    >
      <div className="max-h-[50vh] space-y-2 overflow-y-auto">
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        {!error && runs == null && (
          <p className="text-[11px] text-muted-foreground">Loading runs…</p>
        )}
        {runs != null && runs.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No runs yet. Run now records the first.</p>
        )}
        {runs?.map((r) => (
          <details key={r.id} className="rounded border border-border px-2 py-1.5">
            <summary className="flex cursor-pointer items-center gap-2 text-[11px]">
              <Badge variant={statusTone(r.status)} className="text-[10px]">
                {statusWord(r.status)}
              </Badge>
              <span className="text-muted-foreground">{fmtWhen(r.started_at)}</span>
              {(r.attempt ?? 1) > 1 && (
                <span className="text-muted-foreground">attempt {r.attempt}</span>
              )}
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
