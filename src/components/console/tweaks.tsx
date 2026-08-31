"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { ACCENTS, DEFAULT_ACCENT } from "@/lib/console";

export interface Tweaks {
  accent: string;
  voice: "Sans" | "Serif";
  traces: "Collapsed" | "Expanded";
  density: "Comfortable" | "Compact";
  rightPanel: boolean;
  render: "Markdown" | "Generative UI";
}

export const TWEAK_DEFAULTS: Tweaks = {
  accent: DEFAULT_ACCENT,
  voice: "Sans",
  traces: "Collapsed",
  density: "Comfortable",
  rightPanel: true,
  render: "Markdown",
};

/**
 * Coerce an untrusted persisted blob into a valid Tweaks. A hand-edited or
 * stale localStorage value must not seed the console with an out-of-range
 * field (e.g. a bogus `render` mode driving the generative-UI path); every
 * field falls back to its default unless it exactly matches an allowed value.
 */
export function sanitizeTweaks(raw: unknown): Tweaks {
  const out: Tweaks = { ...TWEAK_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const pick = <K extends keyof Tweaks>(key: K, allowed: readonly Tweaks[K][]) => {
    if (allowed.includes(r[key] as Tweaks[K])) out[key] = r[key] as Tweaks[K];
  };
  if (typeof r.accent === "string" && r.accent in ACCENTS) out.accent = r.accent;
  pick("voice", ["Sans", "Serif"]);
  pick("traces", ["Collapsed", "Expanded"]);
  pick("density", ["Comfortable", "Compact"]);
  if (typeof r.rightPanel === "boolean") out.rightPanel = r.rightPanel;
  pick("render", ["Markdown", "Generative UI"]);
  return out;
}

function Section({ label }: { label: string }) {
  return (
    <div className="eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>
      {label}
    </div>
  );
}

function Radio<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, marginBottom: 7 }}>{label}</div>
      <div
        className="seg"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((o) => (
          <button
            key={o}
            className={o === value ? "on" : ""}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TweaksPanelProps {
  open: boolean;
  onClose: () => void;
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
}

export function TweaksPanel(props: TweaksPanelProps) {
  if (!props.open) return null;
  return <TweaksDialog {...props} />;
}

/** Mounted only while open, so the opener is captured at mount and focus goes
 *  back to it on close. Escape closes; Tab stays inside (it is aria-modal). */
function TweaksDialog({ onClose, tweaks, setTweak }: TweaksPanelProps) {
  const panelRef = React.useRef<HTMLElement>(null);
  const [opener] = React.useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  React.useEffect(() => () => opener?.focus(), [opener]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tweaks"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          zIndex: 41,
          background: "color-mix(in oklab, var(--background) 92%, black)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-2xl)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 56,
            padding: "0 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="eyebrow">Tweaks</div>
          <button
            autoFocus
            className="icon-btn"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            title="Close"
            aria-label="Close tweaks"
          >
            <X />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 24px" }}>
          <Section label="Accent" />
          <div style={{ display: "flex", gap: 10 }}>
            {Object.entries(ACCENTS).map(([name, a]) => (
              <button
                key={name}
                title={name}
                onClick={() => setTweak("accent", name)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--radius-md)",
                  border:
                    tweaks.accent === name
                      ? "2px solid var(--foreground)"
                      : "1px solid var(--border)",
                  background: `linear-gradient(150deg, ${a.sky}, ${a.deep})`,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: "white",
                }}
              >
                {tweaks.accent === name && <Check style={{ width: 15, height: 15 }} />}
              </button>
            ))}
          </div>

          <Section label="Conversation" />
          <Radio
            label="Chat rendering"
            value={tweaks.render}
            options={["Markdown", "Generative UI"]}
            onChange={(v) => setTweak("render", v)}
          />
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--muted-foreground)",
              margin: "-4px 0 12px",
            }}
          >
            {tweaks.render === "Generative UI"
              ? "OpenUI-style: the agent can reply with interactive cards, tables, metrics & choices."
              : "Standard markdown replies."}
          </div>
          <Radio
            label="Assistant voice"
            value={tweaks.voice}
            options={["Sans", "Serif"]}
            onChange={(v) => setTweak("voice", v)}
          />
          <Radio
            label="Tool traces"
            value={tweaks.traces}
            options={["Collapsed", "Expanded"]}
            onChange={(v) => setTweak("traces", v)}
          />

          <Section label="Layout" />
          <Radio
            label="Density"
            value={tweaks.density}
            options={["Comfortable", "Compact"]}
            onChange={(v) => setTweak("density", v)}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 12.5 }}>Context panel</div>
            <button
              type="button"
              className={"switch" + (tweaks.rightPanel ? " on" : "")}
              onClick={() => setTweak("rightPanel", !tweaks.rightPanel)}
              role="switch"
              aria-checked={tweaks.rightPanel}
              aria-label="Context panel"
            >
              <i />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
