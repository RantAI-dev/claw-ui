"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { coerceText as asText } from "@/lib/render-text";

/** Coerce any model-supplied value to an array. The model output is untrusted:
 *  a field that should be an array can arrive as a string/number/object, and a
 *  bare `.map` on it throws in render — taking down the whole console route. */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Cap on nested-component recursion, so a deeply-nested `card` from the model
 *  cannot overflow the stack. */
const MAX_DEPTH = 10;

/** Error boundary: one malformed `ui` block must not crash the transcript. */
class UiErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    // Self-hosted tool — log locally, never to an external service.
    console.error("[generative-ui] render error:", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* A lightweight OpenUI-style generative-UI renderer: the agent emits a fenced
 * ```ui block holding a JSON array of components, and we render them as real
 * interactive UI using the console's design system. Prose outside the block is
 * still rendered as markdown. */

type Tone = "sky" | "green" | "amber" | "red" | "purple" | "dim";

interface Comp {
  type: string;
  text?: string;
  title?: string;
  tone?: Tone;
  items?: unknown[];
  columns?: string[];
  rows?: string[][];
  children?: Comp[];
  prompt?: string;
  options?: { label: string; value?: string }[];
}

const TONE_VAR: Record<string, string> = {
  sky: "var(--brand-sky)",
  green: "var(--accent-green)",
  amber: "var(--accent-orange)",
  red: "var(--destructive)",
  purple: "var(--accent-purple)",
  dim: "var(--muted-foreground)",
};
const toneVar = (t?: string) => TONE_VAR[t || ""] || TONE_VAR.sky;
const TONE_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "accent" | "secondary"> = {
  green: "success",
  amber: "warning",
  red: "destructive",
  sky: "accent",
  dim: "secondary",
};
const toneBadge = (t?: string) => TONE_BADGE_VARIANT[t || ""] || "accent";

/** Split content into markdown segments, parsed ```ui blocks, and (while
 * streaming) a trailing not-yet-closed ```ui block rendered as a placeholder. */
type Segment =
  | { kind: "md"; text: string }
  | { kind: "ui"; comps: Comp[] }
  | { kind: "code"; text: string }
  | { kind: "uiPartial"; text: string };

const OPEN = "```ui";

export function parseSegments(content: string): Segment[] {
  const segs: Segment[] = [];
  let idx = 0;
  while (true) {
    const open = content.indexOf(OPEN, idx);
    if (open === -1) {
      const tail = content.slice(idx);
      if (tail) segs.push({ kind: "md", text: tail });
      break;
    }
    if (open > idx) segs.push({ kind: "md", text: content.slice(idx, open) });
    const afterOpen = open + OPEN.length;
    const close = content.indexOf("```", afterOpen);
    if (close === -1) {
      // Opening fence with no closing yet — still streaming. Hold it as partial.
      segs.push({ kind: "uiPartial", text: content.slice(afterOpen).replace(/^\s*\n?/, "") });
      break;
    }
    const inner = content.slice(afterOpen, close).replace(/^\s*\n?/, "").trim();
    try {
      const parsed = JSON.parse(inner);
      segs.push({ kind: "ui", comps: Array.isArray(parsed) ? parsed : [parsed] });
    } catch {
      segs.push({ kind: "code", text: inner });
    }
    idx = close + 3;
  }
  return segs;
}

function UiComposing() {
  return (
    <div className="gu-composing">
      <span className="dots">
        <i />
        <i />
        <i />
      </span>
      Composing interface…
    </div>
  );
}

function Component({
  c,
  onAction,
  depth = 0,
}: {
  c: Comp;
  onAction?: (value: string) => void;
  depth?: number;
}) {
  if (depth > MAX_DEPTH) {
    return <div className="gu-heading text-muted-foreground">(nested too deep)</div>;
  }
  switch (c.type) {
    case "heading":
      return <div className="gu-heading">{asText(c.text)}</div>;
    case "text":
      return <Markdown content={asText(c.text)} />;
    case "divider":
      return <hr className="my-1 border-0 border-t border-border" />;
    case "card":
      return (
        <div
          className="card gu-card"
          style={{ ["--gu-accent" as string]: toneVar(c.tone) } as React.CSSProperties}
        >
          {c.title && (
            <div className="gu-card-title">
              <span className="cdot" />
              {c.title}
            </div>
          )}
          {asArray<Comp>(c.children).map((child, i) => (
            <Component key={i} c={child} onAction={onAction} depth={depth + 1} />
          ))}
        </div>
      );
    case "metrics":
      return (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, asArray(c.items).length)}, 1fr)` }}
        >
          {asArray(c.items).map((it, i) => {
            const item = it as { label?: string; value?: string; tone?: string };
            return (
              <Card key={i} className="px-3 py-2.5">
                <div
                  className="truncate text-lg font-medium tracking-tight"
                  style={{ color: item.tone ? toneVar(item.tone) : undefined }}
                >
                  {asText(item.value)}
                </div>
                <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {asText(item.label)}
                </div>
              </Card>
            );
          })}
        </div>
      );
    case "keyvalue":
      return (
        <div className="kv">
          {asArray(c.items).map((it, i) => {
            const item = it as { k?: string; v?: string };
            return (
              <div className="kv-row" key={i}>
                <span className="k">{asText(item.k)}</span>
                <span className="v">{asText(item.v)}</span>
              </div>
            );
          })}
        </div>
      );
    case "table":
      return (
        <table className="gu-table">
          {asArray(c.columns).length > 0 && (
            <thead>
              <tr>
                {asArray(c.columns).map((col, i) => (
                  <th key={i}>{asText(col)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {asArray<unknown>(c.rows).map((row, i) => (
              <tr key={i}>
                {asArray(row).map((cell, j) => (
                  <td key={j}>{asText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "list":
      return (
        <div className="markdown-body">
          <ul>
            {asArray(c.items).map((it, i) => (
              <li key={i}>{asText(it)}</li>
            ))}
          </ul>
        </div>
      );
    case "badges":
      return (
        <div className="flex flex-wrap gap-1.5">
          {asArray(c.items).map((it, i) => {
            const item = it as { label?: string; tone?: string };
            return (
              <Badge key={i} variant={toneBadge(item.tone)}>
                {asText(item.label)}
              </Badge>
            );
          })}
        </div>
      );
    case "callout":
      return (
        <div
          className="gu-callout"
          style={{ ["--gu-accent" as string]: toneVar(c.tone) } as React.CSSProperties}
        >
          {asText(c.text)}
        </div>
      );
    case "choices":
      return (
        <div>
          {c.prompt && <div className="gu-choice-prompt">{c.prompt}</div>}
          <div className="gu-choices">
            {asArray<{ label: string; value?: string }>(c.options).map((o, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => onAction?.(o.value || o.label)}
                disabled={!onAction}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function GenerativeMessage({
  content,
  onAction,
  serif,
  streaming,
}: {
  content: string;
  onAction?: (value: string) => void;
  serif?: boolean;
  streaming?: boolean;
}) {
  const segments = React.useMemo(() => parseSegments(content), [content]);
  const lastKind = segments[segments.length - 1]?.kind;
  // Show the typing cursor only when streaming plain prose (not inside/after a
  // rendered component or while the placeholder is already animating).
  const showCursor = streaming && (lastKind === "md" || segments.length === 0);

  return (
    <div className={"prose" + (serif ? " serif" : "")} style={{ position: "relative" }}>
      {segments.map((seg, i) => {
        if (seg.kind === "md") {
          return seg.text.trim() ? <Markdown key={i} content={seg.text} /> : null;
        }
        if (seg.kind === "uiPartial") {
          // Still streaming the block → tidy placeholder. If the stream ended
          // without a closing fence, fall back to showing the raw text.
          return streaming ? (
            <UiComposing key={i} />
          ) : seg.text.trim() ? (
            <pre key={i} className="toml rounded-md border border-border">
              {seg.text}
            </pre>
          ) : (
            <UiComposing key={i} />
          );
        }
        if (seg.kind === "code") {
          return (
            <pre key={i} className="toml rounded-md border border-border">
              {seg.text}
            </pre>
          );
        }
        return (
          <UiErrorBoundary
            key={i}
            fallback={
              <pre className="toml rounded-md border border-border">
                {JSON.stringify(seg.comps, null, 2)}
              </pre>
            }
          >
            <div className="gu-wrap">
              {asArray<Comp>(seg.comps).map((c, j) => (
                <Component key={j} c={c} onAction={onAction} />
              ))}
            </div>
          </UiErrorBoundary>
        );
      })}
      {showCursor && <span className="cursor" />}
    </div>
  );
}
