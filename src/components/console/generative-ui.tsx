"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";

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

function asText(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function Component({
  c,
  onAction,
}: {
  c: Comp;
  onAction?: (value: string) => void;
}) {
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
          {(c.children || []).map((child, i) => (
            <Component key={i} c={child} onAction={onAction} />
          ))}
        </div>
      );
    case "metrics":
      return (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, (c.items || []).length)}, 1fr)` }}
        >
          {(c.items || []).map((it, i) => {
            const item = it as { label?: string; value?: string; tone?: string };
            return (
              <Card key={i} className="px-3 py-2.5">
                <div
                  className="truncate text-lg font-medium tracking-tight"
                  style={{ color: item.tone ? toneVar(item.tone) : undefined }}
                >
                  {asText(item.value)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
          {(c.items || []).map((it, i) => {
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
          {c.columns && c.columns.length > 0 && (
            <thead>
              <tr>
                {c.columns.map((col, i) => (
                  <th key={i}>{asText(col)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {(c.rows || []).map((row, i) => (
              <tr key={i}>
                {(row || []).map((cell, j) => (
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
            {(c.items || []).map((it, i) => (
              <li key={i}>{asText(it)}</li>
            ))}
          </ul>
        </div>
      );
    case "badges":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(c.items || []).map((it, i) => {
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
            {(c.options || []).map((o, i) => (
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
          <div className="gu-wrap" key={i}>
            {seg.comps.map((c, j) => (
              <Component key={j} c={c} onAction={onAction} />
            ))}
          </div>
        );
      })}
      {showCursor && <span className="cursor" />}
    </div>
  );
}
