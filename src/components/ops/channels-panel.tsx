"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function ChannelsPanel() {
  const { data, loading, error, refresh } = useAsync(() => api.channels(), []);
  const cfg = useAsync(() => api.config(), []);
  const tgConnected = !!data?.configured.includes("telegram");

  const refreshNow = () => {
    refresh();
    cfg.refresh();
  };
  // Channel config changes reload the runtime (a few seconds), so refetch after a
  // short settle delay — an instant refetch would race the gateway restart.
  const refreshAfterReload = () => {
    setTimeout(refreshNow, 3000);
  };

  return (
    <div>
      <SectionTitle action={<RefreshButton onClick={refreshNow} />}>
        Channels {data && <span className="text-muted-foreground">· {data.count} configured</span>}
      </SectionTitle>
      <PanelFrame loading={loading} error={error} onRefresh={refreshNow}>
        <TelegramCard
          connected={tgConnected}
          allowedUsers={telegramAllowlist(cfg.data)}
          onReload={refreshAfterReload}
        />

        <div className="mt-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            More channels
          </div>
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
  allowedUsers,
  onReload,
}: {
  connected: boolean;
  allowedUsers: string[];
  onReload: () => void;
}) {
  const [token, setToken] = React.useState("");
  const [users, setUsers] = React.useState("");
  const [busy, setBusy] = React.useState(false);

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

  const notify = (r: { warning?: string | null; note?: string }) => {
    if (r.warning) toast.warning(r.warning);
    else if (r.note) toast.message(r.note);
  };

  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await api.connectTelegram(t, parseUsers());
      toast.success(`Connected Telegram @${r.bot_username}`);
      notify(r);
      setToken("");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAllowlist = async () => {
    setBusy(true);
    try {
      const r = await api.updateTelegramAllowlist(parseUsers());
      toast.success("Allowlist updated");
      notify(r);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect Telegram? The saved bot token will be cleared — you'll need to re-enter it from @BotFather to reconnect.",
      )
    )
      return;
    setBusy(true);
    try {
      await api.disconnectTelegram();
      toast.success("Disconnected Telegram");
      setUsers("");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          Telegram
          {connected ? (
            <Badge variant="success" className="text-[10px] uppercase tracking-wide">
              connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              not connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {connected ? (
          <>
            <label className="text-xs text-muted-foreground">
              Allowed user ids / usernames (comma-separated)
            </label>
            <Input
              placeholder="Leave empty to deny all senders"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Saving reloads the runtime to apply — no need to re-enter the bot token.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={saveAllowlist} disabled={busy}>
                  {busy ? "Saving…" : "Save allowlist"}
                </Button>
                <Button size="sm" variant="destructive" onClick={disconnect} disabled={busy}>
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
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <Input
              placeholder="Allowed user ids / usernames (comma-separated)"
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
  );
}

function UnderDevelopmentChannel({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {active && (
          <Badge variant="success" className="text-[9px] uppercase tracking-wide">
            active
          </Badge>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {active ? "Running · manage via TUI" : "Under development"}
      </div>
    </div>
  );
}
