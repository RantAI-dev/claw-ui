"use client";

import * as React from "react";
import { Check, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { PERSONA_CHANGED, initials } from "@/lib/console";
import { describeApiError } from "@/lib/api";
import type { Personality } from "@/lib/types";
import {
  browserTimeZone,
  fieldErrors,
  formFromPersonality,
  freshForm,
  isDirty,
  isFresh,
  kbBlockState,
  kbUnavailableCode,
  nearCap,
  personaVerdict,
  timeZoneOptions,
  trimForm,
  type FieldKey,
  type PersonaForm,
  type PersonaVerdict,
} from "@/lib/persona";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

// Fallback list when the gateway predates `GET /personality/presets`.
const FALLBACK_PRESETS = [
  { id: "default", label: "Default", description: "" },
  { id: "concise_pro", label: "Concise Pro", description: "" },
  { id: "friendly_companion", label: "Friendly Companion", description: "" },
  { id: "research_analyst", label: "Research Analyst", description: "" },
  { id: "executive_assistant", label: "Executive Assistant", description: "" },
];

/**
 * The page opens with the answer: who is the agent on its next prompt? Not a
 * card; the whitespace around the band marks the focal point, as on Status,
 * Channels, Providers, Schedules, Skills, Knowledge Bases and Memory. This is
 * the identity page, so a saved persona carries the console's identity mark
 * (the rail's gradient tile) with its initials; the band always reads the
 * SAVED persona — edits below move it only through Save.
 */
function PersonaBand({ verdict, mark }: { verdict: PersonaVerdict; mark: string | null }) {
  return (
    <div className="flex items-start gap-3">
      {mark && (
        <span aria-hidden className="agent-ava mt-0.5">
          {mark}
        </span>
      )}
      <div className="min-w-0">
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
    </div>
  );
}

/** One labelled field: label row (with a counter near the cap), the control, an error line. */
function Field({
  id,
  label,
  value,
  max,
  error,
  after,
  children,
}: {
  id: string;
  label: string;
  value?: string;
  max?: number;
  error?: string;
  /** Rendered after the error line (the browser-timezone shortcut). */
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  const counter = value !== undefined && max !== undefined ? nearCap(value, max) : null;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-xs text-muted-foreground">
        {label}
        {counter && (
          <span className="ml-auto font-normal normal-case tracking-normal" aria-hidden="true">
            {counter}
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      {after}
    </div>
  );
}

export function PersonaPanel() {
  const { data, loading, error, loaded, refreshing, refresh } = useAsync(() => api.personality(), []);
  // A Knowledge Base that is off or has no embedding key answers with a code;
  // keep it as data so the block can say which, instead of a generic failure.
  const groups = useAsync(
    () =>
      api.kbGroups().catch((e) => {
        const code = kbUnavailableCode(e);
        if (code) return { unavailable: code } as const;
        throw e;
      }),
    [],
  );
  const presets = useAsync(() => api.personalityPresets(), []);
  const presetOptions = presets.data?.presets ?? FALLBACK_PRESETS;

  const [form, setForm] = React.useState<PersonaForm | null>(null);
  const set = (patch: Partial<PersonaForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const [saving, setSaving] = React.useState(false);

  const ids = {
    preset: React.useId(),
    name: React.useId(),
    timezone: React.useId(),
    tone: React.useId(),
    role: React.useId(),
    avoid: React.useId(),
    tzList: React.useId(),
  };
  const browserTz = React.useMemo(browserTimeZone, []);
  const tzOptions = React.useMemo(timeZoneOptions, []);

  // Seed the form from the saved persona; a fresh profile gets the runtime's
  // own defaults so Save writes what is on screen, not "" over them. Only a
  // clean form is re-seeded: Refresh reloads the saved snapshot, it does not
  // overwrite work in progress (the form is read on purpose; `data` drives it).
  const seededRef = React.useRef<Personality | null>(null);
  React.useEffect(() => {
    if (!data || data === seededRef.current) return;
    const prev = seededRef.current;
    seededRef.current = data;
    const clean = !form || !prev || isFresh(prev) || !isDirty(form, formFromPersonality(prev));
    if (clean) setForm(isFresh(data) ? freshForm(browserTimeZone()) : formFromPersonality(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const fresh = !!data && isFresh(data);
  const saved = data ? formFromPersonality(data) : null;
  // A fresh form is dirty by definition: nothing is saved yet.
  const dirty = !!form && !!saved && (fresh || isDirty(form, saved));
  const errors = form ? fieldErrors(form) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const selectedPreset = presetOptions.find((p) => p.id === form?.preset);
  const kb = kbBlockState({ loading: groups.loading, error: groups.error, data: groups.data });
  // Refresh and the frame's Retry re-run all three reads, so a recovered gateway
  // does not leave the presets or the knowledge-base block on a stale failure.
  const refreshAll = () => {
    refresh();
    groups.refresh();
    presets.refresh();
  };
  const kbLink = (
    <a href="#kb" className="underline underline-offset-2 hover:text-foreground">
      Knowledge Bases
    </a>
  );

  const fieldProps = (key: FieldKey) => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${ids[key]}-err` : undefined,
  });

  const save = async () => {
    if (!form) return;
    const f = trimForm(form);
    setForm(f);
    setSaving(true);
    try {
      await api.setPersonality({
        preset: f.preset || undefined,
        name: f.name,
        role: f.role,
        tone: f.tone,
        avoid: f.avoid, // "" clears the avoid block (three-state on the gateway)
        timezone: f.timezone,
        always_on_kbs: f.alwaysOn,
      });
      toast.success("Persona saved");
      window.dispatchEvent(new CustomEvent(PERSONA_CHANGED));
      refresh();
    } catch (e) {
      // Leave the form as-is so the operator's edits are not lost.
      toast.error(`Failed to save persona: ${describeApiError(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleKb = (id: string) => {
    if (!form) return;
    const on = form.alwaysOn.includes(id);
    set({ alwaysOn: on ? form.alwaysOn.filter((x) => x !== id) : [...form.alwaysOn, id] });
  };

  return (
    <div className="max-w-[1120px] space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {data && (
            <PersonaBand
              verdict={personaVerdict(data)}
              mark={!fresh && data.name?.trim() ? initials(data.name) : null}
            />
          )}
        </div>
        <RefreshButton onClick={refreshAll} spinning={refreshing} />
      </div>

      <PanelFrame
        loading={loading}
        loadingLabel="Loading persona…"
        error={error}
        loaded={loaded}
        onRefresh={refreshAll}
      >
        {data && form && (
          /* The 7/5 split gives the form — the page — a readable measure; the
             always-on bases compose in the narrow column. One Save writes both. */
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <SectionTitle>Persona</SectionTitle>
              <p className="text-xs text-muted-foreground">
                Rendered into every system prompt through the preset&apos;s template.
              </p>
              <Card className="mt-3 space-y-4 p-4">
                <Field id={ids.preset} label="Preset">
                  <Select
                    id={ids.preset}
                    value={form.preset}
                    onChange={(e) => set({ preset: e.target.value })}
                    className="w-full"
                  >
                    <option value="" disabled>
                      Choose a preset…
                    </option>
                    {presetOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedPreset?.description ||
                      "Presets set the style rules of the system prompt; the fields below say who the agent is."}
                  </p>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={ids.name} label="Name" value={form.name} max={80} error={errors.name}>
                    <Input
                      id={ids.name}
                      value={form.name}
                      maxLength={80}
                      placeholder="RantaiClaw"
                      onChange={(e) => set({ name: e.target.value })}
                      {...fieldProps("name")}
                    />
                  </Field>
                  <Field
                    id={ids.timezone}
                    label="Timezone"
                    error={errors.timezone}
                    after={
                      form.timezone.trim() !== browserTz ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto px-0 text-[11px]"
                          onClick={() => set({ timezone: browserTz })}
                        >
                          Use this browser&apos;s timezone ({browserTz})
                        </Button>
                      ) : undefined
                    }
                  >
                    <Input
                      id={ids.timezone}
                      list={ids.tzList}
                      value={form.timezone}
                      maxLength={64}
                      placeholder="Asia/Jakarta"
                      onChange={(e) => set({ timezone: e.target.value })}
                      {...fieldProps("timezone")}
                    />
                    <datalist id={ids.tzList}>
                      {tzOptions.map((tz) => (
                        <option key={tz} value={tz} />
                      ))}
                    </datalist>
                  </Field>
                </div>
                <Field id={ids.tone} label="Tone" value={form.tone} max={80} error={errors.tone}>
                  <Input
                    id={ids.tone}
                    value={form.tone}
                    maxLength={80}
                    placeholder="neutral"
                    onChange={(e) => set({ tone: e.target.value })}
                    {...fieldProps("tone")}
                  />
                </Field>
                <Field id={ids.role} label="Role" value={form.role} max={400} error={errors.role}>
                  <Textarea
                    id={ids.role}
                    value={form.role}
                    maxLength={400}
                    rows={2}
                    placeholder="general productivity and helpful assistance"
                    onChange={(e) => set({ role: e.target.value })}
                    {...fieldProps("role")}
                  />
                </Field>
                <Field id={ids.avoid} label="Avoid" value={form.avoid} max={400}>
                  <Textarea
                    id={ids.avoid}
                    value={form.avoid}
                    maxLength={400}
                    rows={2}
                    placeholder="Topics or behaviours the agent should steer away from (optional)"
                    onChange={(e) => set({ avoid: e.target.value })}
                  />
                </Field>
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  {/* Save's scope crosses the grid: the narrow column's toggles ride along. */}
                  <p className="text-[11px] text-muted-foreground">
                    Save writes everything on this page, the always-on bases included.
                  </p>
                  <Button onClick={save} disabled={saving || !dirty || hasErrors} size="sm">
                    {saving ? "Saving…" : "Save persona"}
                  </Button>
                </div>
              </Card>
            </div>

            <div className="min-w-0 space-y-8 lg:col-span-5">
              <div>
                <SectionTitle>Always-on knowledge bases</SectionTitle>
                <p className="text-xs text-muted-foreground">
                  Searched on every chat sent from this console, on top of the bases picked for
                  that chat. Channels and the terminal do not read this list.
                </p>
                <Card className="mt-3 p-4">
                  <div className="text-xs text-muted-foreground">
                    {kb.kind === "loading" && <span>Loading knowledge bases…</span>}
                    {kb.kind === "off" && (
                      <span>The Knowledge Base is turned off. Turn it on under {kbLink}.</span>
                    )}
                    {kb.kind === "no-key" && (
                      <span>The Knowledge Base needs an embedding key. Add one under {kbLink}.</span>
                    )}
                    {kb.kind === "error" && (
                      <span className="inline-flex flex-wrap items-center gap-2 text-destructive">
                        Couldn&apos;t load knowledge bases: {kb.message}
                        <Button variant="ghost" size="sm" onClick={groups.refresh}>
                          <RefreshCw /> Retry
                        </Button>
                      </span>
                    )}
                    {kb.kind === "empty" && (
                      <span>No knowledge bases yet. Create one under {kbLink}.</span>
                    )}
                    {kb.kind === "list" && (
                      <div
                        role="group"
                        aria-label="Always-on knowledge bases"
                        className="flex flex-wrap gap-2"
                      >
                        {kb.groups.map((g) => {
                          const on = form.alwaysOn.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleKb(g.id)}
                              title={g.description || undefined}
                              className={cn(
                                "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10",
                                on
                                  ? "border-accent/60 bg-accent/10 text-accent"
                                  : "border-border text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {on && <Check className="size-3.5" aria-hidden="true" />}
                              {g.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </PanelFrame>
    </div>
  );
}
