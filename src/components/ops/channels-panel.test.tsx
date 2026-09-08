// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const channels = vi.fn();
const config = vi.fn();
const status = vi.fn();
const updateTelegramAllowlist = vi.fn();
const connectTelegram = vi.fn();
const disconnectTelegram = vi.fn();
const toastSuccess = vi.fn();
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
  },
}));
vi.mock("@/hooks/use-gateway-status", () => ({ useGatewayStatus: () => gateway }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
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
    key: "webhook",
    label: "Webhook",
    support: "under_development" as const,
    maturity: "under_development" as const,
    verification: "not_driven" as const,
    configured: false,
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
      configured: ["telegram", "discord", "webhook"],
      count: 3,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Discord/);
    expect(rows[1].textContent).toMatch(/Webhook/);
    expect(rows[1].textContent).toMatch(/Served by the gateway/);
    // This used to assert that "under development" appeared nowhere, back when
    // the console had no idea what a tier was. The support badge is deliberate
    // now, and it is still not part of the state vocabulary, so it appears on
    // the under-development row and on no other.
    expect(rows[0].textContent).not.toMatch(/Under development/);
    expect(rows[1].textContent).toMatch(/Under development/);
  });

  it("shows the two axes separately, so the three states read differently", async () => {
    // The point of the split. A grid of equal-looking rows says every channel is
    // equally ready, and the middle state is the one that was invisible: the
    // project stands behind Discord and nobody has driven it.
    channels.mockResolvedValue({
      configured: ["telegram", "discord", "webhook"],
      count: 3,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");

    // supported + not driven: no support badge, but the qualifier is there.
    expect(rows[0].textContent).toMatch(/Discord/);
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
    // before the split it rendered exactly like Discord, and after it, saying
    // nothing would leave the reader inferring the good case from silence.
    channels.mockResolvedValue({
      configured: ["telegram", "discord"],
      count: 2,
      channels: CATALOG,
    });
    render(<ChannelsPanel />);
    expect(await screen.findByText("verified")).toBeTruthy();

    const rows = await screen.findAllByRole("listitem");
    const undriven = rows.find((r) => r.textContent?.includes("Discord"));
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
    expect(
      await screen.findByText(/1 of the 3 channel types this runtime knows/),
    ).toBeTruthy();
  });

  it("shows the connect form and no list when nothing is configured", async () => {
    channels.mockResolvedValue({ configured: [], count: 0, channels: CATALOG });
    config.mockResolvedValue({ channels_config: {} });
    render(<ChannelsPanel />);
    expect(await screen.findByText("Not reachable on any channel")).toBeTruthy();
    expect(await screen.findByText("Not configured")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
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
    expect(await screen.findByText("Status unknown")).toBeTruthy();
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
