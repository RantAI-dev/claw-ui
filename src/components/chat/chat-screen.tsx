"use client";

import * as React from "react";
import { PanelLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ProviderInfo, SessionSummary, StatusInfo } from "@/lib/types";
import { useChat } from "@/hooks/use-chat";
import { ChatView } from "./chat-view";
import { SessionList } from "@/components/sessions/session-list";

export function ChatScreen() {
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [status, setStatus] = React.useState<StatusInfo | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [readOnlyNotice, setReadOnlyNotice] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");

  const { messages, isStreaming, send, stop, reset, loadHistory } = useChat({
    provider: provider || undefined,
    model: model || undefined,
  });

  const refreshSessions = React.useCallback(async () => {
    try {
      const { sessions } = await api.sessions(100);
      setSessions(sessions);
    } catch {
      /* offline handled by status dot */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  React.useEffect(() => {
    refreshSessions();
    api.providers().then((r) => setProviders(r.providers)).catch(() => {});
    api.status().then(setStatus).catch(() => {});
  }, [refreshSessions]);

  // After a streamed turn finishes, the backend persisted a new session — refresh.
  const prevStreaming = React.useRef(false);
  React.useEffect(() => {
    if (prevStreaming.current && !isStreaming) refreshSessions();
    prevStreaming.current = isStreaming;
  }, [isStreaming, refreshSessions]);

  const handleSelect = async (id: string) => {
    setMobileOpen(false);
    try {
      const detail = await api.session(id);
      loadHistory(detail.messages);
      setActiveId(id);
      setReadOnlyNotice(
        "Viewing a saved session (read-only history). Sending a message starts a new conversation.",
      );
    } catch (e) {
      toast.error(`Could not load session: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleNew = () => {
    reset();
    setActiveId(null);
    setReadOnlyNotice(null);
    setMobileOpen(false);
  };

  const handleSend = (text: string) => {
    setReadOnlyNotice(null);
    setActiveId(null);
    send(text);
  };

  const handleRenamed = (id: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    toast.success("Session renamed");
  };

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
        />
      </div>

      {mobileOpen && (
        <div
          className="absolute inset-0 z-10 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
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
          <span className="truncate text-sm font-medium">
            {activeId ? sessions.find((s) => s.id === activeId)?.title || "Session" : "New chat"}
          </span>
        </header>

        <ChatView
          messages={messages}
          isStreaming={isStreaming}
          readOnlyNotice={readOnlyNotice}
          onSend={handleSend}
          onStop={stop}
          providers={providers}
          provider={provider}
          onProviderChange={setProvider}
          model={model}
          onModelChange={setModel}
          defaultProvider={status?.provider}
          defaultModel={status?.model}
        />
      </div>
    </div>
  );
}
