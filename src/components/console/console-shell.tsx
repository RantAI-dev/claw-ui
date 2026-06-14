"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { brand } from "@/lib/branding";
import { relativeTime } from "@/lib/utils";
import {
  ACCENTS,
  AUTONOMY,
  DEFAULT_ACCENT,
  autonomyPreset,
  channelDot,
  initials,
  levelToRung,
  NAV,
  ROUTE_META,
  type Route,
  rungToAutonomyPayload,
} from "@/lib/console";
import type { KbGroup, Personality, ProviderInfo, SessionSummary } from "@/lib/types";
import { kbSearch } from "@/lib/attachments";
import { useChat } from "@/hooks/use-chat";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { Modal } from "@/components/ui/modal";
import { ChatPane } from "./chat-pane";
import { OpsView } from "./ops-view";
import { RightPanel } from "./right-panel";
import { TweaksPanel, TWEAK_DEFAULTS, type Tweaks } from "./tweaks";

const TWEAKS_KEY = "rc_console_tweaks";
const RAIL_KEY = "rc_console_rail";

export function ConsoleShell({
  initialRoute = "chat",
  initialSessionId,
}: {
  initialRoute?: Route;
  initialSessionId?: string;
}) {
  const { status, connection, error, needsAuth } = useGatewayStatus();

  const [route, setRoute] = React.useState<Route>(initialRoute);
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string | null>(initialSessionId ?? null);
  const [sessQuery, setSessQuery] = React.useState("");

  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [channels, setChannels] = React.useState<string[]>([]);
  const [skills, setSkills] = React.useState<string[]>([]);
  const [personality, setPersonality] = React.useState<Personality | null>(null);
  const [temperature, setTemperature] = React.useState("");
  const [mcpCount, setMcpCount] = React.useState(0);

  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");

  const [tweaks, setTweaks] = React.useState<Tweaks>(TWEAK_DEFAULTS);
  const [autonomy, setAutonomyState] = React.useState("smart");
  const autonomySeeded = React.useRef(false);
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [authOn, setAuthOn] = React.useState(false);

  const renderMode: "md" | "gui" = tweaks.render === "Generative UI" ? "gui" : "md";

  // Latch: has THIS conversation ever ingested an attachment? Once true, KB
  // retrieval stays enabled for the conversation (the docs persist in the gateway
  // KB even after the composer chips are cleared on send). Reset on new/load chat.
  const [hasReadyAttachments, setHasReadyAttachments] = React.useState(false);
  const hasReadyRef = React.useRef(false);
  hasReadyRef.current = hasReadyAttachments;
  const markAttachmentsReady = React.useCallback((ready: boolean) => {
    if (ready) setHasReadyAttachments(true); // latch on; only the reset paths clear it
  }, []);

  // Knowledge bases (groups) available for the per-chat picker.
  const [kbGroups, setKbGroups] = React.useState<KbGroup[]>([]);
  // KB ids selected for the CURRENT conversation (reset on new/load chat).
  const [selectedKbIds, setSelectedKbIds] = React.useState<string[]>([]);

  // Refs so the stable retrieveContext callback reads current selections/persona
  // without being re-created (which would churn useChat's options).
  const selectedKbRef = React.useRef<string[]>(selectedKbIds);
  selectedKbRef.current = selectedKbIds;
  const alwaysOnKbRef = React.useRef<string[]>([]);

  // KB retrieval for the send path. Runs when ready attachments exist OR any KB
  // group is in play (per-chat selection ∪ persona always-on). The group union is
  // sent to the gateway; the per-conversation attachment scope (`category`) is
  // always included by kbSearch. Stable identity so useChat opts stay steady.
  const retrieveContext = React.useCallback(async (userText: string, conversationId: string) => {
    const groups = Array.from(new Set([...selectedKbRef.current, ...alwaysOnKbRef.current]));
    if (!hasReadyRef.current && groups.length === 0) return { context: "", sources: [] };
    const { context, sources } = await kbSearch(userText, conversationId, groups);
    // Dedupe document titles for the citation chips.
    const titles = Array.from(
      new Set(sources.map((s) => s.document_title).filter((t): t is string => !!t)),
    );
    return { context, sources: titles };
  }, []);

  const chat = useChat({
    provider: provider || undefined,
    model: model || undefined,
    renderMode,
    retrieveContext,
  });

  // ---- persisted UI prefs ----
  React.useEffect(() => {
    try {
      const t = localStorage.getItem(TWEAKS_KEY);
      if (t) setTweaks({ ...TWEAK_DEFAULTS, ...JSON.parse(t) });
    } catch {
      /* ignore */
    }
    setRailCollapsed(localStorage.getItem(RAIL_KEY) === "1");
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAuthOn(!!d.enabled))
      .catch(() => {});
  }, []);

  const setTweak = React.useCallback(<K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
    setTweaks((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(TWEAKS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleRail = () =>
    setRailCollapsed((c) => {
      const next = !c;
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      return next;
    });

  // ---- data ----
  const refreshSessions = React.useCallback(async () => {
    try {
      const { sessions } = await api.sessions(100);
      setSessions(sessions);
    } catch {
      /* surfaced by banner */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  React.useEffect(() => {
    refreshSessions();
    api.providers().then((r) => setProviders(r.providers)).catch(() => {});
    api.channels().then((r) => setChannels(r.configured || [])).catch(() => {});
    api
      .skills()
      .then((r) => setSkills((r.skills || []).filter((s) => s.enabled !== false).map((s) => s.name)))
      .catch(() => {});
    api
      .personality()
      .then((p) => {
        setPersonality(p);
        alwaysOnKbRef.current = Array.isArray(p.always_on_kbs) ? p.always_on_kbs : [];
      })
      .catch(() => {});
    api.kbGroups().then(setKbGroups).catch(() => {});
    api
      .config()
      .then((c) => {
        const t = c?.default_temperature;
        if (t != null) setTemperature(String(t));
        const mcp = c?.mcp_servers;
        if (mcp && typeof mcp === "object") setMcpCount(Object.keys(mcp).length);
        // Seed the autonomy rung from the authoritative config (level + always_ask).
        const auto = c?.autonomy as { level?: string; always_ask?: string[] } | undefined;
        if (auto && !autonomySeeded.current) {
          autonomySeeded.current = true;
          setAutonomyState(levelToRung(auto.level, auto.always_ask?.length || 0));
        }
      })
      .catch(() => {});
  }, [refreshSessions]);

  // Persist an autonomy rung change to the gateway (maps 4 rungs → real level + always_ask).
  const autonomyRef = React.useRef(autonomy);
  autonomyRef.current = autonomy;
  const changeAutonomy = React.useCallback((rung: string) => {
    setAutonomyState(rung);
    api
      .setAutonomy(rungToAutonomyPayload(rung))
      .then(() => toast.success(`Autonomy → ${autonomyPreset(rung).label}`))
      .catch((e) => toast.error(`Autonomy update failed: ${e instanceof Error ? e.message : e}`));
  }, []);

  // Refresh the session list after a turn finishes streaming.
  const prevStreaming = React.useRef(false);
  React.useEffect(() => {
    if (prevStreaming.current && !chat.isStreaming) refreshSessions();
    prevStreaming.current = chat.isStreaming;
  }, [chat.isStreaming, refreshSessions]);

  // Keep the rail highlight on the conversation we're actually in.
  React.useEffect(() => {
    if (chat.sessionId) setActiveId(chat.sessionId);
  }, [chat.sessionId]);

  // Deep-link routes via the URL hash (e.g. /ops#tools), and keep it in sync.
  React.useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h && NAV.some((n) => n.id === h)) setRoute(h as Route);
  }, []);
  // Reflect the active conversation in the URL so chats are deep-linkable and
  // survive a refresh: /chat/<sessionId> in chat, #<tab> for ops routes.
  React.useEffect(() => {
    if (route === "chat") {
      window.history.replaceState(null, "", activeId ? `/chat/${activeId}` : "/chat");
    } else {
      window.history.replaceState(null, "", `#${route}`);
    }
  }, [route, activeId]);

  // ⇧⇥ cycles autonomy (and persists).
  React.useEffect(() => {
    const order = AUTONOMY.map((p) => p.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const next = order[(order.indexOf(autonomyRef.current) + 1) % order.length];
        changeAutonomy(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeAutonomy]);

  // ---- handlers ----
  const handleSelect = async (id: string) => {
    try {
      const detail = await api.session(id);
      chat.loadHistory(detail.messages, detail.id);
      setActiveId(detail.id);
      setHasReadyAttachments(false);
      setSelectedKbIds([]);
      setRoute("chat");
    } catch (e) {
      toast.error(`Could not load session: ${e instanceof Error ? e.message : e}`);
    }
  };

  // On a direct load / refresh of /chat/<id>, load that conversation once.
  const didInitSession = React.useRef(false);
  React.useEffect(() => {
    if (initialSessionId && !didInitSession.current) {
      didInitSession.current = true;
      handleSelect(initialSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const handleNew = () => {
    chat.reset();
    setActiveId(null);
    setHasReadyAttachments(false);
    setSelectedKbIds([]);
    setRoute("chat");
  };

  const toggleKb = React.useCallback((id: string) => {
    setSelectedKbIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) handleNew();
      toast.success("Session deleted");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  // ---- derived ----
  const accent = ACCENTS[tweaks.accent] || ACCENTS[DEFAULT_ACCENT];
  const dense = tweaks.density === "Compact";
  const showRight = tweaks.rightPanel && route === "chat";
  const appClass =
    "app" + (showRight ? "" : " no-right") + (railCollapsed ? " no-rail" : "") + (dense ? " dense" : "");

  const agentName = personality?.name?.trim() || "Atlas";
  const agentRole = personality?.role?.trim() || "AI employee";
  const agentInitials = initials(agentName);

  const effectiveProvider = provider || status?.provider || "";
  const effectiveModel = model || status?.model || "";
  const modelTag = effectiveModel ? effectiveModel.split("/").pop() || effectiveModel : "";

  const navCount = (id: Route): number | undefined => {
    if (id === "channels") return channels.length || undefined;
    if (id === "skills") return skills.length || undefined;
    if (id === "mcp") return mcpCount || undefined;
    return undefined;
  };

  const filteredSessions = React.useMemo(() => {
    const q = sessQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title || "").toLowerCase().includes(q));
  }, [sessions, sessQuery]);

  const activeSession = sessions.find((s) => s.id === activeId);
  const cur = autonomyPreset(autonomy);

  const connPill =
    connection === "online"
      ? { color: "var(--accent-green)", label: "Daemon live" }
      : connection === "connecting"
        ? { color: "var(--accent-orange)", label: "Connecting…" }
        : { color: "var(--destructive)", label: "Gateway offline" };

  return (
    <div className={appClass} style={{ "--brand-sky": accent.sky, "--brand-deep-blue": accent.deep } as React.CSSProperties}>
      {/* ===== Rail ===== */}
      {!railCollapsed && (
        <aside className="rail">
          <div className="rail-head">
            <Image
              className="rail-mark"
              src={brand.logo}
              alt=""
              width={30}
              height={30}
              priority
              unoptimized
            />
            <div className="rail-word">
              <b>
                {brand.wordmark[0]}
                <span>{brand.wordmark[1]}</span>
              </b>
              <small>{brand.sub}</small>
            </div>
          </div>

          <div className="rail-scroll">
            <div className="nav-group">
              {NAV.map((n) => {
                const Icon = n.icon;
                const count = navCount(n.id);
                return (
                  <button
                    key={n.id}
                    className={"nav-item" + (route === n.id ? " active" : "")}
                    onClick={() => setRoute(n.id)}
                  >
                    <Icon />
                    <span>{n.label}</span>
                    {count != null && <span className="nav-count">{count}</span>}
                  </button>
                );
              })}
            </div>

            {route === "chat" && (
              <div className="nav-group">
                <div className="nav-cap eyebrow" style={{ display: "flex", alignItems: "center" }}>
                  <span>Recent Sessions</span>
                  <button
                    className="sess-x"
                    style={{ marginLeft: "auto", opacity: 1 }}
                    title="New chat"
                    onClick={handleNew}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                <div className="search" style={{ margin: "0 8px 8px" }}>
                  <Search />
                  <input
                    value={sessQuery}
                    onChange={(e) => setSessQuery(e.target.value)}
                    placeholder="Search sessions…"
                  />
                </div>
                <div className="sess">
                  {loadingSessions ? (
                    <div className="auto-blurb" style={{ padding: "4px 10px" }}>
                      Loading sessions…
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <div className="auto-blurb" style={{ padding: "4px 10px" }}>
                      {sessions.length === 0 ? "No sessions yet." : "No matches."}
                    </div>
                  ) : (
                    filteredSessions.map((s) => (
                      <div
                        key={s.id}
                        className={"sess-item" + (s.id === activeId ? " active" : "")}
                        onClick={() => handleSelect(s.id)}
                      >
                        <div className="sess-row">
                          <span className="chan-dot" style={{ background: channelDot(s.model || "") }} />
                          <span className="sess-title">{s.title || "Untitled session"}</span>
                          <span className="sess-x" onClick={(e) => handleDelete(s.id, e)} title="Delete">
                            <X style={{ width: 13, height: 13 }} />
                          </span>
                        </div>
                        <div className="sess-meta">
                          <span>{s.message_count} msgs</span>
                          <span>·</span>
                          <span>{relativeTime(s.started_at) || "new"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rail-foot">
            <div className="agent-card">
              <div className="agent-ava">
                {agentInitials}
                <span className={"live" + (connection === "online" ? "" : " off")} />
              </div>
              <div className="agent-meta">
                <b>{agentName}</b>
                <div>{agentRole}</div>
              </div>
            </div>

            <div className="auto-pick">
              <div className="eyebrow">
                <span>Autonomy</span>
                <span className="kbd">⇧⇥</span>
              </div>
              <div className="seg">
                {AUTONOMY.map((p) => (
                  <button
                    key={p.id}
                    className={p.id === autonomy ? "on" : ""}
                    style={p.id === autonomy ? { background: p.dot } : undefined}
                    onClick={() => changeAutonomy(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="auto-blurb">{cur.blurb}</div>
            </div>
          </div>
        </aside>
      )}

      {/* ===== Main ===== */}
      <main className="main">
        <div className="topbar">
          <button
            className="icon-btn"
            onClick={toggleRail}
            title={railCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {railCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>

          {route === "chat" ? (
            <>
              <h1>{activeId ? activeSession?.title || "Session" : "New conversation"}</h1>
              {chat.sessionId && (
                <span className="crumb">
                  <span className="chan-dot" style={{ background: "var(--brand-sky)" }} />
                  session {chat.sessionId.slice(0, 8)}
                </span>
              )}
            </>
          ) : (
            <h1>{ROUTE_META[route].title}</h1>
          )}

          <div className="topbar-spacer" />

          <span className="pill">
            <span className="chan-dot" style={{ background: connPill.color }} />
            {connPill.label}
          </span>

          {route === "chat" && (
            <button className="icon-btn" onClick={handleNew} title="New chat">
              <Plus />
            </button>
          )}
          {route === "chat" && (
            <button
              className="icon-btn"
              onClick={() => setTweak("rightPanel", !tweaks.rightPanel)}
              title="Toggle context panel"
              style={tweaks.rightPanel ? { color: "var(--foreground)" } : undefined}
            >
              <PanelRight />
            </button>
          )}
          <button className="icon-btn" onClick={() => setTweaksOpen(true)} title="Tweaks">
            <SlidersHorizontal />
          </button>
          {authOn && (
            <button className="icon-btn" onClick={logout} title="Sign out">
              <LogOut />
            </button>
          )}
        </div>

        {route === "chat" ? (
          <ChatPane
            key={chat.conversationId}
            conversationId={chat.conversationId}
            onAttachmentsReadyChange={markAttachmentsReady}
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            pending={chat.isStreaming && !chat.messages[chat.messages.length - 1]?.content && !(chat.messages[chat.messages.length - 1]?.toolCalls?.length)}
            onSend={chat.send}
            onStop={chat.stop}
            onRegenerate={chat.regenerate}
            agentName={agentName}
            agentInitials={agentInitials}
            modelTag={modelTag}
            provider={provider}
            providerLabel={effectiveProvider || "default"}
            serif={tweaks.voice === "Serif"}
            tracesOpen={tweaks.traces === "Expanded"}
            renderMode={renderMode}
            onAction={chat.send}
            connection={connection}
            needsAuth={needsAuth}
            connError={error}
            providers={providers}
            onProviderChange={setProvider}
            model={model}
            onModelChange={setModel}
            defaultProvider={status?.provider}
            defaultModel={status?.model}
            kbGroups={kbGroups}
            selectedKbIds={selectedKbIds}
            onToggleKb={toggleKb}
            alwaysOnKbIds={personality?.always_on_kbs || []}
          />
        ) : (
          <OpsView route={route} />
        )}
      </main>

      {/* ===== Right context panel ===== */}
      {showRight && (
        <RightPanel
          data={{
            model: effectiveModel,
            provider: effectiveProvider,
            temperature,
            autonomy,
            version: status?.version || "",
            paired: !!status?.paired,
            channels,
            skills,
            sessionId: chat.sessionId,
            totals: chat.totals,
          }}
          onCollapse={() => setTweak("rightPanel", false)}
        />
      )}

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} setTweak={setTweak} />

      {/* In-browser tool-approval modal (WebModal backend). Shown when the agent
          pauses on a tool that needs approval; Approve/Deny resumes the turn. */}
      <Modal
        open={!!chat.pendingApproval}
        onClose={() =>
          chat.pendingApproval && chat.resolveApproval(chat.pendingApproval.id, false)
        }
        title="🔧 Approve tool?"
        description={
          chat.pendingApproval
            ? `The agent wants to run the “${chat.pendingApproval.tool}” tool.`
            : undefined
        }
        footer={
          chat.pendingApproval ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => chat.resolveApproval(chat.pendingApproval!.id, false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9,
                  border: 0,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "#ef4444",
                  color: "#fff",
                }}
              >
                Deny
              </button>
              <button
                onClick={() => chat.resolveApproval(chat.pendingApproval!.id, true)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9,
                  border: 0,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "#10b981",
                  color: "#fff",
                }}
              >
                Approve
              </button>
            </div>
          ) : null
        }
      >
        {chat.pendingApproval ? (
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: "rgba(0,0,0,0.25)",
              fontSize: 12.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(chat.pendingApproval.args, null, 2)}
          </pre>
        ) : null}
      </Modal>
    </div>
  );
}
