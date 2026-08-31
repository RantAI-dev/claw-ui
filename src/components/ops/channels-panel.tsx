"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { api, describeApiError } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";

// Channels the backend supports (config schema). Telegram is fully manageable
// from the console today; the rest are configurable via the TUI/config only and
// are surfaced here as "under development" until their console flow ships.
const OTHER_CHANNELS: { key: string; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "discord", label: "Discord" },
  { key: "slack", label: "Slack" },
  { key: "signal", label: "Signal" },
  { key: "matrix", label: "Matrix" },
  { key: "mattermost", label: "Mattermost" },
  { key: "email", label: "Email" },
  { key: "irc", label: "IRC" },
  { key: "imessage", label: "iMessage" },
  { key: "linq", label: "Linq (SMS/RCS)" },
  { key: "nextcloud_talk", label: "Nextcloud Talk" },
  { key: "lark", label: "Lark / Feishu" },
  { key: "dingtalk", label: "DingTalk" },
  { key: "qq", label: "QQ" },
];

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
  const { data, loading, error, refresh, loaded } = useAsync(() => api.channels(), []);
  const cfg = useAsync(() => api.config(), []);
  const tgConnected = !!data?.configured.includes("telegram");
  const gateway = useGatewayStatus();
  const staleStatus = statusIsStale(error, gateway.connection);
  // Set while the gateway is reloading because of a save we just made, so the
  // panel can say so instead of presenting the outage as a load error.
  const [reloading, setReloading] = React.useState(false);
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshNow = React.useCallback(() => {
    refresh();
    cfg.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, cfg.refresh]);

  // A save that changes the bot token reloads the runtime (a few seconds), so
  // refetch after a short settle delay — an instant refetch would race the
  // restart. The timer is held in a ref and cleared on unmount; it used to be a
  // bare `setTimeout` that fired into an unmounted tree.
  //
  // `restarting` comes from the gateway's `restarts_runtime`, because only the
  // gateway knows: an allowlist-only edit is picked up live and never restarts
  // anything. This used to enter the reloading state after *every* save, and the
  // effect below cleared it on the next run — the gateway had never gone
  // offline — so the "Reloading the runtime…" banner could not render at all in
  // the ordinary case, and rendered a promise nothing would keep in the rest.
  const refreshAfterReload = React.useCallback((restarting: boolean) => {
    if (restarting) setReloading(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(refreshNow, 3000);
  }, [refreshNow]);

  React.useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Leave the reloading state when the gateway answers again — and give up
  // after a bounded window rather than spinning forever, naming the recovery.
  React.useEffect(() => {
    if (!reloading) return undefined;
    if (gateway.connection === "online") {
      setReloading(false);
      refreshNow();
      return undefined;
    }
    const giveUp = setTimeout(() => setReloading(false), 60_000);
    return () => clearTimeout(giveUp);
  }, [reloading, gateway.connection, refreshNow]);

  // Recover from an outage the operator did not cause.
  //
  // The effect above only fires while `reloading`, which is set exclusively by
  // `refreshAfterReload` — i.e. only after the operator saved something. A
  // gateway that went down and came back on its own left the panel showing
  // "fetch failed" indefinitely, next to a header that had already recovered to
  // "Daemon live", until someone clicked Retry. Refetch on the offline→online
  // edge so the two surfaces cannot disagree.
  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    const online = gateway.connection === "online";
    if (online && wasOffline.current) refreshNow();
    wasOffline.current = !online;
  }, [gateway.connection, refreshNow]);

  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refreshNow} spinning={cfg.refreshing} />}>
        Channels {data && <span className="text-muted-foreground">· {data.count} configured</span>}
      </SectionTitle>
      {/* Gate on the config fetch too: the allowlist editor is seeded from
          GET /config, so rendering it before config loads (or after it fails)
          would let "Save allowlist" persist an empty deny-all list. */}
      {reloading && (
        <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          Reloading the runtime after your change… the panel keeps its content and
          refreshes on its own. If it does not come back, run{" "}
          <code>systemctl --user reset-failed rantaiclaw.service</code> and start it again.
        </div>
      )}
      <PanelFrame
        loading={loading || cfg.loading}
        error={error || cfg.error}
        loaded={loaded && cfg.loaded}
        onRefresh={refreshNow}
      >
        <TelegramCard
          connected={tgConnected}
          statusStale={staleStatus}
          allowedUsers={telegramAllowlist(cfg.data)}
          boundary={approvalBoundary(cfg.data)}
          onReload={refreshAfterReload}
        />

        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            More channels
          </div>
          <p className="mb-2 mt-1 text-[11px] text-muted-foreground">
            No console setup for these yet: configure them in config.toml or the TUI. A
            running one shows as active.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OTHER_CHANNELS.map((c) => (
              <UnderDevelopmentChannel
                key={c.key}
                label={c.label}
                active={!!data?.configured.includes(c.key)}
              />
            ))}
          </div>
        </div>
      </PanelFrame>
    </div>
  );
}

function TelegramCard({
  connected,
  statusStale,
  allowedUsers,
  boundary,
  onReload,
}: {
  connected: boolean;
  /** The last fetch failed or the gateway is offline — say so, do not guess. */
  statusStale: boolean;
  allowedUsers: string[];
  boundary: { owners: string[]; autonomousTools: boolean };
  onReload: (restartsRuntime: boolean) => void;
}) {
  const [token, setToken] = React.useState("");
  const [users, setUsers] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Kept next to the token field: the toast fades in seconds and the operator
  // is left with a cleared-looking form and no reason.
  const [connectError, setConnectError] = React.useState<string | null>(null);
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

  // Both, not either. The gateway sets `warning` when the allowlist is empty or
  // contains `*`, and puts the restart notice in `note` — so the `else if` here
  // suppressed the restart notice in exactly the two states an operator is most
  // likely to be in while editing.
  const notify = (r: { warning?: string | null; note?: string }) => {
    if (r.warning) toast.warning(r.warning);
    if (r.note) toast.message(r.note);
  };

  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setConnectError(null);
    try {
      const r = await api.connectTelegram(t, parseUsers());
      toast.success(`Connected Telegram @${r.bot_username}`);
      notify(r);
      setToken("");
      onReload(r.restarts_runtime === true);
    } catch (e) {
      const detail = describeApiError(e);
      setConnectError(`Couldn't connect: ${detail}`);
      toast.error(detail);
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
      toast.success(`Allowlist updated: ${r.allowed_users} sender(s) allowed`);
      notify(r);
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
      toast.success("Disconnected Telegram");
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          Telegram
          {statusStale ? (
            <Badge variant="outline" className="text-[11px]">
              status unknown
            </Badge>
          ) : connected ? (
            <Badge variant="success" className="text-[11px]">
              connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px]">
              not connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {connected ? (
          <>
            <label htmlFor="tg-allowlist" className="text-xs text-muted-foreground">
              Allowed user ids / usernames (comma-separated)
            </label>
            <Input
              id="tg-allowlist"
              placeholder="Leave empty to deny all senders"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            {/* Who may approve a gated tool call, and whether the gate is on
                at all. Neither value appeared anywhere in this console, so a
                connected channel with no owners looked the same as one with
                them — and `autonomous_tools` silently voided both. */}
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px]">
              {boundary.autonomousTools ? (
                <div className="flex items-start gap-1.5 font-medium text-destructive" role="alert">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  <span>
                    autonomous_tools = true: messages on this channel run tools without
                    approval. The owner list below does not restrain them.
                  </span>
                </div>
              ) : boundary.owners.length === 0 ? (
                <div className="text-muted-foreground">
                  No approval owners: anything needing approval is auto-denied. Set
                  <code className="mx-1">channels_config.approval_owners</code>, or send
                  <code className="mx-1">/claim &lt;code&gt;</code> from the chat.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                  <span>May approve tool calls:</span>
                  {boundary.owners.map((o) => (
                    <Badge key={o} variant="secondary" className="font-mono text-[10px]">
                      {o}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Saved straight into the running channel: no restart, and no need
                to re-enter the bot token. Changing the token is the one edit that
                reloads the runtime.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={saveAllowlist} disabled={busy}>
                  {busy ? "Saving…" : "Save allowlist"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Input
              type="password"
              placeholder="Bot token (from @BotFather)"
              aria-label="Telegram bot token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setConnectError(null);
              }}
              autoComplete="off"
            />
            {connectError && (
              <p className="text-[11px] text-destructive" role="alert">
                {connectError}
              </p>
            )}
            <Input
              placeholder="Allowed user ids / usernames (comma-separated)"
              aria-label="Allowed user ids / usernames (comma-separated)"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                The token is validated with Telegram, then saved (encrypted at rest). Leave allowed
                users empty to deny all senders.
              </span>
              <Button size="sm" onClick={connect} disabled={busy || !token.trim()}>
                {busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
    <ConfirmModal
      open={confirmDisconnect}
      onClose={() => setConfirmDisconnect(false)}
      title="Disconnect Telegram?"
      description="The saved bot token will be cleared. You'll need to re-enter it from @BotFather to reconnect."
      confirmLabel="Disconnect"
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
                ? `Saving now removes: ${drift.wouldRevoke.join(", ")}, added on the server since this panel loaded (a /claim or /bind, most likely).`
                : "",
              drift.alsoChanged.length > 0
                ? `Already removed on the server: ${drift.alsoChanged.join(", ")}.`
                : "",
              "Save anyway to replace the server's list with what is in the box.",
            ]
              .filter(Boolean)
              .join(" ")
          : ""
      }
      confirmLabel="Save anyway"
      busy={busy}
      onConfirm={async () => {
        setDrift(null);
        await runSave();
      }}
    />
    </>
  );
}

function UnderDevelopmentChannel({ label, active }: { label: string; active: boolean }) {
  return (
    <Card className="rounded-lg border-dashed bg-muted/30 p-3 shadow-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {active && (
          <Badge variant="success" className="text-[11px]">
            active
          </Badge>
        )}
      </div>
      {active && (
        <div className="mt-1 text-[11px] text-muted-foreground">Running · manage via TUI</div>
      )}
    </Card>
  );
}
