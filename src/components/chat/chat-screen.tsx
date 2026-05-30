"use client";

import * as React from "react";
import { PanelLeft, PanelRight, X, AlertTriangle, KeyRound, Coins } from "lucide-react";
import { toast } from "sonner";
import { cn, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ProviderInfo, SessionSummary } from "@/lib/types";
import { useChat } from "@/hooks/use-chat";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { ChatView } from "./chat-view";
import { ContextPanel } from "./context-panel";
import { SessionList } from "@/components/sessions/session-list";

function ConnectionBanner({
  needsAuth,
  error,
}: {
  needsAuth: boolean;
  error: string | null;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b px-4 py-2 text-xs",
        needsAuth
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      {needsAuth ? <KeyRound className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
      <div className="min-w-0">
        {needsAuth ? (
          <>
            <span className="font-medium">Gateway requires pairing.</span> Run{" "}
            <code className="rounded bg-warning/10 px-1">node scripts/setup-minimax.mjs</code> to register a token, then restart.
          </>
        ) : (
          <>
            <span className="font-medium">Gateway unreachable.</span> Start it with{" "}
            <code className="rounded bg-destructive/10 px-1">rantaiclaw gateway -p 3000</code>
            {error ? <span className="opacity-70"> — {error}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

export function ChatScreen() {
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [showContext, setShowContext] = React.useState(true);

  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");

  const { status, connection, needsAuth, error } = useGatewayStatus();
  const { messages, isStreaming, sessionId, send, regenerate, stop, reset, loadHistory, totals } = useChat({
    provider: provider || undefined,
    model: model || undefined,
  });

  const refreshSessions = React.useCallback(async () => {
    try {
      const { sessions } = await api.sessions(100);
      setSessions(sessions);
    } catch {
      /* surfaced by the connection banner */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  React.useEffect(() => {
    refreshSessions();
    api.providers().then((r) => setProviders(r.providers)).catch(() => {});
  }, [refreshSessions]);

  const prevStreaming = React.useRef(false);
  React.useEffect(() => {
    if (prevStreaming.current && !isStreaming) refreshSessions();
    prevStreaming.current = isStreaming;
  }, [isStreaming, refreshSessions]);

  // Keep the sidebar highlight on the conversation we're actually in (incl. a
  // freshly-created session whose id the backend returned mid-stream).
  React.useEffect(() => {
    if (sessionId) setActiveId(sessionId);
  }, [sessionId]);

  const handleSelect = async (id: string) => {
    setMobileOpen(false);
    try {
      const detail = await api.session(id);
      loadHistory(detail.messages, detail.id);
      setActiveId(detail.id);
    } catch (e) {
      toast.error(`Could not load session: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleNew = () => {
    reset();
    setActiveId(null);
    setMobileOpen(false);
  };

  const handleSend = (text: string) => {
    setActiveId(null);
    send(text);
  };

  const handleRenamed = (id: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    toast.success("Session renamed");
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) handleNew();
      toast.success("Session deleted");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const effectiveProvider = provider || status?.provider || "";
  const effectiveModel = model || status?.model || "";

  return (
    <div className="relative flex h-full min-h-0">
      {/* Sessions panel */}
      <div
        className={cn(
          "z-20 flex w-72 shrink-0 flex-col border-r border-border bg-card md:relative md:flex",
          mobileOpen ? "absolute inset-y-0 left-0 flex" : "hidden",
        )}
      >
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute right-2 top-2 z-10 rounded-md p-1 text-muted-foreground hover:bg-secondary md:hidden cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}
        <SessionList
          sessions={sessions}
          loading={loadingSessions}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onRenamed={handleRenamed}
          onDelete={handleDelete}
        />
      </div>

      {mobileOpen && (
        <div className="absolute inset-0 z-10 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary md:hidden cursor-pointer"
          >
            <PanelLeft className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {activeId ? sessions.find((s) => s.id === activeId)?.title || "Session" : "New chat"}
          </span>
          {totals.tokens > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
              <Coins className="size-3" /> {formatNumber(totals.tokens)}
            </span>
          )}
          <button
            onClick={() => setShowContext((v) => !v)}
            className={cn(
              "hidden rounded-md p-1.5 transition-colors lg:block cursor-pointer",
              showContext ? "text-foreground" : "text-muted-foreground hover:bg-secondary",
            )}
            title="Toggle details panel"
          >
            <PanelRight className="size-4" />
          </button>
        </header>

        {connection === "offline" && <ConnectionBanner needsAuth={needsAuth} error={error} />}

        <ChatView
          messages={messages}
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={stop}
          onRegenerate={regenerate}
          providers={providers}
          provider={provider}
          onProviderChange={setProvider}
          model={model}
          onModelChange={setModel}
          defaultProvider={status?.provider}
          defaultModel={status?.model}
        />
      </div>

      {/* Context panel (right) */}
      {showContext && (
        <div className="hidden w-72 shrink-0 border-l border-border bg-card lg:flex">
          <ContextPanel
            messages={messages}
            totals={totals}
            sessionId={sessionId}
            effectiveModel={effectiveModel}
            effectiveProvider={effectiveProvider}
            onClose={() => setShowContext(false)}
          />
        </div>
      )}
    </div>
  );
}
