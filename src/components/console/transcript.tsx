"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, FileText } from "lucide-react";
import type { ChatMessage, ToolCall } from "@/lib/types";
import { toolIcon } from "@/lib/console";
import { formatNumber, formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/chat/markdown";
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

/** One quiet collapsible "Activity · N tools" disclosure for a turn's tool calls. */
function Activity({ tools, defaultOpen }: { tools: ToolCall[]; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
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
            <Badge variant="accent" className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              <span className="size-1.5 animate-pulse rounded-full bg-current" /> Running
            </Badge>
          ) : (
            <span className="act-sub text-success">✓ done</span>
          )}
        </span>
      </button>
      {open && (
        <div className="act-list">
          {tools.map((t) => {
            const Ico = toolIcon(t.name);
            const failed = t.done && t.ok === false;
            const status = !t.done ? "run" : failed ? "err" : "ok";
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
}

function BotTurn({
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
  const showCursor = m.streaming && !m.content;
  const tools = m.toolCalls || [];

  return (
    <div className="turn fade-up">
      <div className="msg-bot">
        <div className="bot-ava">{agentInitials}</div>
        <div className="bot-body">
          <div className="bot-name">
            <b>{agentName}</b>
            {modelTag && <span className="tag">{modelTag}</span>}
          </div>

          {tools.length > 0 && <Activity tools={tools} defaultOpen={m.streaming ? true : tracesOpen} />}

          {m.error && (
            <div
              className="appr-reason"
              style={{
                display: "flex",
                gap: 8,
                color: "var(--destructive)",
                border: "1px solid color-mix(in oklab, var(--destructive) 35%, transparent)",
                borderRadius: "var(--radius-md)",
                padding: "9px 11px",
                marginBottom: 10,
              }}
            >
              <AlertTriangle style={{ width: 14, height: 14, flex: "none", marginTop: 1 }} />
              <span style={{ whiteSpace: "pre-wrap" }}>{m.error}</span>
            </div>
          )}

          {(m.content || showCursor) &&
            (renderMode === "gui" ? (
              <GenerativeMessage
                content={m.content}
                onAction={onAction}
                serif={serif}
                streaming={m.streaming}
              />
            ) : (
              <div className={"prose" + (serif ? " serif" : "")} style={{ position: "relative" }}>
                <Markdown content={m.content} />
                {m.streaming && <span className="cursor" />}
              </div>
            ))}

          {m.sources && m.sources.length > 0 && !m.streaming && (
            <div className="src-chips">
              <span className="src-label">Sumber:</span>
              {m.sources.map((s, i) => (
                <span className="src-chip" key={`${s}-${i}`} title={s}>
                  <FileText />
                  {s}
                </span>
              ))}
            </div>
          )}

          {m.usage && !m.streaming && (
            <div className="msg-meta" style={{ marginTop: 8 }}>
              {formatNumber(m.usage.total)} tokens
              {m.usage.cost_usd > 0 ? ` · ${formatUsd(m.usage.cost_usd)}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserTurn({ m }: { m: ChatMessage }) {
  return (
    <div className="turn fade-up">
      <div className="msg-user">
        <div className="bubble">{m.content}</div>
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
        <div className="msg-meta">
          <span className="chan-dot" style={{ background: "var(--brand-sky)" }} />
          <span>You</span>
        </div>
      </div>
    </div>
  );
}

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
  return (
    <div className="transcript">
      {messages.map((m) =>
        m.role === "user" ? (
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
        ),
      )}
      {thinking && (
        <div className="turn fade-up">
          <div className="msg-bot">
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
