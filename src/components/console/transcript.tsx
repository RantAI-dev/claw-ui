"use client";

import * as React from "react";
import { AlertTriangle, Brain, Check, ChevronRight, FileText } from "lucide-react";
import { summariseRecalledMemories } from "@/lib/recalled-memories";
import type { ChatMessage, ToolCall } from "@/lib/types";
import { toolIcon } from "@/lib/console";
import { formatNumber, formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/chat/markdown";
import { stripThink } from "@/lib/render-text";
import { GenerativeMessage } from "./generative-ui";

function argsTarget(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") return args;
  try {
    const s = JSON.stringify(args);
    return s.length > 160 ? `${s.slice(0, 160)}…` : s;
  } catch {
    return String(args);
  }
}

/** The gateway reports a user denial as a failed call with this marker; to
 *  the person who clicked Deny it is a stop, not an error. Shared by the
 *  per-row status and the header summary. */
function toolFailed(t: ToolCall): boolean {
  const denied = /\[denied by user\]/.test(t.outputPreview || "");
  return !!t.done && t.ok === false && !(t.cancelled || denied);
}

/** One quiet collapsible "Activity · N tools" disclosure for a turn's tool calls. */
const Activity = React.memo(function Activity({ tools, defaultOpen }: { tools: ToolCall[]; defaultOpen: boolean }) {
  const failedCount = tools.filter(toolFailed).length;
  // A turn with a failed tool opens its traces: a collapsed "✓ done" over an
  // error is how failures get missed.
  const [open, setOpen] = React.useState(defaultOpen || failedCount > 0);
  const running = tools.some((t) => !t.done);

  return (
    <div className="activity">
      <button className={"act-head" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
        <ChevronRight className="chev" />
        <span className="act-label">Activity</span>
        <span className="act-sub">
          · {tools.length} tool{tools.length !== 1 ? "s" : ""}
        </span>
        <span className="spark">
          {running ? (
            <Badge variant="accent" className="px-1.5 py-0.5 text-[11px]">
              <span className="size-1.5 animate-pulse rounded-full bg-current" /> Running
            </Badge>
          ) : failedCount > 0 ? (
            <span className="act-sub inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" /> {failedCount} failed
            </span>
          ) : (
            <span className="act-sub inline-flex items-center gap-1 text-success">
              <Check className="size-3" /> done
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="act-list">
          {tools.map((t) => {
            const Ico = toolIcon(t.name);
            const denied = /\[denied by user\]/.test(t.outputPreview || "");
            const stopped = t.cancelled || denied;
            const status = !t.done ? "run" : stopped ? "stopped" : toolFailed(t) ? "err" : "ok";
            return (
              <div className="act-row" key={t.id}>
                <div className="act-ico">
                  <Ico />
                </div>
                <div className="act-main">
                  <div className="act-tool">
                    {t.name}
                    {argsTarget(t.args) && (
                      <>
                        <span className="arrow">→</span>
                        <span className="tgt">{argsTarget(t.args)}</span>
                      </>
                    )}
                  </div>
                  {t.outputPreview && <div className="act-res">{t.outputPreview}</div>}
                </div>
                <span className={"act-status " + status}>{status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/** A failed turn: one line the operator can read at a glance, with the gateway's
 *  full report (often several retry attempts) behind a disclosure instead of a
 *  wall of red text. */
function TurnError({ message }: { message: string }) {
  const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
  // Gateway first lines often trail into the detail that follows ("… failed.
  // Attempts:"). The headline is the first full sentence; a dangling
  // lead-in like "Attempts:" reads as truncation, so it stays in the details.
  const first = lines[0] || "The turn failed.";
  const sentence = first.match(/^.*?[.!?](?=\s|$)/);
  const headline = sentence ? sentence[0] : first.replace(/:\s*$/, "");
  const detail = lines.slice(1).join("\n");
  return (
    <div className="turn-error" role="alert">
      <div className="turn-error-head">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>{headline}</span>
      </div>
      {detail && (
        <details className="turn-error-more">
          <summary>Details</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </div>
  );
}

const BotTurn = React.memo(function BotTurn({
  m,
  agentName,
  agentInitials,
  modelTag,
  serif,
  tracesOpen,
  renderMode,
  onAction,
}: {
  m: ChatMessage;
  agentName: string;
  agentInitials: string;
  modelTag: string;
  serif: boolean;
  tracesOpen: boolean;
  renderMode: "md" | "gui";
  onAction: (value: string) => void;
}) {
  const display = React.useMemo(() => stripThink(m.content, !!m.streaming), [m.content, m.streaming]);
  const showCursor = m.streaming && !display;
  const tools = m.toolCalls || [];

  return (
    <div className="turn fade-up">
      <div className="msg-bot">
        <div className="bot-ava">{agentInitials}</div>
        <div className="bot-body" aria-busy={m.streaming || undefined}>
          <div className="bot-name">
            <b>{agentName}</b>
            {modelTag && <span className="tag">{modelTag}</span>}
          </div>

          {tools.length > 0 && <Activity tools={tools} defaultOpen={m.streaming ? true : tracesOpen} />}

          {m.error && <TurnError message={m.error} />}

          {(display || showCursor) &&
            (renderMode === "gui" ? (
              <GenerativeMessage
                content={display}
                onAction={onAction}
                serif={serif}
                streaming={m.streaming}
              />
            ) : (
              <div className={"prose" + (serif ? " serif" : "")} style={{ position: "relative" }}>
                <Markdown content={display} />
                {m.streaming && <span className="cursor" />}
              </div>
            ))}

          {m.sources && m.sources.length > 0 && !m.streaming && (
            <div className="src-chips">
              <span className="src-label">Sources:</span>
              {m.sources.map((s, i) => (
                <span className="src-chip" key={`${s}-${i}`} title={s}>
                  <FileText />
                  {s}
                </span>
              ))}
            </div>
          )}

          {m.recalledMemories && m.recalledMemories.length > 0 && !m.streaming && (
            /* Memory is recalled without the user asking for it, so an answer
               leaning on a remembered fact is unreadable without this. Same
               chip row as Sources — both answer "what informed this?". */
            <div className="src-chips">
              <span className="src-label">Recalled:</span>
              {summariseRecalledMemories(m.recalledMemories).map((label, i) => (
                <span className="src-chip" key={`${label}-${i}`} title={`Memory: ${label}`}>
                  <Brain />
                  {label}
                </span>
              ))}
            </div>
          )}

          {m.usage && !m.streaming && m.usage.total > 0 && (
            <div className="msg-meta" style={{ marginTop: 8 }}>
              {formatNumber(m.usage.total)} tokens
              {m.usage.cost_usd > 0 ? ` · ${formatUsd(m.usage.cost_usd)}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const UserTurn = React.memo(function UserTurn({ m }: { m: ChatMessage }) {
  return (
    <div className="turn fade-up">
      <div className="msg-user">
        {m.content && <div className="bubble">{m.content}</div>}
        {m.attachments && m.attachments.length > 0 && (
          <div
            className="attach-chips"
            style={{ padding: 0, marginTop: 6, justifyContent: "flex-end" }}
          >
            {m.attachments.map((name, i) => (
              <span key={i} className="attach-chip ready" title={name}>
                <FileText />
                <span className="attach-name">{name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export function Transcript({
  messages,
  agentName,
  agentInitials,
  modelTag,
  serif,
  tracesOpen,
  thinking,
  renderMode,
  onAction,
}: {
  messages: ChatMessage[];
  agentName: string;
  agentInitials: string;
  modelTag: string;
  serif: boolean;
  tracesOpen: boolean;
  thinking: boolean;
  renderMode: "md" | "gui";
  onAction: (value: string) => void;
}) {
  const lastIdx = messages.length - 1;
  return (
    <div className="transcript">
      {messages.map((m, i) => {
        // When the "working…" placeholder is shown, the trailing empty streaming
        // assistant turn IS that placeholder — rendering it too would put a second
        // avatar (an empty bot bubble) right beside the thinking dots.
        if (thinking && i === lastIdx && m.role === "assistant") return null;
        return m.role === "user" ? (
          <UserTurn key={m.id} m={m} />
        ) : (
          <BotTurn
            key={m.id}
            m={m}
            agentName={agentName}
            agentInitials={agentInitials}
            modelTag={modelTag}
            serif={serif}
            tracesOpen={tracesOpen}
            renderMode={renderMode}
            onAction={onAction}
          />
        );
      })}
      {thinking && (
        <div className="turn fade-up">
          <div className="msg-bot" role="status" aria-live="polite">
            <div className="bot-ava">{agentInitials}</div>
            <div className="bot-body" style={{ paddingTop: 4 }}>
              <div className="think-body" style={{ paddingTop: 0, display: "flex", alignItems: "center", gap: 9 }}>
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
                {agentName} is working…
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
