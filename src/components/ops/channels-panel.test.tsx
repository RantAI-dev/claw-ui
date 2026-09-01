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

beforeEach(() => {
  gateway.connection = "online";
  channels.mockResolvedValue({ configured: ["telegram"], count: 1 });
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
    expect(await screen.findByText("Running")).toBeTruthy();
  });

  it("shows the channel's last error", async () => {
    status.mockResolvedValue(
      statusWith({
        channels: component(),
        "channel:telegram": component("error", "401 Unauthorized"),
      }),
    );
    render(<ChannelsPanel />);
    expect(await screen.findByText("Error")).toBeTruthy();
    expect(await screen.findByText("last error: 401 Unauthorized")).toBeTruthy();
  });

  it("lists the other configured channels with the same vocabulary, and nothing else", async () => {
    channels.mockResolvedValue({ configured: ["telegram", "discord", "webhook"], count: 3 });
    render(<ChannelsPanel />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Discord/);
    expect(rows[1].textContent).toMatch(/Webhook/);
    expect(rows[1].textContent).toMatch(/Served by the gateway/);
    expect(screen.queryByText(/under development/i)).toBeNull();
  });

  it("shows the connect form and no list when nothing is configured", async () => {
    channels.mockResolvedValue({ configured: [], count: 0 });
    config.mockResolvedValue({ channels_config: {} });
    render(<ChannelsPanel />);
    expect(await screen.findByText("Not configured")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
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
    channels.mockResolvedValue({ configured: [], count: 0 });
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
