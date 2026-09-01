"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { PERSONA_CHANGED } from "@/lib/console";
import { describeApiError } from "@/lib/api";
import {
  browserTimeZone,
  fieldErrors,
  formFromPersonality,
  freshForm,
  isDirty,
  isFresh,
  nearCap,
  timeZoneOptions,
  trimForm,
  type FieldKey,
  type PersonaForm,
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

const LABEL = "text-[10px] font-medium uppercase tracking-wider text-muted-foreground";

/** One labelled field: label row (with a counter near the cap), the control, an error line. */
function Field({
  id,
  label,
  value,
  max,
  error,
  children,
}: {
  id: string;
  label: string;
  value?: string;
  max?: number;
  error?: string;
  children: React.ReactNode;
}) {
  const counter = value !== undefined && max !== undefined ? nearCap(value, max) : null;
  return (
    <div>
      <label htmlFor={id} className={cn(LABEL, "flex items-baseline justify-between")}>
        {label}
        {counter && (
          <span className="ml-auto font-normal normal-case tracking-normal" aria-hidden="true">
            {counter}
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PersonaPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.personality(), []);
  const groups = useAsync(() => api.kbGroups(), []);
  const presets = useAsync(() => api.personalityPresets(), []);
  const presetOptions = presets.data?.presets ?? FALLBACK_PRESETS;

  const [form, setForm] = React.useState<PersonaForm | null>(null);
  const set = (patch: Partial<PersonaForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const [saving, setSaving] = React.useState(false);
  const [savingKbs, setSavingKbs] = React.useState(false);

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
  // own defaults so Save writes what is on screen, not "" over them.
  React.useEffect(() => {
    if (!data) return;
    setForm(isFresh(data) ? freshForm(browserTimeZone()) : formFromPersonality(data));
  }, [data]);

  const fresh = !!data && isFresh(data);
  const saved = data ? formFromPersonality(data) : null;
  // A fresh form is dirty by definition: nothing is saved yet.
  const dirty = !!form && !!saved && (fresh || isDirty(form, saved));
  const errors = form ? fieldErrors(form) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const selectedPreset = presetOptions.find((p) => p.id === form?.preset);

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

  // Toggle a KB in the always-on set and persist immediately.
  const toggleKb = async (id: string) => {
    if (!form) return;
    const prev = form.alwaysOn;
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    set({ alwaysOn: next });
    setSavingKbs(true);
    try {
      await api.setPersonality({ preset: data?.preset || form.preset || undefined, always_on_kbs: next });
      toast.success("Always-on knowledge bases updated", { id: "persona-always-on" });
      window.dispatchEvent(new CustomEvent(PERSONA_CHANGED));
      refresh();
    } catch (e) {
      set({ alwaysOn: prev });
      toast.error(`Failed to update: ${describeApiError(e)}`);
    } finally {
      setSavingKbs(false);
    }
  };

  return (
    <div>
      <SectionTitle
        action={
          <RefreshButton
            onClick={() => {
              refresh();
              groups.refresh();
              presets.refresh();
            }}
          />
        }
      >
        Personality
      </SectionTitle>
      <PanelFrame loading={loading} error={error} loaded={!!data} empty={!loading && !error && !data} onRefresh={refresh}>
        {data && form && (
          <Card className="space-y-3 p-4">
            <div className="text-[11px] text-muted-foreground">Profile: {data.profile}</div>
            {fresh && (
              <p
                role="status"
                className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
              >
                No persona saved yet. The agent gets no persona section until you save one; the
                fields below hold the runtime defaults.
              </p>
            )}
            <Field id={ids.preset} label="Preset">
              <Select
                id={ids.preset}
                value={form.preset}
                onChange={(e) => set({ preset: e.target.value })}
                className="mt-1 w-full"
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
              <p className="mt-1 text-[11px] text-muted-foreground">
                {selectedPreset?.description ||
                  "Presets set the style rules of the system prompt; the fields below say who the agent is."}
              </p>
            </Field>
            <Field id={ids.name} label="Name" value={form.name} max={80} error={errors.name}>
              <Input
                id={ids.name}
                value={form.name}
                maxLength={80}
                placeholder="RantaiClaw"
                onChange={(e) => set({ name: e.target.value })}
                className="mt-1"
                {...fieldProps("name")}
              />
            </Field>
            <Field id={ids.timezone} label="Timezone" error={errors.timezone}>
              <Input
                id={ids.timezone}
                list={ids.tzList}
                value={form.timezone}
                maxLength={64}
                placeholder="Asia/Jakarta"
                onChange={(e) => set({ timezone: e.target.value })}
                className="mt-1"
                {...fieldProps("timezone")}
              />
              <datalist id={ids.tzList}>
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              {form.timezone.trim() !== browserTz && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-[11px]"
                  onClick={() => set({ timezone: browserTz })}
                >
                  Use this browser&apos;s timezone ({browserTz})
                </Button>
              )}
            </Field>
            <Field id={ids.tone} label="Tone" value={form.tone} max={80} error={errors.tone}>
              <Input
                id={ids.tone}
                value={form.tone}
                maxLength={80}
                placeholder="neutral"
                onChange={(e) => set({ tone: e.target.value })}
                className="mt-1"
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
                className="mt-1"
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
                className="mt-1"
              />
            </Field>
            <div className="flex justify-end border-t border-border/60 pt-3">
              <Button onClick={save} disabled={saving || !dirty || hasErrors} size="sm">
                {saving ? "Saving…" : "Save persona"}
              </Button>
            </div>

            {/* Always-on knowledge bases: retrieved on every chat regardless of per-chat selection. */}
            <div className="border-t border-border/60 pt-3">
              <div className={LABEL}>Always-on knowledge bases</div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Selected bases are searched on every conversation for this persona. Create or edit
                the bases themselves in the Knowledge Bases tab.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(groups.data || []).length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {groups.loading ? "Loading…" : "No knowledge bases yet."}
                  </span>
                ) : (
                  (groups.data || []).map((g) => {
                    const on = form.alwaysOn.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleKb(g.id)}
                        disabled={savingKbs}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50",
                          on
                            ? "border-accent/60 bg-accent/10 text-accent"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        title={g.description || g.name}
                      >
                        {g.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        )}
      </PanelFrame>
    </div>
  );
}
