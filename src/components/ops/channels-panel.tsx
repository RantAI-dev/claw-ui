"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelFrame, RefreshButton, SectionTitle } from "./shared";
import {
  channelAllowlist,
  DisconnectDialog,
  DriftDialog,
  MissingCredentialNotice,
  PlainField,
  SecretField,
  SetupCardFrame,
  useChannelSetup,
  whatsappAllowlist,
} from "./channel-setup";
import { allowlistDrift, CARDED_CHANNELS, channelMissingCredentials, channelState, channelVerification, channelsVerdict, configuredRows, type ChannelState, type ChannelsVerdict } from "@/lib/channels";
import type { ChannelVerification } from "@/lib/types";
import { parseRuntimeHealth } from "@/lib/status";
import { channelDot } from "@/lib/console";
import { cn } from "@/lib/utils";

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

/**
 * Kept at this address on purpose.
 *
 * `allowlistDrift` moved to `@/lib/channels` when a second and third card
 * started needing it — it is a pure function and that is where the panel's
 * other pure helpers live. Its behaviour did not change, and re-exporting it
 * here means the suite that imports it from this module keeps passing without
 * being edited to follow the code around.
 */
export { allowlistDrift };

export function ChannelsPanel() {
  const { data, loading, error, refresh, loaded, refreshing } = useAsync(() => api.channels(), []);
  const cfg = useAsync(() => api.config(), []);
  // Whether a configured channel actually runs is only in the runtime snapshot;
  // a failure here degrades to "no snapshot", it never blocks the page.
  const st = useAsync(() => api.status(), []);
  const gateway = useGatewayStatus();
  const staleStatus = statusIsStale(error, gateway.connection);
  const runtime = st.data ? parseRuntimeHealth(st.data.runtime) : null;
  // The runtime's catalog, not a copy of it. Empty when the gateway predates
  // the field — the rows then render by key, which is the same degradation an
  // unknown key already got.
  const catalog = data?.channels ?? [];
  const supportOf = (c: (typeof catalog)[number]) => c.support ?? c.maturity;
  const underDevelopmentCount = catalog.filter(
    (c) => supportOf(c) === "under_development",
  ).length;
  // Committed to and never driven. The count is worth its own sentence because
  // it is the state an operator is most likely to misread: the badge says the
  // project stands behind the channel, and nobody has watched a message arrive
  // on it.
  const committedUndrivenCount = catalog.filter(
    (c) => supportOf(c) === "supported" && c.verification === "not_driven",
  ).length;
  const rows = configuredRows(data?.configured ?? null, runtime, staleStatus, catalog);
  // The four facts every setup card needs, derived once. Three cards spelling
  // this out themselves would be three chances for them to disagree about what
  // "connected" means.
  const cardFacts = (key: string) => ({
    connected: !!data?.configured.includes(key),
    state: channelState(key, data?.configured ?? null, runtime, staleStatus),
    verification: channelVerification(key, catalog),
    missingCredentials: channelMissingCredentials(key, data?.configured ?? null, catalog),
  });
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

  const verdict = channelsVerdict(data?.configured ?? null, runtime, staleStatus, catalog);

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
          {/* Three cards stacked in the wide column rather than spread into a
              grid: the band is 1120 and the 7/5 split is the page's contract,
              and a section title per card is the device this page already uses
              to name things. */}
          <div className="space-y-8 lg:col-span-7">
            <div>
              <SectionTitle>Telegram</SectionTitle>
              <TelegramCard
                {...cardFacts("telegram")}
                allowedUsers={channelAllowlist(cfg.data, "telegram")}
                onReload={refreshAfterReload}
              />
            </div>

            <div>
              <SectionTitle>Discord</SectionTitle>
              <DiscordCard
                {...cardFacts("discord")}
                allowedUsers={channelAllowlist(cfg.data, "discord")}
                onReload={refreshAfterReload}
              />
            </div>

            <div>
              <SectionTitle>Slack</SectionTitle>
              <SlackCard
                {...cardFacts("slack")}
                allowedUsers={channelAllowlist(cfg.data, "slack")}
                onReload={refreshAfterReload}
              />
            </div>

            <div>
              <SectionTitle>WhatsApp Web</SectionTitle>
              <WhatsAppWebCard
                {...cardFacts("whatsapp_web")}
                allowedNumbers={whatsappAllowlist(cfg.data)}
                onReload={refreshAfterReload}
              />
            </div>
          </div>

          <div className="space-y-8 lg:col-span-5">
            <ApprovalsCard boundary={approvalBoundary(cfg.data)} />

            <div>
              <SectionTitle>Other channels</SectionTitle>
              <p className="text-xs text-muted-foreground">
                Set up with <code>rantaiclaw setup</code> or in config.toml; this console
                manages Telegram, Discord, Slack and WhatsApp Web.
              </p>
              {underDevelopmentCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {underDevelopmentCount} of the {catalog.length} channel types this
                  runtime knows are marked{" "}
                  <span className="font-medium text-foreground">under development</span>:
                  they build and have tests, but <code>channel doctor</code> does not
                  probe them and they are outside what an alpha release claims.
                  Connecting one is fine. Expect to debug it yourself.
                </p>
              )}
              {committedUndrivenCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  A further {committedUndrivenCount} are supported but{" "}
                  <span className="font-medium text-foreground">not yet verified</span>:
                  the project stands behind them, and nobody has watched a message
                  arrive on one yet. You are about to hand one of these credentials,
                  so it is worth knowing which of the two you are getting.
                </p>
              )}
              {rows.length === 0 && (
                <Card className="mt-3 p-4 text-xs text-muted-foreground">
                  {/* The ones without a card: the three that have one are set
                      up above, so counting them here would offer the operator
                      channels this column cannot help with. */}
                  {catalog.length > 0
                    ? `None configured yet. ${
                        catalog.filter(
                          (c) => !(CARDED_CHANNELS as readonly string[]).includes(c.key),
                        ).length
                      } more channels are available.`
                    : "None configured yet."}
                </Card>
              )}
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
                          {r.support === "under_development" && (
                            <Badge variant="warning">Under development</Badge>
                          )}
                          {/* The verification axis reads as a quieter qualifier
                              than the support badge, because it qualifies that
                              badge rather than competing with it. Two chips per
                              row would make the list unreadable and would imply
                              the two facts carry equal weight, which they do
                              not: one is a commitment, one is evidence. */}
                          {r.verification === "not_driven" && (
                            <span className="text-xs text-muted-foreground">
                              not yet verified
                            </span>
                          )}
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
        <h2 className="text-xl font-medium tracking-tight">{verdict.headline}</h2>
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

/**
 * Telegram's card, rebuilt on the shared pieces.
 *
 * Its words and its control names are untouched, deliberately. The suites pin
 * `Connect`, `Save allowlist` and `Disconnect` as bare names, and with three
 * cards on the page those read as ambiguous — but renaming them is a Telegram
 * behaviour change, and this plan's stop condition says to keep the behaviour
 * and report it. Discord and Slack name their controls in full; the asymmetry
 * is recorded rather than smoothed over.
 */
function TelegramCard({
  connected,
  missingCredentials,
  state,
  verification,
  allowedUsers,
  onReload,
}: {
  /** A Telegram section exists in config (the editor is shown). */
  connected: boolean;
  /** Configured, but the runtime says no bot token is saved. Only a gateway
   *  that answers `has_credentials` can put the card here; silence means no. */
  missingCredentials: boolean;
  /** Telegram's verification axis, so the card states it rather than implying
   *  it by omission. `null` on a runtime older than the split. */
  verification: ChannelVerification | null;
  /** What the runtime says about it; drives the badge and its detail line. */
  state: ChannelState;
  allowedUsers: string[];
  onReload: (restartsRuntime: boolean) => void;
}) {
  const [token, setToken] = React.useState("");
  // A configured channel with no credential cannot be managed, only fixed, so
  // it gets the connect form rather than an allowlist editor for a channel
  // that cannot run.
  const manage = connected && !missingCredentials;
  const s = useChannelSetup({
    channelKey: "telegram",
    allowedUsers,
    connected,
    onReload,
    freshAllowlist: async () => channelAllowlist(await api.config(), "telegram"),
    updateAllowlist: (users) => api.updateTelegramAllowlist(users),
    disconnect: () => api.disconnectTelegram(),
  });

  // One toast per action. The gateway's `warning` (empty allowlist, `*`) is the
  // toast's second line; its `note` restates either the count or the restart,
  // which the banner already carries, so it is not shown.
  const connect = () => {
    const t = token.trim();
    if (!t) return;
    void s.runConnect(
      () => api.connectTelegram(t, s.parseUsers()),
      (r) => `Connected Telegram @${r.bot_username}`,
      () => setToken(""),
    );
  };

  return (
    <>
      <SetupCardFrame channelKey="telegram" state={state} verification={verification}>
        {missingCredentials && <MissingCredentialNotice what="no bot token is saved" />}
        {manage ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void s.saveAllowlist();
            }}
          >
            <PlainField
              id="tg-allowlist"
              label="Allowed user ids / usernames (comma-separated)"
              placeholder="123456789, @rantaiclaw_user"
              value={s.users}
              onChange={s.setUsers}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Saved into the running channel on its next message; no restart. To change
                the bot token, disconnect and connect again.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="sm" variant="outline" disabled={s.busy || !s.dirty}>
                  {s.busy ? "Saving…" : "Save allowlist"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => s.setConfirmDisconnect(true)}
                  disabled={s.busy}
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
              connect();
            }}
          >
            <SecretField
              id="tg-token"
              label="Bot token"
              placeholder="123456789:AA… from @BotFather"
              value={token}
              onChange={setToken}
            />
            <PlainField
              id="tg-users"
              label="Allowed user ids / usernames (comma-separated)"
              placeholder="123456789, @rantaiclaw_user"
              value={s.users}
              onChange={s.setUsers}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                The token is checked with Telegram, then saved. An empty allowlist denies
                every sender.
              </span>
              <Button
                type="submit"
                size="sm"
                className="shrink-0"
                disabled={s.busy || !token.trim()}
              >
                {s.busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </form>
        )}
      </SetupCardFrame>
      <DisconnectDialog
        open={s.confirmDisconnect}
        label="Telegram"
        description="The saved bot token is cleared. To reconnect, enter a new token from @BotFather."
        busy={s.busy}
        onClose={() => s.setConfirmDisconnect(false)}
        onConfirm={() => void s.runDisconnect("Telegram")}
      />
      <DriftDialog
        drift={s.drift}
        busy={s.busy}
        onClose={() => s.setDrift(null)}
        onConfirm={async () => {
          s.setDrift(null);
          await s.runSave();
        }}
      />
    </>
  );
}

/**
 * Discord: one bot token, an allowlist, and an optional guild filter.
 *
 * The guild id is the one field here that restarts the runtime when it changes,
 * because it is read into the channel object at construction. The gateway
 * decides that and reports it in `restarts_runtime`; the card does not guess.
 */
function DiscordCard({
  connected,
  missingCredentials,
  state,
  verification,
  allowedUsers,
  onReload,
}: {
  connected: boolean;
  /** Configured, but the runtime says no bot token is saved. */
  missingCredentials: boolean;
  verification: ChannelVerification | null;
  state: ChannelState;
  allowedUsers: string[];
  onReload: (restartsRuntime: boolean) => void;
}) {
  const [token, setToken] = React.useState("");
  const [guild, setGuild] = React.useState("");
  const s = useChannelSetup({
    channelKey: "discord",
    allowedUsers,
    connected,
    onReload,
    freshAllowlist: async () => channelAllowlist(await api.config(), "discord"),
    updateAllowlist: (users) => api.updateDiscordAllowlist(users),
    disconnect: () => api.disconnectDiscord(),
  });

  // A configured channel with no credential cannot be managed, only fixed, so
  // it gets the connect form rather than an allowlist editor.
  const manage = connected && !missingCredentials;

  const connect = () => {
    const t = token.trim();
    if (!t) return;
    void s.runConnect(
      () => api.connectDiscord(t, s.parseUsers(), guild.trim() || undefined),
      () => "Connected Discord",
      () => {
        setToken("");
        setGuild("");
      },
    );
  };

  return (
    <>
      <SetupCardFrame channelKey="discord" state={state} verification={verification}>
        {missingCredentials && <MissingCredentialNotice what="no bot token is saved" />}
        {manage ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void s.saveAllowlist();
            }}
          >
            <PlainField
              id="discord-allowlist"
              label="Allowed Discord user ids (comma-separated)"
              placeholder="123456789012345678"
              value={s.users}
              onChange={s.setUsers}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Applied to the running channel without a restart. To change the bot token
                or the server, disconnect and connect again.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="sm" variant="outline" disabled={s.busy || !s.dirty}>
                  {s.busy ? "Saving…" : "Save Discord allowlist"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => s.setConfirmDisconnect(true)}
                  disabled={s.busy}
                >
                  Disconnect Discord
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              connect();
            }}
          >
            <SecretField
              id="discord-token"
              label="Discord bot token"
              placeholder="from the Discord developer portal"
              value={token}
              onChange={setToken}
            />
            <PlainField
              id="discord-users"
              label="Allowed Discord user ids (comma-separated)"
              placeholder="123456789012345678"
              value={s.users}
              onChange={s.setUsers}
            />
            <PlainField
              id="discord-guild"
              label="Server (guild) id (optional)"
              placeholder="leave empty to answer in every server the bot is in"
              value={guild}
              onChange={setGuild}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                The token is checked with Discord, then saved. An empty allowlist denies
                every sender.
              </span>
              <Button
                type="submit"
                size="sm"
                className="shrink-0"
                disabled={s.busy || !token.trim()}
              >
                {s.busy ? "Connecting…" : "Connect Discord"}
              </Button>
            </div>
          </form>
        )}
      </SetupCardFrame>
      <DisconnectDialog
        open={s.confirmDisconnect}
        label="Discord"
        description="The saved bot token is cleared. To reconnect, enter a new token from the Discord developer portal."
        busy={s.busy}
        onClose={() => s.setConfirmDisconnect(false)}
        onConfirm={() => void s.runDisconnect("Discord")}
      />
      <DriftDialog
        drift={s.drift}
        busy={s.busy}
        onClose={() => s.setDrift(null)}
        onConfirm={async () => {
          s.setDrift(null);
          await s.runSave();
        }}
      />
    </>
  );
}

/**
 * Slack: two tokens that are not interchangeable, plus an optional channel
 * filter.
 *
 * The bot token authenticates API calls; the app-level token opens Socket Mode.
 * With Socket Mode on, a channel filter makes the bot ignore direct messages —
 * the gateway returns that caveat in `warning` and the card relays it verbatim
 * rather than deciding for itself when it applies.
 */
function SlackCard({
  connected,
  missingCredentials,
  state,
  verification,
  allowedUsers,
  onReload,
}: {
  connected: boolean;
  missingCredentials: boolean;
  verification: ChannelVerification | null;
  state: ChannelState;
  allowedUsers: string[];
  onReload: (restartsRuntime: boolean) => void;
}) {
  const [botToken, setBotToken] = React.useState("");
  const [appToken, setAppToken] = React.useState("");
  const [channelId, setChannelId] = React.useState("");
  const s = useChannelSetup({
    channelKey: "slack",
    allowedUsers,
    connected,
    onReload,
    freshAllowlist: async () => channelAllowlist(await api.config(), "slack"),
    updateAllowlist: (users) => api.updateSlackAllowlist(users),
    disconnect: () => api.disconnectSlack(),
  });

  const manage = connected && !missingCredentials;

  const connect = () => {
    const bot = botToken.trim();
    if (!bot) return;
    void s.runConnect(
      () => api.connectSlack(bot, appToken.trim(), s.parseUsers(), channelId.trim() || undefined),
      () => "Connected Slack",
      () => {
        setBotToken("");
        setAppToken("");
        setChannelId("");
      },
    );
  };

  return (
    <>
      <SetupCardFrame channelKey="slack" state={state} verification={verification}>
        {missingCredentials && <MissingCredentialNotice what="no bot token is saved" />}
        {manage ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void s.saveAllowlist();
            }}
          >
            <PlainField
              id="slack-allowlist"
              label="Allowed Slack user ids (comma-separated)"
              placeholder="U01234567"
              value={s.users}
              onChange={s.setUsers}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Applied to the running channel without a restart. To change either token
                or the channel filter, disconnect and connect again.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="sm" variant="outline" disabled={s.busy || !s.dirty}>
                  {s.busy ? "Saving…" : "Save Slack allowlist"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => s.setConfirmDisconnect(true)}
                  disabled={s.busy}
                >
                  Disconnect Slack
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              connect();
            }}
          >
            <SecretField
              id="slack-bot-token"
              label="Slack bot token"
              placeholder="xoxb-…"
              value={botToken}
              onChange={setBotToken}
            />
            <SecretField
              id="slack-app-token"
              label="Slack app-level token"
              placeholder="xapp-… (optional; turns on Socket Mode)"
              value={appToken}
              onChange={setAppToken}
            />
            <PlainField
              id="slack-users"
              label="Allowed Slack user ids (comma-separated)"
              placeholder="U01234567"
              value={s.users}
              onChange={s.setUsers}
            />
            <PlainField
              id="slack-channel"
              label="Channel id (optional)"
              placeholder="C01234567; leave empty to answer everywhere the bot is invited"
              value={channelId}
              onChange={setChannelId}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                The bot token is checked with Slack, then saved. The app-level token is
                checked for shape only; <code>doctor</code> reports whether Socket Mode
                actually connects.
              </span>
              <Button
                type="submit"
                size="sm"
                className="shrink-0"
                disabled={s.busy || !botToken.trim()}
              >
                {s.busy ? "Connecting…" : "Connect Slack"}
              </Button>
            </div>
          </form>
        )}
      </SetupCardFrame>
      <DisconnectDialog
        open={s.confirmDisconnect}
        label="Slack"
        description="The saved bot token and app-level token are cleared. To reconnect, enter them again from the Slack app settings."
        busy={s.busy}
        onClose={() => s.setConfirmDisconnect(false)}
        onConfirm={() => void s.runDisconnect("Slack")}
      />
      <DriftDialog
        drift={s.drift}
        busy={s.busy}
        onClose={() => s.setDrift(null)}
        onConfirm={async () => {
          s.setDrift(null);
          await s.runSave();
        }}
      />
    </>
  );
}

/**
 * WhatsApp Web setup card.
 *
 * Plan 369. Web-mode WhatsApp is linked by scanning a QR. The gateway
 * mints a fresh session file per link (`whatsapp-<unix>.db`), so two
 * clients never hold one session (plan 364 D-3); the QR is rendered
 * server-side as SVG (plan 364 D-2) and the browser shows it as an
 * `<img src="data:...">`, never as `innerHTML`. The SSE stream from
 * `POST /api/v1/channels/whatsapp_web/pair` runs through the dedicated
 * `/api/whatsapp-web/pair` relay (NOT the buffered `/api/rc/...` proxy
 * — that one reads the whole body before answering, which would never
 * let a frame through). The card owns the stream so navigating away
 * or unmounting aborts it.
 *
 * Exported so the WhatsApp-specific tests in
 * `whatsapp-web-card.test.tsx` can drive the component directly
 * without mounting the whole panel and its surrounding fetches.
 */
export function WhatsAppWebCard({
  connected,
  missingCredentials,
  state,
  verification,
  allowedNumbers,
  onReload,
}: {
  connected: boolean;
  missingCredentials: boolean;
  verification: ChannelVerification | null;
  state: ChannelState;
  allowedNumbers: string[];
  onReload: (restartsRuntime: boolean) => void;
}) {
  // Pairing state: idle (not started), streaming (SSE open), or a
  // terminal outcome (connected/timeout/failed). `qrSvg` carries the
  // most recent frame from the SSE stream so a re-render keeps the QR
  // visible without re-fetching.
  const [pairState, setPairState] = React.useState<
    "idle" | "streaming" | "connected" | "timeout" | "failed"
  >("idle");
  const [qrSvg, setQrSvg] = React.useState<string | null>(null);
  const [failReason, setFailReason] = React.useState<string | null>(null);
  // The half-configured state's Clear-section button goes through its
  // own dialog so the manage state's confirmDisconnect (provided by
  // the hook below) does not get tangled up. The two paths are
  // mutually exclusive — `manage` and `halfConfigured` cannot both be
  // true at once — so one dialog component reading both flags is fine.
  const [halfConfirmDisconnect, setHalfConfirmDisconnect] = React.useState(false);
  const [halfDisconnecting, setHalfDisconnecting] = React.useState(false);
  // The pair-time allowlist the user is about to link with. The pair
  // endpoint takes it once; afterwards the manage hook owns the
  // editable copy. Seeded from the saved list so a re-pair starts
  // from what the runtime already had.
  const [numbers, setNumbers] = React.useState<string[]>(allowedNumbers);
  React.useEffect(() => setNumbers(allowedNumbers), [allowedNumbers]);
  const abortRef = React.useRef<AbortController | null>(null);

  const manage = connected && !missingCredentials;
  // `halfConfigured`: a `channels_config.whatsapp_web` section exists
  // but its `session_path` is empty (e.g. written by hand, or the link
  // failed before persisting). D-3 forbids pairing while the section
  // exists, so the only path forward is to clear the section first;
  // the console needs to offer that path because `rantaiclaw setup`
  // would just write the same broken section back.
  const halfConfigured = connected && missingCredentials;

  // The allowlist half of the manage state goes through the same hook
  // Telegram/Discord/Slack use: a Save button, the drift pre-check
  // when the server's list moved while the box was open, and the one
  // shared disconnect dialog. The hook names the field `allowedUsers`
  // because Telegram set it that way; the array itself is the same
  // string[] whether the gateway calls it `allowed_users` or
  // `allowed_numbers`. Only the wire body differs.
  const s = useChannelSetup({
    channelKey: "whatsapp_web",
    allowedUsers: allowedNumbers,
    connected,
    onReload,
    freshAllowlist: async () => whatsappAllowlist(await api.config()),
    updateAllowlist: (users) => api.updateWhatsappWebAllowlist(users),
    disconnect: () => api.disconnectWhatsappWeb(),
  });

  // Open the SSE pairing stream. One per click; a second `Link` click
  // while a stream is open is a no-op so the in-flight flag on the
  // gateway does not 409 the operator.
  const startPair = React.useCallback(() => {
    if (pairState === "streaming") return;
    // Reset visible state from any previous attempt.
    setQrSvg(null);
    setFailReason(null);
    setPairState("streaming");
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      try {
        const res = await fetch("/api/whatsapp-web/pair", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            allowed_numbers: numbers.filter((n) => n.trim() !== ""),
          }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          // The relay passes the gateway's JSON error body through; the
          // most common is 409 already_linked, which surfaces here as
          // a failed state with the gateway's `detail`.
          const text = await res.text().catch(() => "");
          let detail = `pair refused (HTTP ${res.status})`;
          try {
            const parsed = JSON.parse(text) as { detail?: string; error?: string };
            detail = parsed.detail || parsed.error || detail;
          } catch {
            if (text) detail = text.slice(0, 200);
          }
          setFailReason(detail);
          setPairState("failed");
          return;
        }
        // Read the SSE frames one by one. Each `data:` line is a JSON
        // object whose `type` is one of qr / connected / timeout /
        // failed. PairCode is dropped server-side; we never see it
        // here, which is D-2.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line; keep parsing
          // until the buffer is exhausted or holds a complete frame.
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = frame
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            try {
              const parsed = JSON.parse(payload) as {
                type: string;
                svg?: string;
                reason?: string;
              };
              if (parsed.type === "qr" && parsed.svg) {
                setQrSvg(parsed.svg);
              } else if (parsed.type === "connected") {
                // The runtime now needs to pick up the freshly-
                // persisted session file; the gateway has scheduled
                // the daemon reload. Show the reload banner and ask
                // the panel to refetch once the gateway comes back.
                setPairState("connected");
                onReload(true);
                return;
              } else if (parsed.type === "timeout") {
                setPairState("timeout");
                return;
              } else if (parsed.type === "failed") {
                setFailReason(parsed.reason ?? "pair failed");
                setPairState("failed");
                return;
              }
            } catch {
              // Ignore a malformed frame; the next one will land.
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          // The operator navigated away or hit Cancel; nothing to
          // show, the stream was cancelled cleanly.
          setPairState("idle");
          return;
        }
        setFailReason(
          err instanceof Error ? err.message : "could not reach the gateway",
        );
        setPairState("failed");
      }
      // Note: deliberately do not clear `abortRef.current` here. The
      // unmount cleanup reads it to abort an in-flight stream; clearing
      // it would race the cleanup and let a stream outlive the card.
      // The next call to `startPair` overwrites the ref with a fresh
      // controller; that is the only place a stale entry is replaced.
    })();
  }, [pairState, numbers, onReload]);

  // Closing the card (unmount) aborts the open stream; aborting is
  // safe even when no stream is open.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // The half-configured Clear-section path uses the same DELETE endpoint
  // the manage state does, but goes through its own state because the
  // hook above already owns the dialog for the manage path. The toast
  // is the same one Telegram/Discord/Slack use: the shared toast helper
  // (`@/lib/channels`) maps the count into the title.
  const runHalfConfiguredDisconnect = React.useCallback(async () => {
    setHalfDisconnecting(true);
    try {
      const r = await api.disconnectWhatsappWeb();
      onReload(r.restarts_runtime === true);
    } catch (err) {
      setFailReason(err instanceof Error ? err.message : "disconnect failed");
    } finally {
      setHalfDisconnecting(false);
      setHalfConfirmDisconnect(false);
    }
  }, [onReload]);

  return (
    <>
      <SetupCardFrame
        channelKey="whatsapp_web"
        state={state}
        verification={verification}
      >
        {manage ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void s.saveAllowlist();
            }}
          >
            <PlainField
              id={s.fieldId("allowlist")}
              label="Allowed WhatsApp phone numbers (comma-separated, E.164)"
              placeholder="+15551234567"
              value={s.users}
              onChange={s.setUsers}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Applied to the running channel without a restart.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={s.busy || !s.dirty}
                >
                  {s.busy ? "Saving…" : "Save WhatsApp allowlist"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => s.setConfirmDisconnect(true)}
                  disabled={s.busy}
                >
                  {s.busy ? "Disconnecting…" : "Disconnect WhatsApp"}
                </Button>
              </div>
            </div>
            {pairState === "connected" && (
              <p className="text-xs text-emerald-400">
                Linked. The runtime picked up the new session after the next reload.
              </p>
            )}
          </form>
        ) : halfConfigured ? (
          // The section exists in `config.toml` but has no usable
          // session_path. Pair is refused while the section exists
          // (D-3), so the only recovery from the console is to clear
          // it; once `whatsapp_web` is `None`, the Link button works.
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A <code>channels_config.whatsapp_web</code> section is saved
              but has no session file, so the channel cannot start. Disconnect
              below to clear the section, then press <strong>Link WhatsApp</strong>
              to scan a fresh QR.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setHalfConfirmDisconnect(true)}
                disabled={halfDisconnecting}
              >
                {halfDisconnecting ? "Disconnecting…" : "Clear section"}
              </Button>
            </div>
            {failReason && (
              <p className="text-xs text-red-400">{failReason}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <PlainField
              id="whatsapp-web-numbers"
              label="Allowed WhatsApp phone numbers (comma-separated, E.164)"
              placeholder="+15551234567"
              value={numbers.join(", ")}
              onChange={(v) =>
                setNumbers(
                  v
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s !== ""),
                )
              }
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Open WhatsApp on your phone → Linked Devices → Link a Device, then
                scan the QR below. The gateway mints a fresh session file per
                scan; two phones never share one session.
              </span>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={() => startPair()}
                disabled={pairState === "streaming"}
              >
                {pairState === "streaming" ? "Linking…" : "Link WhatsApp"}
              </Button>
            </div>
            {/* The QR is rendered as an <img> from a data: URL built
                from the inline SVG the gateway sent. Plan 369: never
                as innerHTML. The browser caches the URL until the next
                frame arrives; navigating away aborts the stream and
                the QR disappears with the card. A timeout frame after
                a QR keeps the last SVG on screen so the operator can
                see what expired; `connected` / `failed` clear it. */}
            {qrSvg && pairState !== "connected" && pairState !== "failed" && (
              <div className="rounded-md border border-border bg-background p-4">
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
                  alt="WhatsApp Web pairing QR"
                  className="mx-auto block h-56 w-56"
                  data-testid="whatsapp-web-qr"
                />
              </div>
            )}
            {pairState === "timeout" && (
              <p className="text-xs text-amber-400">
                The gateway&rsquo;s pairing window expired before the phone scanned.
                Try again &mdash; the QR rotates each time you press Link WhatsApp.
              </p>
            )}
            {pairState === "failed" && failReason && (
              <p className="text-xs text-red-400">{failReason}</p>
            )}
          </div>
        )}
      </SetupCardFrame>
      <DisconnectDialog
        open={halfConfigured ? halfConfirmDisconnect : s.confirmDisconnect}
        label={halfConfigured ? "the WhatsApp Web section" : "WhatsApp"}
        description={
          halfConfigured
            ? "The empty channels_config.whatsapp_web section is cleared. Press Link WhatsApp after the daemon reloads to scan a fresh QR."
            : "The paired session is cleared. To reconnect, scan a fresh QR with your phone."
        }
        busy={s.busy || halfDisconnecting}
        onClose={() =>
          halfConfigured
            ? setHalfConfirmDisconnect(false)
            : s.setConfirmDisconnect(false)
        }
        onConfirm={() => {
          if (halfConfigured) {
            void runHalfConfiguredDisconnect();
          } else {
            void s.runDisconnect("WhatsApp");
          }
        }}
      />
      <DriftDialog
        drift={s.drift}
        busy={s.busy}
        onClose={() => s.setDrift(null)}
        onConfirm={async () => {
          s.setDrift(null);
          await s.runSave();
        }}
      />
    </>
  );
}
