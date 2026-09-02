"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";
import {
  allowlistToastTitle,
  channelState,
  channelsVerdict,
  configuredRows,
  type ChannelState,
  type ChannelsVerdict,
} from "@/lib/channels";
import { parseRuntimeHealth } from "@/lib/status";
import { channelDot } from "@/lib/console";
import { cn } from "@/lib/utils";

/** Pull the Telegram allowlist out of GET /config (the bot token itself is redacted). */
function telegramAllowlist(config: Record<string, unknown> | null): string[] {
  const cc = config?.["channels_config"] as Record<string, unknown> | undefined;
  const tg = cc?.["telegram"] as Record<string, unknown> | undefined;
  const allowed = tg?.["allowed_users"];
  return Array.isArray(allowed) ? (allowed as string[]) : [];
}

/**
 * Who may approve a gated tool call, and whether the gate is on at all.
 *
 * `approval_owners` and `autonomous_tools` appeared nowhere in this console —
 * so an operator could read a connected channel with no owners and not know
 * that anything needing approval is auto-denied, or that `autonomous_tools`
 * bypasses the gate entirely and runs everything unprompted.
 */
export function approvalBoundary(config: Record<string, unknown> | null): {
  owners: string[];
  autonomousTools: boolean;
} {
  const cc = config?.["channels_config"] as Record<string, unknown> | undefined;
  const owners = cc?.["approval_owners"];
  return {
    owners: Array.isArray(owners) ? (owners as string[]) : [],
    autonomousTools: cc?.["autonomous_tools"] === true,
  };
}

/**
 * What saving `next` would do to a server list that has moved since the editor
 * was seeded from `seeded`.
 *
 * The POST replaces the allowlist wholesale, so anyone who self-onboarded via
 * `/claim` after the panel loaded is silently revoked. The backend deliberately
 * re-reads the freshest config under a lock to avoid clobbering them; the
 * console defeated that by sending a stale snapshot back.
 *
 * Returns `null` when the server matches what the editor was seeded from —
 * nothing to warn about.
 */
/**
 * Whether the channel status on screen is last-known rather than current.
 *
 * `PanelFrame` deliberately keeps content on screen when a *refresh* fails —
 * right for a list, wrong for a live status. The badge is the runtime's state,
 * and rendering the last known one as current told an operator "connected"
 * while the gateway that would know was offline.
 */
export function statusIsStale(error: string | null | undefined, connection: string): boolean {
  return !!error || connection !== "online";
}

export function allowlistDrift(
  seeded: string[],
  server: string[],
  next: string[],
): { wouldRevoke: string[]; alsoChanged: string[] } | null {
  const seededSet = new Set(seeded);
  const serverSet = new Set(server);
  const addedOnServer = server.filter((u) => !seededSet.has(u));
  const goneFromServer = seeded.filter((u) => !serverSet.has(u));
  if (addedOnServer.length === 0 && goneFromServer.length === 0) return null;
  const nextSet = new Set(next);
  return {
    // Only the ones the operator's box does NOT already carry: an entry they
    // typed back in is not being revoked.
    wouldRevoke: addedOnServer.filter((u) => !nextSet.has(u)),
    alsoChanged: goneFromServer,
  };
}

export function ChannelsPanel() {
  const { data, loading, error, refresh, loaded, refreshing } = useAsync(() => api.channels(), []);
  const cfg = useAsync(() => api.config(), []);
  // Whether a configured channel actually runs is only in the runtime snapshot;
  // a failure here degrades to "no snapshot", it never blocks the page.
  const st = useAsync(() => api.status(), []);
  const tgConnected = !!data?.configured.includes("telegram");
  const gateway = useGatewayStatus();
  const staleStatus = statusIsStale(error, gateway.connection);
  const runtime = st.data ? parseRuntimeHealth(st.data.runtime) : null;
  const tgState = channelState("telegram", data?.configured ?? null, runtime, staleStatus);
  const rows = configuredRows(data?.configured ?? null, runtime, staleStatus);
  // Set after a save the gateway said restarts the runtime, so the outage that
  // follows is presented as the change being applied, not as a load error.
  // `waiting`: the response is in and the restart is scheduled (the gateway
  // answers for a moment longer); `restarting`: the gateway has gone away;
  // back to `idle` when it answers again, or after a bounded window when it
  // never leaves (no managed service: the operator restarts `rantaiclaw
  // daemon` by hand). The previous version cleared the flag whenever the
  // gateway was online, which it always still is on the commit that set it,
  // so the banner never rendered.
  const [applying, setApplying] = React.useState<"idle" | "waiting" | "restarting">("idle");
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUpTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The runtime's pid when the restarting save was answered, and the latest
  // one seen: a different pid means the restart is done, even when it was too
  // quick for the connection hook to see the gateway go away.
  const pidAtSave = React.useRef<number | null>(null);
  const latestPid = React.useRef<number | null>(null);
  latestPid.current = runtime?.pid ?? null;

  const refreshNow = React.useCallback(() => {
    refresh();
    cfg.refresh();
    st.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, cfg.refresh, st.refresh]);

  // A save that changes the bot token reloads the runtime (a few seconds), so
  // refetch after a short settle delay: an instant refetch would race the
  // restart. `restarting` comes from the gateway's `restarts_runtime`, because
  // only the gateway knows: an allowlist-only edit is picked up live and never
  // restarts anything.
  const refreshAfterReload = React.useCallback(
    (restarting: boolean) => {
      if (restarting) {
        pidAtSave.current = latestPid.current;
        setApplying("waiting");
        if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
        giveUpTimer.current = setTimeout(() => setApplying("idle"), 60_000);
      }
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(refreshNow, 3000);
    },
    [refreshNow],
  );

  React.useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    },
    [],
  );

  // Walk the banner through the restart: nothing happens while the gateway is
  // still answering; the outage moves it to `restarting`; the return clears it.
  // The refetch on that return is the offline-to-online edge below.
  React.useEffect(() => {
    const online = gateway.connection === "online";
    if (applying === "waiting" && !online) setApplying("restarting");
    if (applying === "restarting" && online) {
      setApplying("idle");
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    }
  }, [applying, gateway.connection]);

  // A managed restart can finish between two polls of the connection hook, so
  // while applying, re-read the runtime every 5 s and end on a new pid.
  const pid = runtime?.pid ?? null;
  React.useEffect(() => {
    if (applying === "idle") return undefined;
    if (pid != null && pidAtSave.current != null && pid !== pidAtSave.current) {
      setApplying("idle");
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
      // The settle refetch may have failed into the outage; re-read everything
      // now that the runtime is back, since the connection hook may never have
      // seen it leave and so will not fire its own edge refetch.
      refreshNow();
      return undefined;
    }
    const id = setInterval(st.refresh, 5000);
    return () => clearInterval(id);
  }, [applying, pid, st.refresh, refreshNow]);

  // Recover from an outage the operator did not cause.
  //
  // A gateway that went down and came back on its own left the panel showing
  // "fetch failed" indefinitely, next to a header that had already recovered to
  // "Daemon live", until someone clicked Retry. Refetch on the offline-to-online
  // edge so the two surfaces cannot disagree; the same edge ends a restart the
  // operator caused.
  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    const online = gateway.connection === "online";
    if (online && wasOffline.current) refreshNow();
    wasOffline.current = !online;
  }, [gateway.connection, refreshNow]);

  const verdict = channelsVerdict(data?.configured ?? null, runtime, staleStatus);

  return (
    <div className="max-w-[1120px] space-y-8">
      {/* The page opens with the answer: reachable where, or why not. Not a
          card; the whitespace around the band marks the focal point, as on
          Status. The topbar h1 already says Channels. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PanelFrame
            loading={loading || cfg.loading}
            error={error || cfg.error}
            loaded={loaded && cfg.loaded}
            loadingLabel="Loading channels…"
          >
            <ReachabilityBand verdict={verdict} />
          </PanelFrame>
        </div>
        <RefreshButton
          onClick={refreshNow}
          spinning={refreshing || cfg.refreshing || st.refreshing}
        />
      </div>

      {applying !== "idle" && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Applying your change. The runtime reloads by itself when RantaiClaw runs as a
          managed service; otherwise restart <code>rantaiclaw daemon</code>. This panel
          refreshes when the gateway is back.
        </div>
      )}

      {/* Editors only once both fetches have answered: the allowlist editor is
          seeded from GET /config, so rendering it early would let "Save
          allowlist" persist an empty deny-all list. Loaded data stays mounted
          through a refresh failure; the band's strip reports it. The 7/5 split
          gives the editor the width; the facts scan in the narrow column. */}
      {data && cfg.loaded && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <TelegramCard
              connected={tgConnected}
              state={tgState}
              allowedUsers={telegramAllowlist(cfg.data)}
              onReload={refreshAfterReload}
            />
          </div>

          <div className="space-y-8 lg:col-span-5">
            <ApprovalsCard boundary={approvalBoundary(cfg.data)} />

            <div>
              <SectionTitle>Other channels</SectionTitle>
              <p className="text-xs text-muted-foreground">
                Set up with <code>rantaiclaw setup</code> or in config.toml; this console
                manages Telegram.
              </p>
              {rows.length > 0 && (
                <Card className="mt-3 p-0">
                  <ul>
                    {rows.map((r) => (
                      <li
                        key={r.key}
                        className="border-b border-border/60 px-4 py-2.5 last:border-b-0"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span
                            aria-hidden
                            className="inline-block size-2 rounded-full"
                            style={{ background: channelDot(r.key) }}
                          />
                          <span className="font-medium">{r.label}</span>
                          <Badge variant={r.state.tone}>{r.state.label}</Badge>
                        </div>
                        {r.state.detail && r.state.detailScope === "channel" && (
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              r.state.word === "error"
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {r.state.detail}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dot colours for the verdict band, the same vocabulary as the topbar pill. */
const VERDICT_DOT: Record<ChannelsVerdict["tone"], string> = {
  success: "var(--accent-green)",
  destructive: "var(--destructive)",
  warning: "var(--accent-orange)",
  muted: "var(--muted-foreground)",
};

function ReachabilityBand({ verdict }: { verdict: ChannelsVerdict }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ background: VERDICT_DOT[verdict.tone] }}
        />
        <p className="text-xl font-medium tracking-tight">{verdict.headline}</p>
      </div>
      {verdict.meta && (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">{verdict.meta}</p>
      )}
      {verdict.detail && (
        <p
          className={cn(
            "mt-1.5 text-xs",
            verdict.tone === "destructive" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {verdict.detail}
        </p>
      )}
    </div>
  );
}

/**
 * Who may approve a gated tool call, and whether the gate is on at all.
 * `channels_config.approval_owners` and `autonomous_tools` govern every
 * channel; inside the Telegram card they read as Telegram-only, which they
 * are not.
 */
function ApprovalsCard({ boundary }: { boundary: { owners: string[]; autonomousTools: boolean } }) {
  return (
    <div>
      <SectionTitle>Approvals</SectionTitle>
      <Card className="p-4 text-xs">
        {boundary.autonomousTools ? (
          <div className="flex items-start gap-2 font-medium text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              autonomous_tools = true: messages on any channel run tools without
              approval. The owner list does not restrain them.
            </span>
          </div>
        ) : boundary.owners.length === 0 ? (
          <div className="text-muted-foreground">
            No approval owners: anything that needs approval is denied. Set{" "}
            <code>channels_config.approval_owners</code>, or send{" "}
            <code>/claim &lt;code&gt;</code> from the chat.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span>May approve tool calls:</span>
            {boundary.owners.map((o) => (
              <Badge key={o} variant="secondary" className="font-mono text-xs">
                {o}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TelegramCard({
  connected,
  state,
  allowedUsers,
  onReload,
}: {
  /** A Telegram section exists in config (the editor is shown). */
  connected: boolean;
  /** What the runtime says about it; drives the badge and its detail line. */
  state: ChannelState;
  allowedUsers: string[];
  onReload: (restartsRuntime: boolean) => void;
}) {
  const [token, setToken] = React.useState("");
  const [users, setUsers] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  // Set when the server's allowlist has moved since the editor was seeded, so
  // saving would revoke someone the operator never saw.
  const [drift, setDrift] = React.useState<{
    wouldRevoke: string[];
    alsoChanged: string[];
  } | null>(null);

  // Prefill the allowlist editor with the saved list once connected.
  const savedAllowlist = allowedUsers.join(", ");
  React.useEffect(() => {
    if (connected) setUsers(savedAllowlist);
  }, [connected, savedAllowlist]);

  const parseUsers = () =>
    users
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  // Nothing to save while the box holds the saved list (whitespace and a
  // trailing comma are not a change).
  const dirty =
    parseUsers().join(",") !==
    allowedUsers
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");

  // One toast per action. The gateway's `warning` (empty allowlist, `*`) is the
  // toast's second line; its `note` restates either the count or the restart,
  // which the banner already carries, so it is not shown.
  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await api.connectTelegram(t, parseUsers());
      toast.success(`Connected Telegram @${r.bot_username}`, {
        description: r.warning ?? undefined,
      });
      setToken("");
      onReload(r.restarts_runtime === true);
    } catch (e) {
      toast.error(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  // The POST replaces the list wholesale, and the editor is seeded from a
  // snapshot taken when the panel loaded — so anyone who self-onboarded via
  // `/claim` since then is silently revoked. The backend goes out of its way to
  // avoid clobbering that (it re-reads the freshest config under a lock); this
  // makes the console stop defeating it, by showing the operator the removal and
  // asking first.
  const runSave = async () => {
    setBusy(true);
    try {
      const r = await api.updateTelegramAllowlist(parseUsers());
      // What the SERVER stored, not what was requested. A mismatch between the
      // two is exactly what an operator needs to see.
      toast.success(allowlistToastTitle(r.allowed_users), {
        description: r.warning ?? undefined,
      });
      onReload(r.restarts_runtime === true);
    } catch (e) {
      toast.error(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAllowlist = async () => {
    setBusy(true);
    let fresh: string[] | null = null;
    try {
      fresh = telegramAllowlist(await api.config());
    } catch {
      // A failed pre-check must not block the save — it is a courtesy, not a
      // gate. Falling through means the operator gets the old behaviour, which
      // is what they would have had anyway.
      fresh = null;
    } finally {
      setBusy(false);
    }

    if (fresh) {
      const d = allowlistDrift(allowedUsers, fresh, parseUsers());
      if (d) {
        setDrift(d);
        return;
      }
    }

    await runSave();
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const r = await api.disconnectTelegram();
      toast.success("Telegram disconnected");
      setUsers("");
      setConfirmDisconnect(false);
      onReload(r.restarts_runtime === true);
    } catch (e) {
      toast.error(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Card className="p-0">
      {/* Header strip: the channel's own dot (the colour the right rail uses
          for it) beside the name and its state. */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ background: channelDot("telegram") }}
        />
        <span className="text-sm font-medium">Telegram</span>
        <Badge variant={state.tone}>{state.label}</Badge>
      </div>
      <div className="space-y-2 p-4">
        {state.detail && state.detailScope === "channel" && (
          <p
            className={cn(
              "text-xs",
              state.word === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {state.detail}
          </p>
        )}
        {connected ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveAllowlist();
            }}
          >
            <label htmlFor="tg-allowlist" className="text-xs text-muted-foreground">
              Allowed user ids / usernames (comma-separated)
            </label>
            <Input
              id="tg-allowlist"
              placeholder="Leave empty to deny all senders"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Saved into the running channel on its next message; no restart. To change
                the bot token, disconnect and connect again.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="sm" variant="outline" disabled={busy || !dirty}>
                  {busy ? "Saving…" : "Save allowlist"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <label htmlFor="tg-token" className="text-xs text-muted-foreground">
              Bot token
            </label>
            <Input
              id="tg-token"
              type="password"
              placeholder="123456789:AA… from @BotFather"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <label htmlFor="tg-users" className="text-xs text-muted-foreground">
              Allowed user ids / usernames (comma-separated)
            </label>
            <Input
              id="tg-users"
              placeholder="Empty denies every sender"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                The token is checked with Telegram, then saved. An empty allowlist denies
                every sender.
              </span>
              <Button type="submit" size="sm" className="shrink-0" disabled={busy || !token.trim()}>
                {busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
    <ConfirmModal
      open={confirmDisconnect}
      onClose={() => setConfirmDisconnect(false)}
      title="Disconnect Telegram?"
      description="The saved bot token is cleared. To reconnect, enter a new token from @BotFather."
      confirmLabel="Disconnect"
      icon={null}
      busy={busy}
      onConfirm={disconnect}
    />
    <ConfirmModal
      open={drift !== null}
      onClose={() => setDrift(null)}
      title="The allowlist changed while this was open"
      description={
        drift
          ? [
              drift.wouldRevoke.length > 0
                ? `Saving now removes: ${drift.wouldRevoke.join(", ")} (added on the server since this panel loaded, most likely by /claim or /bind).`
                : "",
              drift.alsoChanged.length > 0
                ? `Already removed on the server: ${drift.alsoChanged.join(", ")}.`
                : "",
              "Save anyway replaces the server's list with what is in the box.",
            ]
              .filter(Boolean)
              .join(" ")
          : ""
      }
      confirmLabel="Save anyway"
      icon={null}
      busy={busy}
      onConfirm={async () => {
        setDrift(null);
        await runSave();
      }}
    />
    </>
  );
}
