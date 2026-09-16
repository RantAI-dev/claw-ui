// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const channels = vi.fn();
const config = vi.fn();
const status = vi.fn();
const updateTelegramAllowlist = vi.fn();
const connectTelegram = vi.fn();
const disconnectTelegram = vi.fn();
const updateDiscordAllowlist = vi.fn();
const connectDiscord = vi.fn();
const disconnectDiscord = vi.fn();
const updateSlackAllowlist = vi.fn();
const connectSlack = vi.fn();
const disconnectSlack = vi.fn();
const updateLarkAllowlist = vi.fn();
const connectLark = vi.fn();
const disconnectLark = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const gateway: { connection: "connecting" | "online" | "offline" } = { connection: "online" };

// Keep the real `describeApiError` (useAsync maps every failure through it);
// only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    channels: () => channels(),
    config: () => config(),
    status: () => status(),
    updateTelegramAllowlist: (users: string[]) => updateTelegramAllowlist(users),
    connectTelegram: (token: string, users: string[]) => connectTelegram(token, users),
    disconnectTelegram: () => disconnectTelegram(),
    updateDiscordAllowlist: (users: string[]) => updateDiscordAllowlist(users),
    connectDiscord: (token: string, users: string[], guild?: string) =>
      connectDiscord(token, users, guild),
    disconnectDiscord: () => disconnectDiscord(),
    updateSlackAllowlist: (users: string[]) => updateSlackAllowlist(users),
    connectSlack: (bot: string, app: string, users: string[], channel?: string) =>
      connectSlack(bot, app, users, channel),
    disconnectSlack: () => disconnectSlack(),
    updateLarkAllowlist: (users: string[]) => updateLarkAllowlist(users),
    connectLark: (
      appId: string,
      appSecret: string,
      users: string[],
      useFeishu: boolean,
      encryptKey?: string,
      verificationToken?: string,
    ) => connectLark(appId, appSecret, users, useFeishu, encryptKey, verificationToken),
    disconnectLark: () => disconnectLark(),
  },
}));
vi.mock("@/hooks/use-gateway-status", () => ({ useGatewayStatus: () => gateway }));
vi.mock("sonner", () => ({
  toast: {
    // `error` is recorded rather than discarded: a card that swallows a refusal
    // and leaves the operator looking at an unchanged form is the failure these
    // suites exist to catch, and it cannot be asserted against a black hole.
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: vi.fn(),
    message: vi.fn(),
  },
}));

import { ChannelsPanel } from "./channels-panel";

function component(status = "ok", lastError: string | null = null) {
  return { status, last_error: lastError, last_ok: null, restart_count: 0, updated_at: null };
}

function statusWith(components: Record<string, unknown>) {
  return {
    version: "0.0.0",
    provider: "ollama",
    model: "stub",
    memory_backend: "sqlite",
    autonomy: "Supervised",
    workspace_dir: "/w",
    paired: false,
    runtime: { components, pid: 1, uptime_seconds: 5, updated_at: null },
  };
}

/**
 * What `/api/v1/channels` sends for its catalog. Deliberately short: the console
 * holds no catalog of its own any more, and a sixteen-row fixture here would be
 * the same hand-maintained copy this change deleted.
 */
const CATALOG = [
  {
    key: "telegram",
    label: "Telegram",
    support: "supported" as const,
    maturity: "supported" as const,
    verification: "driven" as const,
    configured: true,
  },
  {
    key: "discord",
    label: "Discord",
    support: "supported" as const,
    maturity: "supported" as const,
    verification: "not_driven" as const,
    configured: false,
  },
  {
    key: "slack",
    label: "Slack",
    support: "supported" as const,
    maturity: "supported" as const,
    verification: "not_driven" as const,
    configured: false,
  },
  // The row that is supported and never driven. Discord used to play this part,
  // and cannot any more: it has a setup card now, so it never appears in the
  // list. Without a stand-in, the state the two-axis split exists to show would
  // have stopped being covered here without a single test going red.
  {
    key: "matrix",
    label: "Matrix",
    support: "supported" as const,
    maturity: "supported" as const,
    verification: "not_driven" as const,
    configured: false,
  },
  {
    key: "webhook",
    label: "Webhook",
    support: "under_development" as const,
    maturity: "under_development" as const,
    verification: "not_driven" as const,
    configured: false,
  },
  // Plan 381: the fifth setup card. Still under development (plan 382, the
  // drive that promotes it, is not part of this fixture's history) — its card
  // renders anyway, the same way Discord's and Slack's do before they are
  // driven; support/maturity is a separate axis from "has a setup card".
  {
    key: "lark",
    label: "Lark",
    support: "under_development" as const,
    maturity: "under_development" as const,
    verification: "not_driven" as const,
    configured: false,
    // Present (even though false) only once the gateway's build actually
    // recognises Lark's config section — the same fact RantaiClaw #822 fixed.
    // A gateway old enough to not have that fix lists the "lark" key (the
    // catalog names every channel type the project knows, key gating or not)
    // but omits this field entirely, which is the real signal the card gates
    // on below, not mere key presence.
    has_credentials: false,
  },
];

beforeEach(() => {
  gateway.connection = "online";
  channels.mockResolvedValue({ configured: ["telegram"], count: 1, channels: CATALOG });
  config.mockResolvedValue({ channels_config: { telegram: { allowed_users: ["alice"] } } });
  status.mockResolvedValue(statusWith({ gateway: component() }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChannelsPanel status words", () => {
  it("says Configured, not connected, when only the gateway is running", async () => {
    // The old badge read "connected" off the config section alone, on a process
    // that has no channels runtime at all.
    render(<ChannelsPanel />);
    expect(await screen.findByText("Configured")).toBeTruthy();
    expect(await screen.findByText(/channels runtime is not running/)).toBeTruthy();
    expect(screen.queryByText(/^connected$/i)).toBeNull();
  });

  it("says Running only when the channel's own component is ok", async () => {
    status.mockResolvedValue(
      statusWith({ gateway: component(), channels: component(), "channel:telegram": component() }),
    );
    render(<ChannelsPanel />);
    expect(await screen.findByText("Reachable on Telegram")).toBeTruthy();
    expect(await screen.findByText("Running")).toBeTruthy();
  });

  it("opens with the failing channel and shows its last error", async () => {
    status.mockResolvedValue(
      statusWith({
        channels: component(),
        "channel:telegram": component("error", "401 Unauthorized"),
      }),
    );
    render(<ChannelsPanel />);
    expect(await screen.findByText("Telegram is failing")).toBeTruthy();
    expect(await screen.findByText("Error")).toBeTruthy();
    // Once in the verdict band, once in place on the card.
    expect(await screen.findAllByText("last error: 401 Unauthorized")).toHaveLength(2);
  });

  it("lists the other configured channels with the same vocabulary, and nothing else", async () => {
    channels.mockResolvedValue({
      configured: ["telegram", "matrix", "webhook"],
      count: 3,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Matrix/);
    expect(rows[1].textContent).toMatch(/Webhook/);
    expect(rows[1].textContent).toMatch(/Served by the gateway/);
    // This used to assert that "under development" appeared nowhere, back when
    // the console had no idea what a tier was. The support badge is deliberate
    // now, and it is still not part of the state vocabulary, so it appears on
    // the under-development row and on no other.
    expect(rows[0].textContent).not.toMatch(/Under development/);
    expect(rows[1].textContent).toMatch(/Under development/);
  });

  it("leaves Discord and Slack to their cards instead of listing them twice", async () => {
    // Both are configured here. A row and a card would both claim the channel,
    // and only the card can connect or disconnect it.
    channels.mockResolvedValue({
      configured: ["telegram", "discord", "slack", "webhook"],
      count: 4,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/Webhook/);
  });

  it("leaves WhatsApp Web to its own card instead of listing it twice", async () => {
    // F-41: its card shipped in #121, after CARDED_CHANNELS was last updated,
    // so a configured WhatsApp Web section named it again under Other
    // channels, whose controls could not do what the card does.
    channels.mockResolvedValue({
      configured: ["telegram", "whatsapp_web", "webhook"],
      count: 3,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/Webhook/);
    expect(rows.some((r) => /whatsapp/i.test(r.textContent ?? ""))).toBe(false);
  });

  it("shows the two axes separately, so the three states read differently", async () => {
    // The point of the split. A grid of equal-looking rows says every channel is
    // equally ready, and the middle state is the one that was invisible: the
    // project stands behind Matrix and nobody has driven it.
    channels.mockResolvedValue({
      configured: ["telegram", "matrix", "webhook"],
      count: 3,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");

    // supported + not driven: no support badge, but the qualifier is there.
    expect(rows[0].textContent).toMatch(/Matrix/);
    expect(rows[0].textContent).not.toMatch(/Under development/);
    expect(rows[0].textContent).toMatch(/not yet verified/);

    // under development + not driven: both signals.
    expect(rows[1].textContent).toMatch(/Webhook/);
    expect(rows[1].textContent).toMatch(/Under development/);
    expect(rows[1].textContent).toMatch(/not yet verified/);
  });

  it("says a driven channel is verified rather than leaving it to an absence", async () => {
    // Telegram is supported AND driven and has its own card, so the two states
    // sit on different components. The card has to say "verified" out loud:
    // before the split it rendered exactly like every undriven channel, and
    // after it, saying nothing would leave the reader inferring the good case
    // from silence.
    channels.mockResolvedValue({
      configured: ["telegram", "matrix"],
      count: 2,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    expect(await screen.findByText("verified")).toBeTruthy();

    const rows = await screen.findAllByRole("listitem");
    const undriven = rows.find((r) => r.textContent?.includes("Matrix"));
    expect(undriven?.textContent).toMatch(/not yet verified/);
  });

  it("renders a key the catalog does not carry as the key, with no tier claimed", async () => {
    channels.mockResolvedValue({
      configured: ["telegram", "zzz"],
      count: 2,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/zzz/);
    expect(rows[0].textContent).not.toMatch(/Under development/);
  });

  it("says what the label means before an operator commits credentials", async () => {
    render(<ChannelsPanel />);
    // Webhook and Lark: two of the six channel types this fixture's runtime
    // knows are under development.
    expect(
      await screen.findByText(/2 of the 6 channel types this runtime knows/),
    ).toBeTruthy();
  });

  it("shows the connect form and no list when nothing is configured", async () => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({ channels_config: {} });
    render(<ChannelsPanel />);
    expect(await screen.findByText("Not reachable on any channel")).toBeTruthy();
    // One badge per setup card, and all five say the same thing. Asserting the
    // count rather than "at least one" is what would catch a card that drifts
    // out of step with the others.
    expect(await screen.findAllByText("Not configured")).toHaveLength(5);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Discord" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Slack" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Link WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Lark" })).toBeTruthy();
  });

  it("says the runtime-level cause once, in the band, not on every card", async () => {
    channels.mockResolvedValue({
      configured: ["telegram", "discord"],
      count: 2,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    expect(await screen.findByText("2 channels configured, not running")).toBeTruthy();
    expect(await screen.findAllByText(/channels runtime is not running/)).toHaveLength(1);
  });

  it("shows the channels-wide approval boundary whether or not Telegram is configured", async () => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({
      channels_config: { approval_owners: ["1360247715"], autonomous_tools: false },
    });
    render(<ChannelsPanel />);
    expect(await screen.findByText("May approve tool calls:")).toBeTruthy();
    expect(await screen.findByText("1360247715")).toBeTruthy();
  });

  it("says Status unknown while the gateway is offline, whatever the last fetch said", async () => {
    gateway.connection = "offline";
    render(<ChannelsPanel />);
    // Every card, not just the first one: a card still claiming "Running" from
    // the last good fetch while the gateway is down is the defect this covers,
    // and it would hide behind a single-element assertion.
    expect(await screen.findAllByText("Status unknown")).toHaveLength(5);
  });
});

describe("ChannelsPanel actions", () => {
  async function saveWith(users: string) {
    render(<ChannelsPanel />);
    const box = (await screen.findByLabelText(/Allowed user ids/)) as HTMLInputElement;
    // The box is seeded from the config read after it renders; typing before
    // the seed lands is overwritten by it, and Save stays disabled (not dirty).
    await waitFor(() => expect(box.value).toBe("alice"));
    fireEvent.change(box, { target: { value: users } });
    fireEvent.click(screen.getByRole("button", { name: "Save allowlist" }));
    await waitFor(() => expect(updateTelegramAllowlist).toHaveBeenCalledTimes(1));
  }

  it("reports a save as one toast that says what the server stored", async () => {
    updateTelegramAllowlist.mockResolvedValue({
      connected: true,
      channel: "telegram",
      bot_username: null,
      allowed_users: 2,
      warning: null,
      note: "Saved. The running channel picks this up on its next message.",
      restarts_runtime: false,
    });
    await saveWith("alice, bob");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith("Allowlist saved: 2 senders allowed", {
      description: undefined,
    });
  });

  it("carries the gateway's warning as the toast's second line, still one toast", async () => {
    updateTelegramAllowlist.mockResolvedValue({
      connected: true,
      channel: "telegram",
      bot_username: null,
      allowed_users: 0,
      warning: "allowed_users is empty: the bot will deny ALL senders.",
      restarts_runtime: false,
    });
    await saveWith("");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][0]).toMatch(/no senders allowed/);
    expect(toastSuccess.mock.calls[0][1]).toEqual({
      description: "allowed_users is empty: the bot will deny ALL senders.",
    });
  });

  it("keeps the applying banner up until the gateway has gone away and come back", async () => {
    disconnectTelegram.mockResolvedValue({
      disconnected: true,
      channel: "telegram",
      restarts_runtime: true,
    });
    const view = render(<ChannelsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Disconnect")!,
    );
    expect(await screen.findByText(/Applying your change/)).toBeTruthy();
    // The gateway still answers on the commit that set the banner; it must not clear.
    view.rerender(<ChannelsPanel />);
    expect(screen.queryByText(/Applying your change/)).toBeTruthy();
    gateway.connection = "offline";
    view.rerender(<ChannelsPanel />);
    expect(screen.queryByText(/Applying your change/)).toBeTruthy();
    gateway.connection = "online";
    view.rerender(<ChannelsPanel />);
    await waitFor(() => expect(screen.queryByText(/Applying your change/)).toBeNull());
  });

  it("ends the banner when the runtime comes back under a new pid", async () => {
    // A managed restart can be over before the connection hook polls again, so
    // the gateway never looks offline; the pid is the evidence instead.
    disconnectTelegram.mockResolvedValue({
      disconnected: true,
      channel: "telegram",
      restarts_runtime: true,
    });
    render(<ChannelsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Disconnect")!,
    );
    expect(await screen.findByText(/Applying your change/)).toBeTruthy();
    status.mockResolvedValue({ ...statusWith({ gateway: component() }), runtime: { components: {}, pid: 2, uptime_seconds: 1, updated_at: null } });
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() => expect(screen.queryByText(/Applying your change/)).toBeNull());
  });

  it("names the connect fields with labels and submits on Enter", async () => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({ channels_config: {} });
    render(<ChannelsPanel />);
    const token = (await screen.findByLabelText("Bot token")) as HTMLInputElement;
    expect(screen.getByLabelText(/Allowed user ids/)).toBeTruthy();
    const connect = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.change(token, { target: { value: "123:abc" } });
    expect(connect.disabled).toBe(false);
    connectTelegram.mockResolvedValue({
      connected: true,
      channel: "telegram",
      bot_username: "bot",
      allowed_users: 0,
      warning: null,
      restarts_runtime: true,
    });
    fireEvent.submit(token.closest("form")!);
    await waitFor(() => expect(connectTelegram).toHaveBeenCalledWith("123:abc", []));
  });

  it("keeps Save disabled until the box differs from the saved list", async () => {
    render(<ChannelsPanel />);
    const box = (await screen.findByLabelText(/Allowed user ids/)) as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save allowlist" }) as HTMLButtonElement;
    // The box is seeded by an effect after the card mounts; CI is slow enough
    // to read it first.
    await waitFor(() => expect(box.value).toBe("alice"));
    expect(save.disabled).toBe(true);
    // Whitespace and a trailing comma are not a change.
    fireEvent.change(box, { target: { value: " alice , " } });
    expect(save.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "alice, bob" } });
    expect(save.disabled).toBe(false);
  });

  it("shows Refresh as busy while a request is in flight", async () => {
    render(<ChannelsPanel />);
    const button = (await screen.findByRole("button", { name: /Refresh/ })) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    channels.mockReturnValue(new Promise(() => {}));
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
  });
});

/**
 * The two cards this change adds.
 *
 * Each test pushes its own `channels` fixture rather than editing the shared
 * `CATALOG`, because `has_credentials` matters to two of them and adding it to
 * the shared fixture would quietly change what the other suites are asserting.
 */
describe("ChannelsPanel Discord", () => {
  beforeEach(() => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({ channels_config: {} });
  });

  const CONNECTED = {
    connected: true,
    channel: "discord",
    bot_username: null,
    allowed_users: 1,
    warning: null,
    restarts_runtime: true,
  };

  it("sends the bot token, the allowlist and an optional guild id", async () => {
    render(<ChannelsPanel />);
    const token = (await screen.findByLabelText("Discord bot token")) as HTMLInputElement;
    const users = screen.getByLabelText(/Allowed Discord user ids/);
    const guild = screen.getByLabelText(/Server \(guild\) id/);

    const connect = screen.getByRole("button", { name: "Connect Discord" }) as HTMLButtonElement;
    // Nothing to send without a credential, so the control says so rather than
    // letting the operator find out from a 400.
    expect(connect.disabled).toBe(true);

    fireEvent.change(token, { target: { value: "discord-token" } });
    fireEvent.change(users, { target: { value: "111, 222" } });
    fireEvent.change(guild, { target: { value: "G1" } });
    connectDiscord.mockResolvedValue(CONNECTED);
    fireEvent.click(connect);

    await waitFor(() =>
      expect(connectDiscord).toHaveBeenCalledWith("discord-token", ["111", "222"], "G1"),
    );
  });

  it("never renders the token back into the field after a save", async () => {
    // The field is a password box and the gateway never echoes a credential;
    // re-seeding it from anything would put a secret back on screen and into
    // the next request body.
    render(<ChannelsPanel />);
    const token = (await screen.findByLabelText("Discord bot token")) as HTMLInputElement;
    fireEvent.change(token, { target: { value: "discord-token" } });
    connectDiscord.mockResolvedValue(CONNECTED);
    fireEvent.click(screen.getByRole("button", { name: "Connect Discord" }));

    await waitFor(() => expect(connectDiscord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(token.value).toBe(""));
  });

  it("edits the allowlist without re-sending the token, and says what the server stored", async () => {
    channels.mockResolvedValue({
      configured: ["discord"],
      count: 1,
      channels: CATALOG,
    });
    config.mockResolvedValue({
      channels_config: { discord: { allowed_users: ["111"] } },
    });
    render(<ChannelsPanel />);
    const box = (await screen.findByLabelText(/Allowed Discord user ids/)) as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe("111"));

    const save = screen.getByRole("button", {
      name: "Save Discord allowlist",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(box, { target: { value: "111, 222" } });
    updateDiscordAllowlist.mockResolvedValue({ ...CONNECTED, allowed_users: 2, restarts_runtime: false });
    fireEvent.click(save);

    await waitFor(() => expect(updateDiscordAllowlist).toHaveBeenCalledWith(["111", "222"]));
    expect(connectDiscord).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Allowlist saved: 2 senders allowed", {
        description: undefined,
      }),
    );
  });

  it("asks before revoking someone who was added while the panel sat open", async () => {
    // The same protection Telegram has: the POST replaces the list wholesale,
    // so a sender who self-onboarded since the editor was seeded would be
    // removed with nothing on screen saying so.
    channels.mockResolvedValue({ configured: ["discord"], count: 1, channels: CATALOG });
    config.mockResolvedValue({ channels_config: { discord: { allowed_users: ["111"] } } });
    render(<ChannelsPanel />);
    const box = (await screen.findByLabelText(/Allowed Discord user ids/)) as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe("111"));
    fireEvent.change(box, { target: { value: "111, 222" } });

    // The server has moved on: 999 arrived after the panel loaded.
    config.mockResolvedValue({
      channels_config: { discord: { allowed_users: ["111", "999"] } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Discord allowlist" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/999/);
    expect(updateDiscordAllowlist).not.toHaveBeenCalled();
  });

  it("clears the saved credentials on disconnect, after a confirmation", async () => {
    channels.mockResolvedValue({ configured: ["discord"], count: 1, channels: CATALOG });
    config.mockResolvedValue({ channels_config: { discord: { allowed_users: ["111"] } } });
    render(<ChannelsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Discord" }));

    const dialog = await screen.findByRole("dialog");
    disconnectDiscord.mockResolvedValue({
      disconnected: true,
      channel: "discord",
      restarts_runtime: true,
    });
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Disconnect",
      )!,
    );
    await waitFor(() => expect(disconnectDiscord).toHaveBeenCalledTimes(1));
  });

  it("says a configured channel has no credential instead of letting it read as connected", async () => {
    // `[channels_config.discord]` written by hand with the token left out. Every
    // surface in this console used to call that "configured" and the channel
    // never started.
    channels.mockResolvedValue({
      configured: ["discord"],
      count: 1,
      channels: CATALOG.map((c) =>
        c.key === "discord" ? { ...c, configured: true, has_credentials: false } : c,
      ),
    });
    config.mockResolvedValue({ channels_config: { discord: { allowed_users: ["111"] } } });
    render(<ChannelsPanel />);

    expect(await screen.findByText(/no bot token is saved/i)).toBeTruthy();
    // And the way out is on screen: the connect form, not the allowlist editor.
    expect(screen.getByLabelText("Discord bot token")).toBeTruthy();
  });

  it("reports a refusal from the gateway instead of swallowing it", async () => {
    render(<ChannelsPanel />);
    const token = (await screen.findByLabelText("Discord bot token")) as HTMLInputElement;
    fireEvent.change(token, { target: { value: "bad-token" } });
    connectDiscord.mockRejectedValue(new Error("discord rejected the bot token: 401"));
    fireEvent.click(screen.getByRole("button", { name: "Connect Discord" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(String(toastError.mock.calls[0][0])).toMatch(/rejected the bot token/);
  });
});

describe("ChannelsPanel Slack", () => {
  beforeEach(() => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({ channels_config: {} });
  });

  it("sends the two tokens separately, plus an optional channel id", async () => {
    render(<ChannelsPanel />);
    const bot = (await screen.findByLabelText("Slack bot token")) as HTMLInputElement;
    const app = screen.getByLabelText("Slack app-level token");
    const users = screen.getByLabelText(/Allowed Slack user ids/);
    const channel = screen.getByLabelText(/Channel id/);

    fireEvent.change(bot, { target: { value: "xoxb-1" } });
    fireEvent.change(app, { target: { value: "xapp-1-A" } });
    fireEvent.change(users, { target: { value: "U1" } });
    fireEvent.change(channel, { target: { value: "C1" } });
    connectSlack.mockResolvedValue({
      connected: true,
      channel: "slack",
      bot_username: null,
      allowed_users: 1,
      warning: null,
      restarts_runtime: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Slack" }));

    await waitFor(() =>
      expect(connectSlack).toHaveBeenCalledWith("xoxb-1", "xapp-1-A", ["U1"], "C1"),
    );
  });

  it("shows the gateway's Socket Mode caveat rather than inventing one", async () => {
    // F-3 from the 2026-09-11 drive: with Socket Mode on, a channel id filter
    // makes the bot ignore every direct message. The gateway decides when that
    // applies and returns the sentence; the console must not guess at it.
    render(<ChannelsPanel />);
    const bot = (await screen.findByLabelText("Slack bot token")) as HTMLInputElement;
    fireEvent.change(bot, { target: { value: "xoxb-1" } });
    connectSlack.mockResolvedValue({
      connected: true,
      channel: "slack",
      bot_username: null,
      allowed_users: 0,
      warning:
        "Socket Mode with a channel_id set: the bot ignores direct messages and every other conversation.",
      restarts_runtime: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Slack" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][1]).toEqual({
      description:
        "Socket Mode with a channel_id set: the bot ignores direct messages and every other conversation.",
    });
  });

  it("edits the allowlist without re-sending either token", async () => {
    channels.mockResolvedValue({ configured: ["slack"], count: 1, channels: CATALOG });
    config.mockResolvedValue({ channels_config: { slack: { allowed_users: ["U1"] } } });
    render(<ChannelsPanel />);
    const box = (await screen.findByLabelText(/Allowed Slack user ids/)) as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe("U1"));
    fireEvent.change(box, { target: { value: "U1, U2" } });
    updateSlackAllowlist.mockResolvedValue({
      connected: true,
      channel: "slack",
      bot_username: null,
      allowed_users: 2,
      warning: null,
      restarts_runtime: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Slack allowlist" }));

    await waitFor(() => expect(updateSlackAllowlist).toHaveBeenCalledWith(["U1", "U2"]));
    expect(connectSlack).not.toHaveBeenCalled();
  });
});

describe("ChannelsPanel Lark", () => {
  beforeEach(() => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({ channels_config: {} });
  });

  const CONNECTED = {
    connected: true,
    channel: "lark",
    bot_username: null,
    allowed_users: 1,
    warning: null,
    restarts_runtime: true,
  };

  it("does not offer a card when the gateway's catalog omits Lark entirely", async () => {
    // The degenerate case: a gateway too old to send this key at all.
    channels.mockResolvedValue({
      configured: [],
      count: 0,
      channels: CATALOG.filter((c) => c.key !== "lark"),
    });
    render(<ChannelsPanel />);
    await screen.findByText("Not reachable on any channel");
    expect(screen.queryByRole("button", { name: "Connect Lark" })).toBeNull();
  });

  it("does not offer a card when the catalog names Lark but the gateway predates it", async () => {
    // The real case, checked against RantaiClaw's last released binary
    // (v0.31.0-alpha): the catalog already names every channel type the
    // project knows, key gating or not, so "lark" is present there too — a
    // gateway older than RantaiClaw #822/#825 still lists it, but omits
    // `has_credentials` because that gateway's build never recognised a
    // configured Lark section in the first place. Key presence alone is not
    // the signal; `has_credentials` being sent at all is.
    channels.mockResolvedValue({
      configured: [],
      count: 0,
      channels: CATALOG.map((c) =>
        c.key === "lark" ? { ...c, has_credentials: undefined } : c,
      ),
    });
    render(<ChannelsPanel />);
    await screen.findByText("Not reachable on any channel");
    expect(screen.queryByRole("button", { name: "Connect Lark" })).toBeNull();
  });

  it("sends the app id, app secret, allowlist and region", async () => {
    render(<ChannelsPanel />);
    const appId = (await screen.findByLabelText("Lark app id")) as HTMLInputElement;
    const appSecret = screen.getByLabelText("Lark app secret") as HTMLInputElement;
    const users = screen.getByLabelText(/Allowed Lark user ids/);
    // The gateway never sends a credential back, and nothing in this card's
    // props carries one either, so the field starts empty on every mount.
    expect(appSecret.value).toBe("");

    const connect = screen.getByRole("button", { name: "Connect Lark" }) as HTMLButtonElement;
    // Nothing to send without both credentials, so the control says so rather
    // than letting the operator find out from a 400.
    expect(connect.disabled).toBe(true);

    fireEvent.change(appId, { target: { value: "cli_test-app-id" } });
    fireEvent.change(appSecret, { target: { value: "test-app-secret-not-real" } });
    fireEvent.change(users, { target: { value: "ou_1, ou_2" } });
    connectLark.mockResolvedValue(CONNECTED);
    fireEvent.click(connect);

    // D-2: Lark international by default, so `use_feishu` is false unless the
    // region switch is touched.
    await waitFor(() =>
      expect(connectLark).toHaveBeenCalledWith(
        "cli_test-app-id",
        "test-app-secret-not-real",
        ["ou_1", "ou_2"],
        false,
        undefined,
        undefined,
      ),
    );
    await waitFor(() => expect(appSecret.value).toBe(""));
    // The gateway said this save restarts the runtime, so the banner tells the
    // operator an outage is expected rather than an error.
    expect(await screen.findByText(/Applying your change/)).toBeTruthy();
  });

  it("reaches the request body when the region switch is set to Feishu", async () => {
    render(<ChannelsPanel />);
    fireEvent.change(await screen.findByLabelText("Lark app id"), {
      target: { value: "cli_test-app-id" },
    });
    fireEvent.change(screen.getByLabelText("Lark app secret"), {
      target: { value: "test-app-secret-not-real" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Feishu" }));
    connectLark.mockResolvedValue(CONNECTED);
    fireEvent.click(screen.getByRole("button", { name: "Connect Lark" }));

    await waitFor(() =>
      expect(connectLark).toHaveBeenCalledWith(
        "cli_test-app-id",
        "test-app-secret-not-real",
        [],
        true,
        undefined,
        undefined,
      ),
    );
  });

  it("edits the allowlist without re-sending credentials, and reloads without a restart", async () => {
    channels.mockResolvedValue({
      configured: ["lark"],
      count: 1,
      channels: CATALOG.map((c) =>
        c.key === "lark" ? { ...c, configured: true, has_credentials: true } : c,
      ),
    });
    config.mockResolvedValue({ channels_config: { lark: { allowed_users: ["ou_1"] } } });
    render(<ChannelsPanel />);
    const box = (await screen.findByLabelText(/Allowed Lark user ids/)) as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe("ou_1"));

    const save = screen.getByRole("button", { name: "Save Lark allowlist" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(box, { target: { value: "ou_1, ou_2" } });
    updateLarkAllowlist.mockResolvedValue({
      ...CONNECTED,
      allowed_users: 2,
      restarts_runtime: false,
    });
    fireEvent.click(save);

    await waitFor(() => expect(updateLarkAllowlist).toHaveBeenCalledWith(["ou_1", "ou_2"]));
    expect(connectLark).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Allowlist saved: 2 senders allowed", {
        description: undefined,
      }),
    );
    // An allowlist-only edit is applied live through Channel::apply_allowed_senders
    // (plan 380): no restart, so no outage banner.
    expect(screen.queryByText(/Applying your change/)).toBeNull();
  });

  it("relays the gateway's warning instead of inventing one", async () => {
    render(<ChannelsPanel />);
    fireEvent.change(await screen.findByLabelText("Lark app id"), {
      target: { value: "cli_test-app-id" },
    });
    fireEvent.change(screen.getByLabelText("Lark app secret"), {
      target: { value: "test-app-secret-not-real" },
    });
    connectLark.mockResolvedValue({
      ...CONNECTED,
      allowed_users: 0,
      warning: "No allowlist set: every sender is denied until one is added.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Lark" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][1]).toEqual({
      description: "No allowlist set: every sender is denied until one is added.",
    });
  });

  it("clears the saved credentials on disconnect, after a confirmation", async () => {
    channels.mockResolvedValue({
      configured: ["lark"],
      count: 1,
      channels: CATALOG.map((c) =>
        c.key === "lark" ? { ...c, configured: true, has_credentials: true } : c,
      ),
    });
    config.mockResolvedValue({ channels_config: { lark: { allowed_users: ["ou_1"] } } });
    render(<ChannelsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Lark" }));

    const dialog = await screen.findByRole("dialog");
    disconnectLark.mockResolvedValue({ disconnected: true, channel: "lark", restarts_runtime: true });
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Disconnect",
      )!,
    );
    await waitFor(() => expect(disconnectLark).toHaveBeenCalledTimes(1));
  });

  it("reports a refusal from the gateway instead of swallowing it", async () => {
    render(<ChannelsPanel />);
    fireEvent.change(await screen.findByLabelText("Lark app id"), {
      target: { value: "cli_test-app-id" },
    });
    fireEvent.change(screen.getByLabelText("Lark app secret"), {
      target: { value: "bad-secret" },
    });
    connectLark.mockRejectedValue(new Error("lark rejected the app secret: 401"));
    fireEvent.click(screen.getByRole("button", { name: "Connect Lark" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(String(toastError.mock.calls[0][0])).toMatch(/rejected the app secret/);
  });
});
