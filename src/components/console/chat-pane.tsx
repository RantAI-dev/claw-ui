"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ImageIcon,
  KeyRound,
  Library,
  Loader2,
  Paperclip,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { Attachment, ChatMessage, KbGroup, ProviderInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/ui/model-picker";
import { brand } from "@/lib/branding";
import { acceptAttr, imageAcceptAttr, ingestFile, MAX_BYTES, MAX_FILES } from "@/lib/attachments";
import type { Connection } from "@/hooks/use-gateway-status";
import { Transcript } from "./transcript";

let attachSeq = 0;
function nextAttachId() {
  attachSeq += 1;
  return `att-${attachSeq}-${Math.round(Math.random() * 1e6)}`;
}

const SUGGESTIONS = [
  "What can you help me with?",
  "Summarize my recent activity",
  "List the tools you have access to",
  "Run a quick health check",
];

export interface ChatPaneProps {
  conversationId: string;
  /** Reports up whether ≥1 attachment is ingested & ready (drives KB retrieval on send). */
  onAttachmentsReadyChange: (ready: boolean) => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  pending: boolean;
  onSend: (text: string, attachments?: string[]) => void;
  onStop: () => void;
  onRegenerate: () => void;
  agentName: string;
  agentInitials: string;
  modelTag: string;
  provider: string;
  providerLabel: string;
  serif: boolean;
  tracesOpen: boolean;
  renderMode: "md" | "gui";
  onAction: (value: string) => void;
  connection: Connection;
  needsAuth: boolean;
  connError: string | null;
  providers: ProviderInfo[];
  onProviderChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  defaultProvider?: string;
  defaultModel?: string;
  /** Knowledge bases available to attach to this conversation. */
  kbGroups: KbGroup[];
  /** KB ids selected for THIS conversation. */
  selectedKbIds: string[];
  /** Toggle a KB id in/out of this conversation's selection. */
  onToggleKb: (id: string) => void;
  /** KB ids the active persona always retrieves from (shown as locked-on). */
  alwaysOnKbIds: string[];
}

function ConnectionBanner({
  needsAuth,
  error,
}: {
  needsAuth: boolean;
  error: string | null;
}) {
  return (
    <div
      className={
        "flex items-start gap-2 border-b border-border px-7 py-2 font-mono text-[11px] " +
        (needsAuth
          ? "bg-[color-mix(in_oklab,var(--accent-orange)_8%,transparent)] text-[var(--accent-orange)]"
          : "bg-destructive/10 text-destructive")
      }
    >
      {needsAuth ? (
        <KeyRound className="mt-px size-3.5 flex-none" />
      ) : (
        <AlertTriangle className="mt-px size-3.5 flex-none" />
      )}
      <span>
        {needsAuth ? (
          <>Gateway requires pairing — register a token, then restart the daemon.</>
        ) : (
          <>Gateway unreachable. Start the agent gateway, then retry{error ? ` — ${error}` : ""}.</>
        )}
      </span>
    </div>
  );
}

export function ChatPane(props: ChatPaneProps) {
  const {
    conversationId,
    onAttachmentsReadyChange,
    messages,
    isStreaming,
    pending,
    onSend,
    onStop,
    onRegenerate,
    agentName,
    agentInitials,
    modelTag,
    provider,
    providerLabel,
    serif,
    tracesOpen,
    renderMode,
    onAction,
    connection,
    needsAuth,
    connError,
    model,
    onModelChange,
    defaultProvider,
    defaultModel,
    kbGroups,
    selectedKbIds,
    onToggleKb,
    alwaysOnKbIds,
  } = props;

  const [text, setText] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [kbOpen, setKbOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLInputElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const kbRef = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);

  // Close the KB picker on an outside click.
  React.useEffect(() => {
    if (!kbOpen) return;
    const onDown = (e: MouseEvent) => {
      if (kbRef.current && !kbRef.current.contains(e.target as Node)) setKbOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [kbOpen]);

  const alwaysOnSet = React.useMemo(() => new Set(alwaysOnKbIds), [alwaysOnKbIds]);
  // Count of bases active for this turn = explicit selection + persona always-on.
  const activeKbCount = React.useMemo(
    () => new Set([...selectedKbIds, ...alwaysOnKbIds]).size,
    [selectedKbIds, alwaysOnKbIds],
  );

  // Report up whenever the count of READY attachments changes, so the shell knows
  // whether to run KB retrieval on the next send.
  const readyCount = attachments.filter((a) => a.status === "ready").length;
  React.useEffect(() => {
    onAttachmentsReadyChange(readyCount > 0);
  }, [readyCount, onAttachmentsReadyChange]);

  const patchAttachment = React.useCallback((id: string, fn: (a: Attachment) => Attachment) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? fn(a) : a)));
  }, []);

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const pickFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const slots = MAX_FILES - attachments.length;
      if (slots <= 0) return;
      const chosen = Array.from(files).slice(0, slots);
      for (const file of chosen) {
        const id = nextAttachId();
        if (file.size > MAX_BYTES) {
          setAttachments((prev) => [
            ...prev,
            { id, name: file.name, chunks: 0, status: "error", error: "Too large (max 20 MB)" },
          ]);
          continue;
        }
        setAttachments((prev) => [...prev, { id, name: file.name, chunks: 0, status: "uploading" }]);
        try {
          const { chunks_stored } = await ingestFile(file, conversationId);
          patchAttachment(id, (a) => ({ ...a, status: "ready", chunks: chunks_stored }));
        } catch (e) {
          patchAttachment(id, (a) => ({
            ...a,
            status: "error",
            error: e instanceof Error ? e.message : "Upload failed",
          }));
        }
      }
    },
    [attachments.length, conversationId, patchAttachment],
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);
  React.useEffect(grow, [text, grow]);

  const submit = (value?: string) => {
    const v = (value ?? text).trim();
    if (!v || isStreaming) return;
    const docNames = attachments.filter((a) => a.status === "ready").map((a) => a.name);
    onSend(v, docNames.length ? docNames : undefined);
    if (value == null) {
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
    }
    // Return focus to the composer: the Send button disables itself the instant
    // the text clears, which would otherwise blur it and strand keyboard focus.
    taRef.current?.focus();
    // Keep ready attachments visible as a persistent indicator — they stay in
    // the KB for this whole conversation and are re-retrieved every turn. Drop
    // only failed/in-flight chips. (Cleared on a new chat via the conversationId key.)
    setAttachments((prev) => prev.filter((a) => a.status === "ready"));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore Enter while an IME composition is active (CJK etc.) — otherwise
    // confirming a candidate would send a half-composed message.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const empty = messages.length === 0;
  const last = messages[messages.length - 1];
  const canRegenerate = !isStreaming && !pending && last?.role === "assistant" && (!!last.content || !!last.error);

  return (
    <>
      {connection === "offline" && <ConnectionBanner needsAuth={needsAuth} error={connError} />}

      <div className="scroll-area" ref={scrollRef} onScroll={onScroll}>
        {empty ? (
          <div className="chat-empty">
            <div className="ce-mark">
              <Sparkles className="size-6" />
            </div>
            <div>
              <h2>How can I help?</h2>
              <p>Start a conversation with your {brand.name} agent.</p>
            </div>
            <div className="ce-grid">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ce-chip" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Transcript
            messages={messages}
            agentName={agentName}
            agentInitials={agentInitials}
            modelTag={modelTag}
            serif={serif}
            tracesOpen={tracesOpen}
            thinking={pending}
            renderMode={renderMode}
            onAction={onAction}
          />
        )}

        {canRegenerate && (
          <div className="mx-auto flex max-w-[780px] justify-center px-7 pb-2">
            <Button variant="outline" size="sm" onClick={onRegenerate}>
              <RotateCcw /> Regenerate
            </Button>
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer-inner">
          <div className="composer">
            {attachments.length > 0 && (
              <div className="attach-chips">
                {attachments.map((a) => (
                  <span key={a.id} className={"attach-chip " + a.status} title={a.error || a.name}>
                    {a.status === "uploading" ? (
                      <Loader2 className="spin" />
                    ) : a.status === "error" ? (
                      <AlertTriangle />
                    ) : (
                      <Paperclip />
                    )}
                    <span className="attach-name">{a.name}</span>
                    <span className="attach-state">
                      {a.status === "uploading"
                        ? "uploading…"
                        : a.status === "error"
                          ? a.error || "error"
                          : `${a.chunks} chunk${a.chunks === 1 ? "" : "s"}`}
                    </span>
                    <button
                      type="button"
                      className="attach-x"
                      title="Remove"
                      onClick={() => removeAttachment(a.id)}
                    >
                      <X />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label={`Message ${agentName}`}
              placeholder={`Message ${agentName}…  (⏎ to send, ⇧⏎ for newline)`}
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={acceptAttr()}
              className="hidden"
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = ""; // allow re-picking the same file
              }}
            />
            <input
              ref={imageRef}
              type="file"
              multiple
              accept={imageAcceptAttr()}
              className="hidden"
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="composer-bar">
              <button
                type="button"
                className="cchip"
                aria-label="Attach a document"
                title={
                  attachments.length >= MAX_FILES
                    ? `Max ${MAX_FILES} attachments`
                    : "Attach a document"
                }
                onClick={() => fileRef.current?.click()}
                disabled={attachments.length >= MAX_FILES}
              >
                <Paperclip />
              </button>
              <button
                type="button"
                className="cchip"
                aria-label="Attach an image"
                title={
                  attachments.length >= MAX_FILES
                    ? `Max ${MAX_FILES} attachments`
                    : "Attach an image"
                }
                onClick={() => imageRef.current?.click()}
                disabled={attachments.length >= MAX_FILES}
              >
                <ImageIcon />
              </button>

              {/* Per-chat knowledge base picker. */}
              <div className="kb-pick" ref={kbRef}>
                <button
                  type="button"
                  className={"cchip" + (activeKbCount > 0 ? " input" : "")}
                  aria-label="Knowledge bases for this chat"
                  aria-haspopup="menu"
                  aria-expanded={kbOpen}
                  title="Knowledge bases for this chat"
                  onClick={() => setKbOpen((o) => !o)}
                  style={activeKbCount > 0 ? { color: "var(--brand-sky)", borderColor: "var(--brand-sky)" } : undefined}
                >
                  <Library />
                  {activeKbCount > 0 && <span>{activeKbCount} KB</span>}
                </button>
                {kbOpen && (
                  <div className="kb-menu">
                    <div className="kb-menu-head">Knowledge bases</div>
                    {kbGroups.length === 0 ? (
                      <div className="kb-menu-empty">No knowledge bases yet.</div>
                    ) : (
                      kbGroups.map((g) => {
                        const locked = alwaysOnSet.has(g.id);
                        const on = locked || selectedKbIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            className={"kb-opt" + (on ? " on" : "")}
                            onClick={() => !locked && onToggleKb(g.id)}
                            disabled={locked}
                            title={locked ? "Always on for this persona" : g.description || g.name}
                          >
                            <span
                              className="kb-dot"
                              style={{ background: g.color || "var(--brand-sky)" }}
                            />
                            <span className="kb-opt-name">{g.name}</span>
                            {locked ? (
                              <span className="kb-opt-tag">always on</span>
                            ) : on ? (
                              <Check className="kb-opt-check" />
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <span
                className="cchip readonly"
                title="Provider is set on the agent — switch it in Configuration"
              >
                {defaultProvider || providerLabel}
              </span>
              <ModelPicker
                provider={provider || defaultProvider || ""}
                value={model}
                onChange={onModelChange}
                defaultModel={defaultModel}
                compact
                className="min-w-[7rem]"
              />

              {/* One stable button that toggles Send⇄Stop — swapping two separate
                  elements dropped keyboard focus on the transition. */}
              <button
                type="button"
                className={"send-btn" + (isStreaming ? " stop" : "")}
                onClick={isStreaming ? onStop : () => submit()}
                disabled={!isStreaming && !text.trim()}
                aria-label={isStreaming ? "Stop generating" : "Send message"}
              >
                {isStreaming ? (
                  <>
                    Stop <Square />
                  </>
                ) : (
                  <>
                    Send <ArrowUp />
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="composer-hint">
            <span>
              <span className="kbd">⇧⇥</span> cycle autonomy
            </span>
            <span>
              <span className="kbd">⏎</span> send
            </span>
            <span className="ml-auto">
              {providerLabel} · {modelTag || defaultModel || "default"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
