"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { PERSONA_CHANGED } from "@/lib/console";
import { describeApiError } from "@/lib/api";
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

export function PersonaPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.personality(), []);
  const groups = useAsync(() => api.kbGroups(), []);
  const presets = useAsync(() => api.personalityPresets(), []);
  const presetOptions = presets.data?.presets ?? FALLBACK_PRESETS;

  const [preset, setPreset] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [tone, setTone] = React.useState("");
  const [avoid, setAvoid] = React.useState("");
  const [timezone, setTimezone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [alwaysOn, setAlwaysOn] = React.useState<string[]>([]);
  const [savingKbs, setSavingKbs] = React.useState(false);

  // Seed the form from the saved persona.
  React.useEffect(() => {
    if (!data) return;
    setPreset(data.preset ?? "");
    setName(data.name ?? "");
    setRole(data.role ?? "");
    setTone(data.tone ?? "");
    setAvoid(data.avoid ?? "");
    setTimezone(data.timezone ?? "");
    setAlwaysOn(Array.isArray(data.always_on_kbs) ? data.always_on_kbs : []);
  }, [data]);

  const dirty =
    !!data &&
    (preset !== (data.preset ?? "") ||
      name !== (data.name ?? "") ||
      role !== (data.role ?? "") ||
      tone !== (data.tone ?? "") ||
      avoid !== (data.avoid ?? "") ||
      timezone !== (data.timezone ?? ""));

  const save = async () => {
    setSaving(true);
    try {
      await api.setPersonality({
        preset: preset || undefined,
        name,
        role,
        tone,
        avoid, // "" clears the avoid block (three-state on the gateway)
        timezone,
        always_on_kbs: alwaysOn,
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
    const next = alwaysOn.includes(id) ? alwaysOn.filter((x) => x !== id) : [...alwaysOn, id];
    const prev = alwaysOn;
    setAlwaysOn(next);
    setSavingKbs(true);
    try {
      await api.setPersonality({ preset: data?.preset || preset || undefined, always_on_kbs: next });
      toast.success("Always-on knowledge bases updated", { id: "persona-always-on" });
      window.dispatchEvent(new CustomEvent(PERSONA_CHANGED));
      refresh();
    } catch (e) {
      setAlwaysOn(prev);
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
      <PanelFrame
        loading={loading}
        error={error}
        loaded={!!data}
        empty={!loading && !error && !data}
        emptyTitle="Persona not loaded."
        emptyHint="The gateway returned no persona. Refresh to try again."
        onRefresh={refresh}
      >
        {data && (
          <Card className="space-y-3 p-4">
            <div className="text-[11px] text-muted-foreground">Profile: {data.profile}</div>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Preset</span>
              <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="mt-1 w-full">
                <option value="" disabled>
                  Choose a preset…
                </option>
                {presetOptions.map((p) => (
                  <option key={p.id} value={p.id} title={p.description}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</span>
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Timezone</span>
              <Input value={timezone} maxLength={64} placeholder="IANA zone, e.g. Asia/Jakarta" onChange={(e) => setTimezone(e.target.value)} className="mt-1" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tone</span>
              <Input value={tone} maxLength={80} onChange={(e) => setTone(e.target.value)} className="mt-1" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Role</span>
              <Textarea value={role} maxLength={400} rows={2} onChange={(e) => setRole(e.target.value)} className="mt-1" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avoid</span>
              <Textarea value={avoid} maxLength={400} rows={2} placeholder="Leave empty to clear" onChange={(e) => setAvoid(e.target.value)} className="mt-1" />
            </label>
            <div className="flex justify-end border-t border-border/60 pt-3">
              <Button onClick={save} disabled={saving || !dirty} size="sm">
                {saving ? "Saving…" : "Save persona"}
              </Button>
            </div>

            {/* Always-on knowledge bases — retrieved on every chat regardless of per-chat selection. */}
            <div className="border-t border-border/60 pt-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Always-on knowledge bases
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Selected bases are searched on every conversation for this persona. Create or edit
                the bases themselves in the Knowledge Bases tab.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(groups.data || []).length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {groups.loading
                      ? "Loading…"
                      : groups.error
                        ? `Couldn't load knowledge bases: ${groups.error}`
                        : "No knowledge bases yet. Create one in the Knowledge Bases tab."}
                  </span>
                ) : (
                  (groups.data || []).map((g) => {
                    const on = alwaysOn.includes(g.id);
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
