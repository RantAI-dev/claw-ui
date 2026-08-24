"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { brand } from "@/lib/branding";
import { relativeTime } from "@/lib/utils";
import {
  ACCENTS,
  AUTONOMY,
  DEFAULT_ACCENT,
  autonomyPreset,
  channelDot,
  autonomyReadIsStale,
  initials,
  levelToRung,
  NAV,
  nextCycledRung,
  shiftTabCyclesAutonomy,
  ROUTE_META,
  type Route,
  resolveHashRoute,
  rungToAutonomyPayload,
  SKILLS_CHANGED,
} from "@/lib/console";
import type {
  KbGroup,
  Personality,
  ProviderInfo,
  SessionSummary,
} from "@/lib/types";
import { kbSearch } from "@/lib/attachments";
import { useChat } from "@/hooks/use-chat";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ChatPane } from "./chat-pane";
import { OpsView } from "./ops-view";
import { RightPanel } from "./right-panel";
import { TweaksPanel, TWEAK_DEFAULTS, type Tweaks } from "./tweaks";

const TWEAKS_KEY = "rc_console_tweaks";
const RAIL_KEY = "rc_console_rail";
/** Cap on a hand-typed session title. Auto-derived ones top out around 51
 *  characters, so this leaves headroom without letting a whole paragraph into
 *  the rail. */
const MAX_TITLE_LEN = 120;
/** How often to re-read the shared autonomy setting from the gateway. Deliberately
 *  slower than the 15s status poll — this follows an operator flipping a preset in
 *  the TUI or CLI, not a live metric. */
const AUTONOMY_POLL_MS = 30000;

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
  const [sessionsError, setSessionsError] = React.useState<string | null>(null);
  // Whether the last page returned a full limit (so an older page may exist).
  const [hasMoreSessions, setHasMoreSessions] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const SESSIONS_PAGE = 100;
  // Server-side search results, or null when the search box is empty.
  const [searchResults, setSearchResults] = React.useState<SessionSummary[] | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(
    initialSessionId ?? null,
  );
  const [sessQuery, setSessQuery] = React.useState("");

  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [channels, setChannels] = React.useState<string[]>([]);
  const [skills, setSkills] = React.useState<string[]>([]);
  const [personality, setPersonality] = React.useState<Personality | null>(
    null,
  );
  const [temperature, setTemperature] = React.useState("");
  const [mcpCount, setMcpCount] = React.useState(0);

  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");

  const [tweaks, setTweaks] = React.useState<Tweaks>(TWEAK_DEFAULTS);
  const [autonomy, setAutonomyState] = React.useState("smart");
  // When our most recent autonomy write finished. Any config read that STARTED
  // before that moment may still carry the pre-write value, so it is discarded
  // rather than allowed to snap the control back to what the operator just
  // changed away from.
  const autonomyWrittenAt = React.useRef(0);
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [authOn, setAuthOn] = React.useState(false);

  const renderMode: "md" | "gui" =
    tweaks.render === "Generative UI" ? "gui" : "md";

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
  const retrieveContext = React.useCallback(
    async (userText: string, conversationId: string) => {
      const groups = Array.from(
        new Set([...selectedKbRef.current, ...alwaysOnKbRef.current]),
      );
      if (!hasReadyRef.current && groups.length === 0)
        return { context: "", sources: [] };
      const { context, sources } = await kbSearch(
        userText,
        conversationId,
        groups,
      );
      // Dedupe document titles for the citation chips.
      const titles = Array.from(
        new Set(
          sources.map((s) => s.document_title).filter((t): t is string => !!t),
        ),
      );
      return { context, sources: titles };
    },
    [],
  );

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
    // On a narrow (phone) viewport the rail is an off-canvas drawer — start it
    // closed regardless of the persisted desktop preference so it doesn't cover
    // the conversation on first paint.
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    setRailCollapsed(isMobile ? true : localStorage.getItem(RAIL_KEY) === "1");
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAuthOn(!!d.enabled))
      .catch(() => {});
  }, []);

  const setTweak = React.useCallback(
    <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
      setTweaks((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(TWEAKS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const toggleRail = () =>
    setRailCollapsed((c) => {
      const next = !c;
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      return next;
    });

  // On mobile the rail is an overlay drawer — collapse it after a navigation so
  // the selected view isn't left hidden behind it. No-op on desktop.
  const closeRailOnMobile = React.useCallback(() => {
    if (window.matchMedia("(max-width: 820px)").matches) {
      setRailCollapsed(true);
      localStorage.setItem(RAIL_KEY, "1");
    }
  }, []);

  // ---- data ----
  const refreshSessions = React.useCallback(async () => {
    try {
      const { sessions } = await api.sessions(SESSIONS_PAGE, 0);
      setSessions(sessions);
      setHasMoreSessions(sessions.length >= SESSIONS_PAGE);
      setSessionsError(null);
    } catch (e) {
      // Surface it in the rail: the connection banner is driven by a separate
      // `/status` poll, so a failed session load on a healthy gateway would
      // otherwise render an empty, healthy-looking "No sessions yet." rail and
      // the operator would conclude their history is gone.
      setSessionsError(describeApiError(e));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadMoreSessions = React.useCallback(async () => {
    setLoadingMore(true);
    try {
      const { sessions: next } = await api.sessions(SESSIONS_PAGE, sessions.length);
      setSessions((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...next.filter((s) => !seen.has(s.id))];
      });
      setHasMoreSessions(next.length >= SESSIONS_PAGE);
      setSessionsError(null);
    } catch (e) {
      setSessionsError(describeApiError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [sessions.length]);

  // Server-side search when the box is non-empty (debounced): the client-side
  // filter only sees the loaded page, so a session past the first page could
  // never be found. `searchSessions` matches across the whole store.
  React.useEffect(() => {
    const q = sessQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { results } = await api.searchSessions(q);
        if (cancelled) return;
        // One row per session; keep the first (highest-ranked) hit's title.
        const seen = new Set<string>();
        const rows: SessionSummary[] = [];
        for (const r of results) {
          if (seen.has(r.session_id)) continue;
          seen.add(r.session_id);
          rows.push({
            id: r.session_id,
            title: r.session_title,
            model: null,
            started_at: r.timestamp,
            message_count: 0,
          });
        }
        setSearchResults(rows);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sessQuery]);

  // Project the gateway's autonomy config onto the 4-rung ladder. The rung is
  // `level` + `always_ask` (see `levelToRung`); both the console and the
  // TUI/CLI write that pair, so this reflects a preset switched on either
  // surface.
  const applyAutonomyFromConfig = React.useCallback(
    (c: Record<string, unknown> | null | undefined, readStartedAt: number) => {
      if (autonomyReadIsStale(readStartedAt, autonomyWrittenAt.current)) return;
      const auto = c?.autonomy as
        | { level?: string; always_ask?: string[] }
        | undefined;
      if (!auto) return;
      setAutonomyState(levelToRung(auto.level, auto.always_ask?.length || 0));
    },
    [],
  );

  const refreshSkills = React.useCallback(() => {
    api
      .skills()
      .then((r) =>
        setSkills(
          (r.skills || [])
            .filter((s) => s.enabled !== false)
            .map((s) => s.name),
        ),
      )
      .catch(() => {});
  }, []);

  // The nav badge is a snapshot taken at load. Listen for the Skills panel's
  // own writes so it does not keep showing a count the user just changed.
  React.useEffect(() => {
    window.addEventListener(SKILLS_CHANGED, refreshSkills);
    return () => window.removeEventListener(SKILLS_CHANGED, refreshSkills);
  }, [refreshSkills]);

  React.useEffect(() => {
    const configReadStartedAt = Date.now();
    refreshSessions();
    api
      .providers()
      .then((r) => setProviders(r.providers))
      .catch(() => {});
    api
      .channels()
      .then((r) => setChannels(r.configured || []))
      .catch(() => {});
    refreshSkills();
    api
      .personality()
      .then((p) => {
        setPersonality(p);
        alwaysOnKbRef.current = Array.isArray(p.always_on_kbs)
          ? p.always_on_kbs
          : [];
      })
      .catch(() => {});
    api
      .kbGroups()
      .then(setKbGroups)
      .catch(() => {});
    api
      .config()
      .then((c) => {
        const t = c?.default_temperature;
        if (t != null) setTemperature(String(t));
        const mcp = c?.mcp_servers;
        if (mcp && typeof mcp === "object")
          setMcpCount(Object.keys(mcp).length);
        applyAutonomyFromConfig(c, configReadStartedAt);
      })
      .catch(() => {});
  }, [refreshSessions, applyAutonomyFromConfig, refreshSkills]);

  // Autonomy is shared state, not a console-local preference: `rantaiclaw
  // autonomy <preset>`, the TUI's Shift+Tab, and a second console tab all write
  // the same config. Re-read it on an interval so an open console follows a
  // switch made elsewhere instead of showing its mount-time value until reload.
  //
  // Only while the tab is visible, and slower than the 15s status poll — this
  // tracks an operator action, not a live metric. Mirrors `useGatewayStatus`:
  // refresh immediately on becoming visible rather than waiting out a full
  // interval, since a whole hidden period may have gone by.
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const refresh = () => {
      const startedAt = Date.now();
      api
        .config()
        .then((c) => applyAutonomyFromConfig(c, startedAt))
        .catch(() => {});
    };

    const sync = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      refresh();
      if (id === null) id = setInterval(refresh, AUTONOMY_POLL_MS);
    };

    // Start the interval without an immediate read: the effect above already
    // fetched the config on mount, and this one has nothing newer to offer yet.
    if (document.visibilityState !== "hidden") {
      id = setInterval(refresh, AUTONOMY_POLL_MS);
    }
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [applyAutonomyFromConfig]);

  // Persist an autonomy rung change to the gateway (maps 4 rungs → real level + always_ask).
  const autonomyRef = React.useRef(autonomy);
  autonomyRef.current = autonomy;
  const changeAutonomy = React.useCallback((rung: string) => {
    // Captured BEFORE the optimistic set, so a failed write can put it back.
    // Without this the console displayed a rung the gateway was not on — "Off"
    // while it ran Manual, or the reverse for an operator who believed they had
    // just locked the agent down.
    const previous = autonomyRef.current;
    setAutonomyState(rung);
    api
      .setAutonomy(rungToAutonomyPayload(rung))
      .then(() => {
        // Stamped in `then` only. In `finally`, a FAILED write armed the
        // staleness guard and discarded the very read that would have corrected
        // the screen.
        autonomyWrittenAt.current = Date.now();
        toast.success(`Autonomy → ${autonomyPreset(rung).label}`);
      })
      .catch((e) => {
        setAutonomyState(previous);
        toast.error(
          `Autonomy unchanged (still ${autonomyPreset(previous).label}): ${
            e instanceof Error ? e.message : e
          }`,
        );
        // Re-read once rather than waiting on the 30-second poll, which also
        // stops while the tab is hidden.
        const startedAt = Date.now();
        api
          .config()
          .then((c) => applyAutonomyFromConfig(c, startedAt))
          .catch(() => {
            /* the toast above already told them; a failed re-read adds noise */
          });
      });
  }, [applyAutonomyFromConfig]);

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

  // Deep-link routes via the URL hash (e.g. /ops#tools) — on load AND on later
  // hash changes (our own route sync uses replaceState, which doesn't fire this).
  React.useEffect(() => {
    const applyHash = () => {
      const r = resolveHashRoute(window.location.hash.replace("#", ""));
      if (r) setRoute(r);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);
  // Reflect the active conversation in the URL so chats are deep-linkable and
  // survive a refresh: /chat/<sessionId> in chat, #<tab> for ops routes.
  React.useEffect(() => {
    if (route === "chat") {
      window.history.replaceState(
        null,
        "",
        activeId ? `/chat/${activeId}` : "/chat",
      );
    } else {
      window.history.replaceState(null, "", `#${route}`);
    }
  }, [route, activeId]);

  // ⇧⇥ cycles autonomy (and persists).
  React.useEffect(() => {
    const order = AUTONOMY.map((p) => p.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "Tab") {
        // Shift+Tab is the universal "focus previous" key. Exempting only text
        // fields was not enough: from a button or a link the binding still
        // fired, swallowed the key, and moved an approval-gating setting with
        // no confirmation. `shiftTabCyclesAutonomy` narrows it to a deliberate
        // context — nothing focused, or focus already on the autonomy control.
        if (
          !shiftTabCyclesAutonomy(
            document.activeElement,
            !!document.querySelector('[role="dialog"]'),
          )
        ) {
          return;
        }
        // `nextCycledRung` skips `off` ("no prompts") — cycling is still one
        // keypress with no confirmation. Selecting `off` stays possible from
        // the autonomy menu.
        const next = nextCycledRung(autonomyRef.current);
        // Only swallow the key when it actually does something. The
        // unconditional `preventDefault()` broke reverse-tab navigation across
        // the whole console.
        if (!next || next === autonomyRef.current) return;
        e.preventDefault();
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
      closeRailOnMobile();
    } catch (e) {
      toast.error(
        `Could not load session: ${e instanceof Error ? e.message : e}`,
      );
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
    closeRailOnMobile();
  };

  const toggleKb = React.useCallback((id: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // Deleting a session is irreversible and the trigger is a 13px icon sitting
  // in a dense row — now beside the rename pencil this PR adds, which makes a
  // misclick that much easier. Every other destructive action in the console
  // already goes through ConfirmModal (memory, mcp, cron, channels, skills,
  // kb); this was the one exception.
  const [pendingDelete, setPendingDelete] =
    React.useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const requestDelete = (session: SessionSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDelete(session);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setDeleting(true);
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) handleNew();
      toast.success("Session deleted");
      setPendingDelete(null);
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setDeleting(false);
    }
  };

  // ---- rename ----
  // Nothing validates the title on the way to storage — not the store, the HTTP
  // handler, the CLI, or the TUI — so an empty one would stick and leave a row
  // that reads "Untitled session" but can no longer be auto-titled. Guard it
  // here, at the surface that made it reachable.
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");

  const startRename = (
    id: string,
    title: string | null,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setRenamingId(id);
    setDraftTitle(title || "");
  };

  // Escape just unmounts the editor. React does not deliver `onBlur` for an
  // element that is removed while focused, so this cannot fall through into the
  // commit path below — verified by removing the guard that used to sit here and
  // watching the "Escape sends nothing" check still hold.
  const cancelRename = () => setRenamingId(null);

  const commitRename = async (id: string) => {
    const next = draftTitle.trim().slice(0, MAX_TITLE_LEN);
    const current = sessions.find((s) => s.id === id)?.title || "";
    setRenamingId(null);
    // Blank or unchanged is a no-op, not an error.
    if (!next || next === current) return;
    try {
      await api.setSessionTitle(id, next);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: next } : s)),
      );
    } catch (e) {
      toast.error(`Rename failed: ${e instanceof Error ? e.message : e}`);
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
    "app" +
    (showRight ? "" : " no-right") +
    (railCollapsed ? " no-rail" : "") +
    (dense ? " dense" : "");

  const agentName = personality?.name?.trim() || "Atlas";
  const agentRole = personality?.role?.trim() || "AI employee";
  const agentInitials = initials(agentName);

  const effectiveProvider = provider || status?.provider || "";
  const effectiveModel = model || status?.model || "";
  const modelTag = effectiveModel
    ? effectiveModel.split("/").pop() || effectiveModel
    : "";

  const navCount = (id: Route): number | undefined => {
    if (id === "channels") return channels.length || undefined;
    if (id === "skills") return skills.length || undefined;
    if (id === "mcp") return mcpCount || undefined;
    return undefined;
  };

  const filteredSessions = React.useMemo(() => {
    // A non-empty query is served by the server-side search (whole store); an
    // empty query shows the loaded pages.
    if (sessQuery.trim()) return searchResults ?? [];
    return sessions;
  }, [sessions, sessQuery, searchResults]);

  const activeSession = sessions.find((s) => s.id === activeId);
  const cur = autonomyPreset(autonomy);

  const connPill =
    connection === "online"
      ? { color: "var(--accent-green)", label: "Daemon live" }
      : connection === "connecting"
        ? { color: "var(--accent-orange)", label: "Connecting…" }
        : { color: "var(--destructive)", label: "Gateway offline" };

  return (
    <div
      className={appClass}
      style={
        {
          "--brand-sky": accent.sky,
          "--brand-deep-blue": accent.deep,
        } as React.CSSProperties
      }
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {/* Mobile-only scrim behind the off-canvas rail; a tap dismisses it. */}
      {!railCollapsed && (
        <div
          className="rail-backdrop"
          onClick={toggleRail}
          aria-hidden="true"
        />
      )}
      {/* ===== Rail ===== */}
      {!railCollapsed && (
        <aside className="rail" aria-label="Sidebar">
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
            <nav className="nav-group" aria-label="Primary">
              {NAV.map((n) => {
                const Icon = n.icon;
                const count = navCount(n.id);
                return (
                  <button
                    key={n.id}
                    className={"nav-item" + (route === n.id ? " active" : "")}
                    onClick={() => {
                      setRoute(n.id);
                      closeRailOnMobile();
                    }}
                    aria-current={route === n.id ? "page" : undefined}
                  >
                    <Icon />
                    <span>{n.label}</span>
                    {count != null && (
                      <span className="nav-count">{count}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {route === "chat" && (
              <div className="nav-group">
                <div className="nav-cap eyebrow flex items-center">
                  <span>Recent Sessions</span>
                  <button
                    className="sess-x shown"
                    aria-label="New chat"
                    title="New chat"
                    onClick={handleNew}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <div className="search mx-2 mb-2">
                  <Search />
                  <input
                    value={sessQuery}
                    onChange={(e) => setSessQuery(e.target.value)}
                    aria-label="Search sessions"
                    placeholder="Search sessions…"
                  />
                </div>
                <div className="sess">
                  {loadingSessions ? (
                    <div className="auto-blurb px-2.5 py-1">
                      Loading sessions…
                    </div>
                  ) : sessionsError && sessions.length === 0 ? (
                    <div className="auto-blurb px-2.5 py-1">
                      Couldn&apos;t load sessions — {sessionsError}{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setLoadingSessions(true);
                          refreshSessions();
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <div className="auto-blurb px-2.5 py-1">
                      {sessQuery.trim() ? "No matches." : "No sessions yet."}
                    </div>
                  ) : (
                    filteredSessions.map((s) => (
                      <div
                        key={s.id}
                        className={
                          "sess-item" + (s.id === activeId ? " active" : "")
                        }
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelect(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelect(s.id);
                          }
                        }}
                      >
                        <div className="sess-row">
                          <span
                            className="chan-dot"
                            style={{ background: channelDot(s.model || "") }}
                          />
                          {renamingId === s.id ? (
                            <input
                              className="sess-title-input"
                              autoFocus
                              maxLength={MAX_TITLE_LEN}
                              value={draftTitle}
                              aria-label="Session title"
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => commitRename(s.id)}
                              onKeyDown={(e) => {
                                // The row treats Enter/Space as "open this
                                // session" — keep those from firing while the
                                // title is being edited.
                                e.stopPropagation();
                                if (e.key === "Enter") commitRename(s.id);
                                if (e.key === "Escape") cancelRename();
                              }}
                            />
                          ) : (
                            <>
                              <span className="sess-title">
                                {s.title || "Untitled session"}
                              </span>
                              <button
                                type="button"
                                className="sess-x edit"
                                onClick={(e) => startRename(s.id, s.title, e)}
                                aria-label={`Rename session: ${s.title || "Untitled session"}`}
                                title="Rename"
                              >
                                <Pencil className="size-[13px]" />
                              </button>
                              <button
                                type="button"
                                className="sess-x"
                                onClick={(e) => requestDelete(s, e)}
                                aria-label={`Delete session: ${s.title || "Untitled session"}`}
                                title="Delete"
                              >
                                <X className="size-[13px]" />
                              </button>
                            </>
                          )}
                        </div>
                        <div className="sess-meta">
                          <span>{s.message_count} msgs</span>
                          <span>·</span>
                          <span>{relativeTime(s.started_at) || "new"}</span>
                        </div>
                      </div>
                    ))
                  )}
                  {!sessQuery.trim() && hasMoreSessions && (
                    <button
                      type="button"
                      className="auto-blurb px-2.5 py-1 w-full text-left underline disabled:opacity-50"
                      onClick={loadMoreSessions}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rail-foot">
            <div className="agent-card">
              <div className="agent-ava">
                {agentInitials}
                <span
                  className={"live" + (connection === "online" ? "" : " off")}
                />
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
                    style={
                      p.id === autonomy ? { background: p.dot } : undefined
                    }
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
      <main className="main" id="main-content" tabIndex={-1}>
        <div className="topbar">
          <button
            className="icon-btn"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-expanded={!railCollapsed}
            title={railCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {railCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>

          {route === "chat" ? (
            <>
              <h1>
                {activeId
                  ? activeSession?.title || "Session"
                  : "New conversation"}
              </h1>
              {chat.sessionId && (
                <span className="crumb">
                  <span
                    className="chan-dot"
                    style={{ background: "var(--brand-sky)" }}
                  />
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
            <button
              className="icon-btn"
              onClick={handleNew}
              aria-label="New chat"
              title="New chat"
            >
              <Plus />
            </button>
          )}
          {route === "chat" && (
            <button
              className="icon-btn"
              onClick={() => setTweak("rightPanel", !tweaks.rightPanel)}
              aria-label="Toggle context panel"
              aria-pressed={tweaks.rightPanel}
              title="Toggle context panel"
              style={
                tweaks.rightPanel ? { color: "var(--foreground)" } : undefined
              }
            >
              <PanelRight />
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setTweaksOpen(true)}
            aria-label="Tweaks"
            title="Tweaks"
          >
            <SlidersHorizontal />
          </button>
          {authOn && (
            <button
              className="icon-btn"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
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
            pending={
              chat.isStreaming &&
              !chat.messages[chat.messages.length - 1]?.content &&
              !chat.messages[chat.messages.length - 1]?.toolCalls?.length
            }
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
          <OpsView route={route} connection={connection} />
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

      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        tweaks={tweaks}
        setTweak={setTweak}
      />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete this session?"
        description={
          pendingDelete
            ? `“${pendingDelete.title || "Untitled session"}” and its ${
                pendingDelete.message_count
              } message${pendingDelete.message_count === 1 ? "" : "s"} will be removed. This cannot be undone.`
            : undefined
        }
        busy={deleting}
        onConfirm={confirmDelete}
      />

      {/* In-browser tool-approval modal (WebModal backend). Shown when the agent
          pauses on a tool that needs approval; Approve/Deny resumes the turn. */}
      <Modal
        open={!!chat.pendingApproval}
        onClose={() =>
          chat.pendingApproval &&
          chat.resolveApproval(chat.pendingApproval.id, false)
        }
        title="🔧 Approve tool?"
        description={
          chat.pendingApproval
            ? `The agent wants to run the “${chat.pendingApproval.tool}” tool.`
            : undefined
        }
        footer={
          chat.pendingApproval ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  chat.resolveApproval(chat.pendingApproval!.id, false)
                }
              >
                Deny
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Approve and don't ask again for this tool this session"
                onClick={() =>
                  chat.resolveApproval(chat.pendingApproval!.id, true, true)
                }
              >
                Always
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  chat.resolveApproval(chat.pendingApproval!.id, true)
                }
              >
                Approve
              </Button>
            </>
          ) : null
        }
      >
        {chat.pendingApproval ? (
          <pre className="m-0 whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-3 font-mono text-xs">
            {JSON.stringify(chat.pendingApproval.args, null, 2)}
          </pre>
        ) : null}
      </Modal>
    </div>
  );
}
