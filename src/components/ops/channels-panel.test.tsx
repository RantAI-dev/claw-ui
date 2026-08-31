// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const channels = vi.fn();
const config = vi.fn();
const status = vi.fn();
const gateway: { connection: "connecting" | "online" | "offline" } = { connection: "online" };

// Keep the real `describeApiError` (useAsync maps every failure through it);
// only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    channels: () => channels(),
    config: () => config(),
    status: () => status(),
  },
}));
vi.mock("@/hooks/use-gateway-status", () => ({ useGatewayStatus: () => gateway }));

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
