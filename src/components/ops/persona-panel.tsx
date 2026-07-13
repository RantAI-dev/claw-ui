"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { KeyVal, PanelFrame, RefreshButton, SectionTitle } from "./shared";

const PERSONA_PRESETS = [
  { value: "default", label: "Default" },
  { value: "concise_pro", label: "Concise Pro" },
  { value: "friendly_companion", label: "Friendly Companion" },
  { value: "research_analyst", label: "Research Analyst" },
  { value: "executive_assistant", label: "Executive Assistant" },
];

export function PersonaPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.personality(), []);
  const groups = useAsync(() => api.kbGroups(), []);
  const [preset, setPreset] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Always-on KB ids, seeded from the saved personality.
  const [alwaysOn, setAlwaysOn] = React.useState<string[]>([]);
  const [savingKbs, setSavingKbs] = React.useState(false);

  React.useEffect(() => {
    if (data?.preset) setPreset(data.preset);
  }, [data?.preset]);
  React.useEffect(() => {
    if (data) setAlwaysOn(Array.isArray(data.always_on_kbs) ? data.always_on_kbs : []);
  }, [data]);

  const apply = async () => {
    if (!preset) return;
    setSaving(true);
    try {
      // Preserve the always-on KB binding when changing the preset.
      await api.setPersonality({ preset, always_on_kbs: alwaysOn });
      toast.success(`Preset set to “${preset}”`);
      refresh();
    } catch (e) {
      toast.error(`Failed to set preset: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  // Toggle a KB in the always-on set and persist immediately (preserving the preset).
  const toggleKb = async (id: string) => {
    const next = alwaysOn.includes(id) ? alwaysOn.filter((x) => x !== id) : [...alwaysOn, id];
    setAlwaysOn(next);
    setSavingKbs(true);
    try {
      await api.setPersonality({ preset: data?.preset || preset || undefined, always_on_kbs: next });
      toast.success("Always-on knowledge bases updated", { id: "persona-always-on" });
      refresh();
    } catch (e) {
      // Roll back the optimistic toggle on failure.
      setAlwaysOn(alwaysOn);
      toast.error(`Failed to update: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSavingKbs(false);
    }
  };

  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={() => { refresh(); groups.refresh(); }} />}>
        Personality
      </SectionTitle>
      <PanelFrame loading={loading} error={error} empty={!loading && !error && !data} onRefresh={refresh}>
        {data && (
          <Card className="p-4">
            <KeyVal k="Profile" v={data.profile} />
            <KeyVal k="Preset" v={data.preset || "— not configured —"} />
            {data.name && <KeyVal k="Name" v={data.name} />}
            {data.role && <KeyVal k="Role" v={data.role} />}
            {data.tone && <KeyVal k="Tone" v={data.tone} />}
            {data.timezone && <KeyVal k="Timezone" v={data.timezone} />}
            {data.avoid && <KeyVal k="Avoid" v={data.avoid} />}
            <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="min-w-0 flex-1"
              >
                <option value="" disabled>
                  Choose a preset…
                </option>
                {PERSONA_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Button
                onClick={apply}
                disabled={saving || !preset || preset === data.preset}
                size="sm"
              >
                {saving ? "Applying…" : "Apply preset"}
              </Button>
            </div>

            {/* Always-on knowledge bases — retrieved on every chat regardless of per-chat selection. */}
            <div className="mt-4 border-t border-border/60 pt-4">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Always-on knowledge bases
              </div>
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
