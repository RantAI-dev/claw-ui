"use client";

import * as React from "react";
import { CalendarClock, History, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { api, ApiError, describeApiError } from "@/lib/api";
import type { CronJob, CronRun, CronSchedule } from "@/lib/types";
import {
  CRON_PRESETS,
  type CronVerdict,
  PAST_ONE_OFF,
  type ScheduleDraft,
  browserTimeZone,
  buildSchedule,
  createWarningReason,
  cronVerdict,
  firstLine,
  fmtWhen,
  formatSchedule,
  isPastOneOffRefusal,
  jobLabel,
  jobState,
  previewSchedule,
  refusalReason,
  sameSchedule,
  scheduleDraftEmpty,
  scheduleDraftError,
  statusDotColor,
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
import { EmptyState, IconButton, PanelFrame, RefreshButton, SectionTitle, ShowMoreRow, useListWindow } from "./shared";

const POLL_MS = 15000;
const CRON_OFF = "Cron is off (cron.enabled=false)";

/**
 * The page opens with the answer: is the schedule running, and what fires
 * next. Not a card; the whitespace around the band marks the focal point, as
 * on Status, Channels and Providers.
 */
function CronBand({ verdict }: { verdict: CronVerdict }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{
            background: verdict.tone === "ok" ? "var(--accent-green)" : "var(--accent-orange)",
          }}
        />
        <h2 className="text-xl font-medium tracking-tight">{verdict.headline}</h2>
      </div>
      {verdict.meta.length > 0 && (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">
          {verdict.meta.map((m, i) => (
            <React.Fragment key={m}>
              {i > 0 && <span aria-hidden> · </span>}
              <span>{m}</span>
            </React.Fragment>
          ))}
        </p>
      )}
      {verdict.detail && <p className="mt-1.5 text-xs text-muted-foreground">{verdict.detail}</p>}
    </div>
  );
}

/** The schedule fields of a draft, by kind: labelled, stacked for the narrow
 *  column; shared by the builder and Edit. */
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
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-expr`} className="text-xs text-muted-foreground">
              Cron expression
            </label>
            <Input
              id={`${idPrefix}-expr`}
              value={draft.expr}
              onChange={(e) => onChange({ expr: e.target.value })}
              placeholder="0 9 * * *"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-tz`} className="text-xs text-muted-foreground">
              Time zone (IANA)
            </label>
            <Input
              id={`${idPrefix}-tz`}
              value={draft.tz}
              onChange={(e) => onChange({ tz: e.target.value })}
              placeholder="blank = UTC"
            />
          </div>
        </div>
      )}
      {draft.kind === "every" && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-every`} className="text-xs text-muted-foreground">
            Interval (minutes)
          </label>
          <Input
            id={`${idPrefix}-every`}
            type="number"
            min="1"
            step="1"
            value={draft.everyMin}
            onChange={(e) => onChange({ everyMin: e.target.value })}
            className="w-32"
          />
        </div>
      )}
      {draft.kind === "at" && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-at`} className="text-xs text-muted-foreground">
            Run once at
          </label>
          <Input
            id={`${idPrefix}-at`}
            type="datetime-local"
            min={toLocalInput(now)}
            value={draft.at}
            onChange={(e) => onChange({ at: e.target.value })}
            className="w-56"
          />
        </div>
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
      <p className={cn("text-xs", scheduleDraftEmpty(draft) ? "text-muted-foreground" : "text-destructive")}>
        {err}
      </p>
    );
  }
  return <p className="text-xs text-muted-foreground">{previewSchedule(draft)}</p>;
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

const STATE_BADGE: Partial<Record<ReturnType<typeof jobState>, { word: string; variant: "warning" | "secondary" }>> = {
  overdue: { word: "overdue", variant: "warning" },
  paused: { word: "paused", variant: "warning" },
  "ran-once": { word: "ran once", variant: "secondary" },
  missed: { word: "missed", variant: "warning" },
};

export function CronPanel() {
  const { data, loading, error, refresh, refreshing, loaded } = useAsync(() => api.cron(), []);
  // The jobs list can run long; render a windowful and extend on demand.
  const jobsWindow = useListWindow(data);
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
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PanelFrame
            loading={loading}
            error={error}
            loaded={loaded}
            loadingLabel="Loading jobs…"
            onRefresh={refresh}
          >
            {data && <CronBand verdict={cronVerdict(data, now)} />}
          </PanelFrame>
        </div>
        <RefreshButton onClick={refresh} spinning={refreshing} />
      </div>

      {/* The 7/5 split gives the list the width to state its facts; the
          builder composes in the narrow column. On phones the list (the
          answer) comes first. */}
      {data && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionTitle>
              Scheduled jobs <span className="text-muted-foreground">· {data.count}</span>
            </SectionTitle>
            {data.count === 0 ? (
              <EmptyState
                icon={<CalendarClock className="size-6" />}
                title="No scheduled jobs yet."
                hint="Create one with the New job form."
              />
            ) : (
              <>
                <Card className="divide-y divide-border">
                  {data.jobs.slice(0, jobsWindow.shown).map((j) => {
                    const label = jobLabel(j);
                    const state = jobState(j, now);
                    const pastOneOff = state === "ran-once" || state === "missed";
                    const spent = state !== "scheduled" && state !== "overdue";
                    const badge = STATE_BADGE[state];
                    const when =
                      state === "scheduled"
                        ? j.schedule.kind === "at"
                          ? null // "once at <time>" already is the when
                          : `next ${fmtWhen(j.next_run)}`
                        : state === "overdue"
                          ? `due since ${fmtWhen(j.next_run)}`
                          : state === "ran-once"
                            ? `ran once at ${fmtWhen(j.last_run)}`
                            : state === "missed"
                              ? `missed at ${fmtWhen(j.schedule.kind === "at" ? j.schedule.at : j.next_run)}`
                              : null; // paused: the badge says it; the line keeps the schedule
                    return (
                      <div
                        key={j.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1 basis-48">
                          <div className="flex items-center gap-2">
                            <span
                              title={label}
                              className={cn(
                                "truncate text-sm font-medium",
                                spent && "text-muted-foreground",
                              )}
                            >
                              {label}
                            </span>
                            <Badge variant="secondary" className="text-[11px]">
                              {j.job_type}
                            </Badge>
                            {badge && (
                              <Badge variant={badge.variant} className="text-[11px]">
                                {badge.word}
                              </Badge>
                            )}
                          </div>
                          {/* The row's facts wrap rather than truncate: the next
                              time and the last outcome are what the row is for. */}
                          <div className="mt-0.5 break-words text-xs text-muted-foreground">
                            {when && (
                              <>
                                {when}
                                <span aria-hidden> · </span>
                              </>
                            )}
                            <span className="font-mono">{formatSchedule(j.schedule)}</span>
                            {scheduleExtras(j)}
                            {j.last_status && (
                              <>
                                <span aria-hidden> · </span>
                                <span
                                  aria-hidden
                                  className="mr-1 inline-block size-1.5 rounded-full align-middle"
                                  style={{ background: statusDotColor(j.last_status) }}
                                />
                                {`last ${statusWord(j.last_status)} ${fmtWhen(j.last_run)}`}
                              </>
                            )}
                          </div>
                          {(j.prompt || j.command) && (
                            <div
                              className={cn(
                                "mt-0.5 break-words text-xs text-muted-foreground/80 sm:truncate",
                                j.job_type === "shell" && "font-mono",
                              )}
                            >
                              {j.job_type === "shell" ? j.command : j.prompt}
                            </div>
                          )}
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-0.5 max-sm:basis-full max-sm:justify-end">
                          <IconButton
                            onClick={() => toggle(j, !j.enabled)}
                            disabled={cronOff || pastOneOff}
                            title={
                              cronOff
                                ? CRON_OFF
                                : pastOneOff
                                  ? PAST_ONE_OFF
                                  : j.enabled
                                    ? "Pause"
                                    : "Resume"
                            }
                            aria-label={`${j.enabled ? "Pause" : "Resume"} ${label}`}
                            className={cn(
                              j.enabled && "text-success hover:bg-success/10 hover:text-success",
                            )}
                          >
                            <Power className="size-3.5" />
                          </IconButton>
                          <IconButton
                            onClick={() => run(j)}
                            disabled={cronOff}
                            title={cronOff ? CRON_OFF : "Run now"}
                            aria-label={`Run ${label} now`}
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
                            aria-label={`Edit ${label}`}
                          >
                            <Pencil className="size-3.5" />
                          </IconButton>
                          {/* The one destructive action sits past a hairline. */}
                          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
                          <IconButton
                            onClick={() => setPendingDelete(j)}
                            disabled={cronOff}
                            title={cronOff ? CRON_OFF : "Delete"}
                            aria-label={`Delete ${label}`}
                            className="hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </div>
                      </div>
                    );
                  })}
                  <ShowMoreRow
                    remaining={data.jobs.length - jobsWindow.shown}
                    onClick={jobsWindow.showMore}
                  />
                </Card>
                <p className="mt-2 text-xs text-muted-foreground">
                  Jobs fire from the RantaiClaw daemon (<code>rantaiclaw daemon</code>), not from
                  this console. Times are shown in your local zone; a cron expression without a
                  zone runs in UTC.
                </p>
              </>
            )}
          </div>

          <div className="lg:col-span-5">
            <SectionTitle>New job</SectionTitle>
            <Card className="p-0">
              {/* The builder's two groups are its two questions: what runs, and
                  when. The footer carries only the name and the one action. */}
              <div role="group" aria-labelledby="cron-what-group" className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p id="cron-what-group" className="eyebrow">
                    What runs
                  </p>
                  <Select
                    value={jobKind}
                    onChange={(e) => setJobKind(e.target.value as "agent" | "shell")}
                    aria-label="Job kind"
                    className="h-8 w-28 text-xs pointer-coarse:min-h-10"
                  >
                    <option value="agent">Agent</option>
                    <option value="shell">Shell</option>
                  </Select>
                </div>
                {jobKind === "agent" ? (
                  <div className="space-y-1">
                    <label htmlFor="cron-new-prompt" className="text-xs text-muted-foreground">
                      Prompt
                    </label>
                    <Textarea
                      id="cron-new-prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="What the agent does each run…"
                      rows={2}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label htmlFor="cron-new-command" className="text-xs text-muted-foreground">
                      Shell command
                    </label>
                    <Input
                      id="cron-new-command"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="echo hello"
                      className="font-mono"
                    />
                  </div>
                )}
                {jobKind === "agent" && (
                  <div className="space-y-1">
                    <label htmlFor="cron-new-model" className="text-xs text-muted-foreground">
                      Model override
                    </label>
                    <Input
                      id="cron-new-model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="Optional; defaults to the agent's model"
                      className="font-mono"
                    />
                  </div>
                )}
              </div>

              <div
                role="group"
                aria-labelledby="cron-when-group"
                className="space-y-3 border-t border-border/60 p-4"
              >
                <p id="cron-when-group" className="eyebrow">
                  Schedule
                </p>
                <div className="space-y-1">
                  <label htmlFor="cron-new-kind" className="text-xs text-muted-foreground">
                    Repeats
                  </label>
                  <Select
                    id="cron-new-kind"
                    value={draft.kind}
                    onChange={(e) => patchDraft({ kind: e.target.value as CronSchedule["kind"] })}
                    className="w-full"
                  >
                    <option value="cron">On a cron expression</option>
                    <option value="every">Every N minutes</option>
                    <option value="at">Once, at a time</option>
                  </Select>
                </div>
                <ScheduleFields draft={draft} onChange={patchDraft} now={now} idPrefix="cron-new" />
                {draft.kind === "cron" && (
                  <div className="flex flex-wrap gap-1.5">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.expr}
                        type="button"
                        onClick={() => patchDraft({ expr: p.expr })}
                        className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10 pointer-coarse:px-3"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <DraftLine draft={draft} now={now} />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 p-4">
                <label htmlFor="cron-new-name" className="text-xs text-muted-foreground">
                  Name
                </label>
                <Input
                  id="cron-new-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional"
                  className="min-w-[120px] flex-1"
                />
                <Button onClick={create} disabled={createDisabled} title={cronOff ? CRON_OFF : undefined}>
                  <Plus className="size-4" /> Create
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

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
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="cron-edit-name" className="text-xs text-muted-foreground">
            Name
          </label>
          <Input
            id="cron-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            data-autofocus
          />
        </div>
        {isShell ? (
          <div className="space-y-1">
            <label htmlFor="cron-edit-command" className="text-xs text-muted-foreground">
              Shell command
            </label>
            <Input
              id="cron-edit-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="font-mono"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="cron-edit-prompt" className="text-xs text-muted-foreground">
              Prompt
            </label>
            <Textarea
              id="cron-edit-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
            />
          </div>
        )}
        {!isShell && (
          <div className="space-y-1">
            <label htmlFor="cron-edit-model" className="text-xs text-muted-foreground">
              Model override
            </label>
            <Input
              id="cron-edit-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Optional; defaults to the agent's model"
              className="font-mono"
            />
          </div>
        )}
        <ScheduleFields draft={draft} onChange={patchDraft} now={now} idPrefix="cron-edit" />
        {pastOneOff && untouched && (
          <p className="text-xs text-muted-foreground">
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
  // Up to 50 runs arrive; show a windowful.
  const runsWindow = useListWindow(runs);
  const [error, setError] = React.useState<string | null>(null);
  // The rows arrive after the dialog opened (and focused its X), so first
  // focus moves to the first row once there is one.
  const firstRow = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (runs && runs.length > 0) firstRow.current?.focus();
  }, [runs]);

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
    <Modal open={!!job} onClose={onClose} title="Run history" description={jobLabel(job)}>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && runs == null && <p className="text-xs text-muted-foreground">Loading runs…</p>}
        {runs != null && runs.length === 0 && (
          <p className="text-xs text-muted-foreground">No runs yet. Run now records the first.</p>
        )}
        {runs?.slice(0, runsWindow.shown).map((r, i) => (
          <details key={r.id} className="rounded border border-border px-2.5 py-2">
            <summary
              ref={i === 0 ? firstRow : undefined}
              tabIndex={0}
              className="flex cursor-pointer items-center gap-2 rounded text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Badge variant={statusTone(r.status)} className="text-[11px]">
                {statusWord(r.status)}
              </Badge>
              <span className="text-muted-foreground">{fmtWhen(r.started_at)}</span>
              {(r.attempt ?? 1) > 1 && (
                <span className="text-muted-foreground">attempt {r.attempt}</span>
              )}
              <span className="ml-auto font-mono text-muted-foreground/80">
                {r.duration_ms != null ? `${r.duration_ms}ms` : ""}
              </span>
            </summary>
            {r.output && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px]">
                {r.output}
              </pre>
            )}
          </details>
        ))}
        {runs && (
          <ShowMoreRow
            remaining={runs.length - runsWindow.shown}
            onClick={runsWindow.showMore}
            className="rounded border border-border"
          />
        )}
      </div>
    </Modal>
  );
}
