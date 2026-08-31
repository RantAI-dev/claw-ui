"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ImageIcon,
  KeyRound,
  Library,
  Loader2,
  Paperclip,
  RotateCcw,
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

export function ConnectionBanner({
  needsAuth,
  error,
}: {
  needsAuth: boolean;
  error: string | null;
}) {
  // The BFF's own Host-allowlist 403 (`proxy.ts`), not a gateway failure —
  // telling the operator to restart the gateway would point them at the
  // wrong subsystem entirely. Only rendered client-side (the banner appears
  // after a status poll fails), so `window` is safe here.
  const blockedHost = error?.includes("unexpected_host")
    ? window.location.hostname
    : null;
  return (
    <div
      className={
        // Foreground text on the tint: the tone colours alone sit at 4.0:1 at
        // this size, so the tone lives in the icon and the background.
        "flex items-start gap-2 border-b border-border px-7 py-2 text-xs text-foreground " +
        (needsAuth
          ? "bg-[color-mix(in_oklab,var(--accent-orange)_8%,transparent)]"
          : "bg-destructive/10")
      }
    >
      {needsAuth ? (
        <KeyRound className="mt-px size-3.5 flex-none text-[var(--accent-orange)]" />
      ) : (
        <AlertTriangle className="mt-px size-3.5 flex-none text-destructive" />
      )}
      <span>
        {needsAuth ? (
          <>Gateway requires pairing. Register a token, then restart the daemon.</>
        ) : blockedHost ? (
          <>
            Console reached via unlisted host “{blockedHost}”. Add it to
            RANTAICLAW_UI_ALLOWED_HOSTS and restart the console, or open via
            localhost.
          </>
        ) : (
          <>Gateway unreachable. Start the agent gateway, then retry{error ? ` (${error})` : ""}.</>
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
  const [detached, setDetached] = React.useState(false);

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

  // Two representations of the same fact, on purpose: the ref is what the
  // per-token effect below reads (no re-render), the state is what draws the
  // jump-to-latest pill. Only flipping the state keeps a fast token stream from
  // re-rendering the console on every scroll event.
  const setFollowing = React.useCallback((v: boolean) => {
    if (atBottom.current === v) return;
    atBottom.current = v;
    setDetached(!v);
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 140);
  };

  // An upward wheel/trackpad gesture is an explicit "let me read this". Honour
  // it here rather than waiting for the scroll event, which during a fast
  // stream can lose the race against the auto-scroll effect and get clobbered
  // before it is read. Scrollbar drags have no wheel event and are covered by
  // `onScroll` above.
  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) setFollowing(false);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollowing(true);
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

  // An attachment still uploading has not reached the KB yet. Sending now drops
  // its chip (see the filter at the end of submit), so when `ingestFile`
  // resolves, `patchAttachment` maps over a list that no longer holds that id
  // and does nothing — `readyCount` never rises, the ready-latch never fires,
  // and `retrieveContext` short-circuits for every remaining turn. The document
  // lands in the KB and the agent never sees it, with no error shown.
  const uploading = attachments.some((a) => a.status === "uploading");

  const submit = (value?: string) => {
    const v = (value ?? text).trim();
    if (!v || isStreaming || uploading) return;
    const docNames = attachments.filter((a) => a.status === "ready").map((a) => a.name);
    // Sending is a request to watch the reply — re-attach even if the operator
    // had scrolled back to read something older.
    setFollowing(true);
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

      <div className="scroll-area" ref={scrollRef} onScroll={onScroll} onWheel={onWheel}>
        {empty ? (
          <div className="chat-empty">
            <Image className="ce-mark" src={brand.logo} alt="" width={52} height={52} unoptimized />
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

      {detached && !empty && (
        <button className="jump-latest" onClick={jumpToLatest}>
          <ArrowDown />
          {isStreaming ? "Jump to latest (still writing)" : "Jump to latest"}
        </button>
      )}

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
              placeholder={`Message ${agentName}…`}
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
                title="Provider is set on the agent. Switch it in Configuration."
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
                disabled={!isStreaming && (!text.trim() || uploading)}
                aria-label={isStreaming ? "Stop generating" : "Send message"}
                title={uploading ? "Waiting for the attachment to finish uploading" : undefined}
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
              {providerLabel} · {modelTag || defaultModel || "no model set"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
