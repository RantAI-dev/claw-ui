"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { describeApiError } from "@/lib/api";
import { allowlistDrift, allowlistToastTitle, type ChannelState } from "@/lib/channels";
import { channelDot } from "@/lib/console";
import type { ChannelConnectResult, ChannelDisconnectResult, ChannelVerification } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The pieces three setup cards share.
 *
 * Telegram's card was the only one until Discord and Slack got endpoints behind
 * them. Three copies of a token field, an allowlist editor with a drift check,
 * and a disconnect confirmation is the point at which extraction pays for
 * itself — below three it is guesswork about what varies.
 *
 * What deliberately did NOT move: each card keeps its own credential fields and
 * its own words. Discord takes a guild id, Slack takes two tokens that are not
 * interchangeable, and Telegram names @BotFather. Folding those into one
 * configurable form would have produced a component with a field list as a
 * parameter, which is harder to read than the three forms it replaces.
 */

/** Pull one channel's allowlist out of GET /config (tokens there are redacted). */
export function channelAllowlist(
  config: Record<string, unknown> | null,
  key: string,
): string[] {
  const cc = config?.["channels_config"] as Record<string, unknown> | undefined;
  const section = cc?.[key] as Record<string, unknown> | undefined;
  const allowed = section?.["allowed_users"];
  return Array.isArray(allowed) ? (allowed as string[]) : [];
}

/** WhatsApp Web uses `allowed_numbers` rather than `allowed_users`. */
export function whatsappAllowlist(
  config: Record<string, unknown> | null,
): string[] {
  const cc = config?.["channels_config"] as Record<string, unknown> | undefined;
  const section = cc?.["whatsapp_web"] as Record<string, unknown> | undefined;
  const allowed = section?.["allowed_numbers"];
  return Array.isArray(allowed) ? (allowed as string[]) : [];
}

/** A credential box: never seeded, never re-rendered with what was saved. */
export function SecretField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </>
  );
}

/** A plain text box with its label: the allowlist, a guild id, a channel id. */
export function PlainField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

/**
 * The card shell: the channel's dot, its runtime state, and the verification
 * axis said out loud rather than left to an absence.
 */
export function SetupCardFrame({
  channelKey,
  state,
  verification,
  children,
}: {
  channelKey: string;
  state: ChannelState;
  verification: ChannelVerification | null;
  children: React.ReactNode;
}) {
  return (
    // Named so one card can be addressed on a page that now holds three.
    // Without it the only handle is the DOM shape around a heading, which is
    // either too loose (it matches every card) or too tight (it matches the
    // heading's own wrapper and none of the card's content).
    <Card className="p-0" data-channel-card={channelKey}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ background: channelDot(channelKey) }}
        />
        <Badge variant={state.tone}>{state.label}</Badge>
        {verification === "driven" && (
          <span className="text-xs text-muted-foreground">verified</span>
        )}
        {verification === "not_driven" && (
          <span className="text-xs text-muted-foreground">not yet verified</span>
        )}
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
        {children}
      </div>
    </Card>
  );
}

/**
 * A configured channel whose credential is missing.
 *
 * Only a runtime that answers `has_credentials` can put a card here. It reads
 * as connected on every other surface and never starts, so the card says the
 * cause and shows the connect form rather than an allowlist editor for a
 * channel that cannot run.
 */
export function MissingCredentialNotice({ what }: { what: string }) {
  return (
    <p className="text-xs text-[var(--accent-orange)]">
      This channel is configured but {what}, so it cannot start. Enter one below.
    </p>
  );
}

export interface ChannelSetupOptions {
  /** Catalog key, used for the field ids so three cards can coexist. */
  channelKey: string;
  /** The saved allowlist, which seeds the editor once connected. */
  allowedUsers: string[];
  /** Whether the editor should be seeded at all. */
  connected: boolean;
  onReload: (restartsRuntime: boolean) => void;
  /** Re-read the freshest allowlist for the drift pre-check. */
  freshAllowlist: () => Promise<string[]>;
  updateAllowlist: (users: string[]) => Promise<ChannelConnectResult>;
  disconnect: () => Promise<ChannelDisconnectResult>;
}

/**
 * The allowlist half of a setup card: the editor, the drift pre-check, the
 * disconnect confirmation, and the one toast per action.
 *
 * Credentials stay with the card. This owns only what all three do identically.
 */
export function useChannelSetup({
  channelKey,
  allowedUsers,
  connected,
  onReload,
  freshAllowlist,
  updateAllowlist,
  disconnect,
}: ChannelSetupOptions) {
  const [users, setUsers] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  // Set when the server's allowlist has moved since the editor was seeded, so
  // saving would revoke someone the operator never saw.
  const [drift, setDrift] = React.useState<{
    wouldRevoke: string[];
    alsoChanged: string[];
  } | null>(null);

  const savedAllowlist = allowedUsers.join(", ");
  React.useEffect(() => {
    if (connected) setUsers(savedAllowlist);
  }, [connected, savedAllowlist]);

  const parseUsers = React.useCallback(
    () =>
      users
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [users],
  );

  // Nothing to save while the box holds the saved list (whitespace and a
  // trailing comma are not a change).
  const dirty =
    parseUsers().join(",") !==
    allowedUsers
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");

  const runSave = async () => {
    setBusy(true);
    try {
      const r = await updateAllowlist(parseUsers());
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
      fresh = await freshAllowlist();
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

  const runDisconnect = async (label: string) => {
    setBusy(true);
    try {
      const r = await disconnect();
      toast.success(`${label} disconnected`);
      setUsers("");
      setConfirmDisconnect(false);
      onReload(r.restarts_runtime === true);
    } catch (e) {
      toast.error(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Run a connect and clear the credential boxes on success.
   *
   * `clearCredentials` is the card's, because the card owns those fields. The
   * gateway never echoes a credential, so nothing re-seeds them.
   */
  const runConnect = async (
    send: () => Promise<ChannelConnectResult>,
    title: (r: ChannelConnectResult) => string,
    clearCredentials: () => void,
  ) => {
    setBusy(true);
    try {
      const r = await send();
      toast.success(title(r), { description: r.warning ?? undefined });
      clearCredentials();
      onReload(r.restarts_runtime === true);
    } catch (e) {
      toast.error(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    fieldId: (part: string) => `${channelKey}-${part}`,
    users,
    setUsers,
    parseUsers,
    dirty,
    busy,
    drift,
    setDrift,
    confirmDisconnect,
    setConfirmDisconnect,
    runConnect,
    runSave,
    saveAllowlist,
    runDisconnect,
  };
}

/** The "someone was added while this was open" confirmation. */
export function DriftDialog({
  drift,
  busy,
  onClose,
  onConfirm,
}: {
  drift: { wouldRevoke: string[]; alsoChanged: string[] } | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmModal
      open={drift !== null}
      onClose={onClose}
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
      onConfirm={onConfirm}
    />
  );
}

/** The disconnect confirmation. The confirm button says "Disconnect" on every card. */
export function DisconnectDialog({
  open,
  label,
  description,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  label: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      title={`Disconnect ${label}?`}
      description={description}
      confirmLabel="Disconnect"
      icon={null}
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
