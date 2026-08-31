// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const status = vi.fn();
const doctor = vi.fn();
const insights = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    status: () => status(),
    doctor: () => doctor(),
    insights: () => insights(),
  },
}));

import { StatusPanel } from "./status-panel";

beforeEach(() => {
  status.mockResolvedValue({
    version: "0.0.0",
    provider: "openai",
    model: "gpt",
    memory_backend: "sqlite",
    autonomy: "Supervised",
    workspace_dir: "/w",
    paired: true,
    runtime: {},
  });
  doctor.mockResolvedValue({ results: [], skipped: [] });
  insights.mockResolvedValue({
    total_sessions: 12,
    total_messages: 345,
    avg_messages_per_session: 28.75,
    latest_session_id: "s1",
    latest_session_started_at: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const runtime = {
  components: {
    gateway: {
      last_error: null,
      last_ok: "2026-08-31T07:23:57Z",
      restart_count: 0,
      status: "ok",
      updated_at: "2026-08-31T07:23:57Z",
    },
  },
  pid: 4122820,
  updated_at: "2026-08-31T07:24:29Z",
  uptime_seconds: 3720,
};

const check = (severity: string, name: string) => ({
  name,
  category: "config",
  severity,
  message: `${name} message`,
  hint: null,
  duration_ms: 0,
});

describe("StatusPanel usage tiles", () => {
  it("fetches insights on mount and renders the totals", async () => {
    render(<StatusPanel />);
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(1));
    // Totals are formatted (thousands separator via toLocaleString) and the avg
    // is fixed to one decimal.
    expect(await screen.findByText("345")).toBeTruthy();
    expect(await screen.findByText("28.8")).toBeTruthy();
  });

  it("replaces the tiles with a next step when there are no sessions", async () => {
    insights.mockResolvedValue({
      total_sessions: 0,
      total_messages: 0,
      avg_messages_per_session: 0,
      latest_session_id: null,
      latest_session_started_at: null,
    });
    render(<StatusPanel />);
    expect(await screen.findByText("No sessions yet.")).toBeTruthy();
    expect(screen.queryByText("Sessions")).toBeNull();
  });
});

describe("StatusPanel health", () => {
  it("renders the daemon's health snapshot from status.runtime", async () => {
    status.mockResolvedValue({ ...(await status()), runtime });
    render(<StatusPanel />);
    expect(await screen.findByText("gateway")).toBeTruthy();
    expect(await screen.findByText("0 restarts")).toBeTruthy();
    expect(await screen.findByText(/Up 1h 2m/)).toBeTruthy();
  });

  it("says so when the gateway sent no snapshot", async () => {
    status.mockResolvedValue({ ...(await status()), runtime: undefined });
    render(<StatusPanel />);
    expect(await screen.findByText("This gateway did not send a health snapshot.")).toBeTruthy();
  });

  it("writes empty values as words and never warns about pairing that is off", async () => {
    status.mockResolvedValue({ ...(await status()), provider: "", model: "", paired: false });
    const { container } = render(<StatusPanel />);
    expect(await screen.findAllByText("not set")).toHaveLength(2);
    expect(await screen.findByText("not required")).toBeTruthy();
    expect(container.textContent).not.toContain("—");
    expect(container.querySelector("[class*='warning']")).toBeNull();
  });
});

describe("StatusPanel doctor checks", () => {
  it("names the checks a brief run skipped and leads with failures", async () => {
    doctor.mockResolvedValue({
      results: [check("Ok", "config.schema"), check("Fail", "config.paths"), check("Warn", "system.deps")],
      skipped: ["provider.ping", "channels.auth", "mcp.startup"],
    });
    render(<StatusPanel />);
    expect(
      await screen.findByText(/Three live checks were not run here \(provider\.ping, channels\.auth, mcp\.startup\)\./),
    ).toBeTruthy();
    expect(await screen.findByText(/1 failed · 1 warning · 1 ok\./)).toBeTruthy();
    const rows = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("message"));
    expect(rows.map((li) => li.textContent)).toEqual([
      expect.stringContaining("config.paths"),
      expect.stringContaining("system.deps"),
      expect.stringContaining("config.schema"),
    ]);
  });
});
