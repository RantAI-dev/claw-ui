// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { AUTONOMY_CHANGED } from "@/lib/console";

const status = vi.fn();
const config = vi.fn();
const doctor = vi.fn();
const insights = vi.fn();

// Keep the real `describeApiError` (useAsync maps every failure through it);
// only the three requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    status: () => status(),
    config: () => config(),
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
  // The fresh-install shape: supervised with the default `ssh`/`pty` always-ask
  // entries. The gateway's own `/status` calls this "manual".
  config.mockResolvedValue({
    autonomy: { level: "supervised", always_ask: ["ssh", "pty"], auto_approve: ["file_read"] },
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
  it("opens with the verdict and the vitals from status.runtime", async () => {
    status.mockResolvedValue({ ...(await status()), runtime });
    render(<StatusPanel />);
    expect(await screen.findByText("Runtime healthy")).toBeTruthy();
    // Single healthy component: one metadata line, no per-component rows.
    expect(await screen.findByText(/gateway ok · up 1h 2m · 0 restarts · pid 4122820/)).toBeTruthy();
  });

  it("leads with the unwell component when one is", async () => {
    status.mockResolvedValue({
      ...(await status()),
      runtime: {
        components: {
          gateway: { status: "ok", restart_count: 0 },
          telegram: { status: "degraded", restart_count: 3, last_error: "401 Unauthorized" },
        },
        pid: 1,
        uptime_seconds: 60,
      },
    });
    render(<StatusPanel />);
    expect(await screen.findByText("telegram degraded")).toBeTruthy();
    // More than one component: the rows appear, errors named.
    expect(await screen.findByText("last error: 401 Unauthorized")).toBeTruthy();
    expect(await screen.findByText("3 restarts")).toBeTruthy();
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

describe("StatusPanel autonomy row", () => {
  it("reads the rung from /config through the shared classifier, not from autonomy_preset", async () => {
    status.mockResolvedValue({ ...(await status()), autonomy_preset: "manual" });
    render(<StatusPanel />);
    // A fresh install is Smart: two tools run without asking. The gateway's
    // "manual" would contradict the rail and the Tools panel.
    expect(await screen.findByText("Smart")).toBeTruthy();
    expect(screen.queryByText("Manual")).toBeNull();
  });

  it("reads the wildcard as Manual and readonly as Strict", async () => {
    config.mockResolvedValue({ autonomy: { level: "supervised", always_ask: ["*"] } });
    render(<StatusPanel />);
    expect(await screen.findByText("Manual")).toBeTruthy();
    cleanup();
    config.mockResolvedValue({ autonomy: { level: "readonly" } });
    render(<StatusPanel />);
    expect(await screen.findByText("Strict")).toBeTruthy();
  });

  it("says unknown when the config read failed", async () => {
    config.mockRejectedValue(new Error("nope"));
    render(<StatusPanel />);
    expect(await screen.findByText("unknown")).toBeTruthy();
  });
});

describe("StatusPanel behaviour", () => {
  it("re-reads status and config when a rung change is broadcast", async () => {
    render(<StatusPanel />);
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(config).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event(AUTONOMY_CHANGED));
    });
    await waitFor(() => expect(status).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(config).toHaveBeenCalledTimes(2));
    // The doctor and usage requests stay on their buttons.
    expect(doctor).toHaveBeenCalledTimes(1);
    expect(insights).toHaveBeenCalledTimes(1);
  });

  it("has one page Refresh, and it re-reads usage too", async () => {
    render(<StatusPanel />);
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(1));
    // getByRole (not getAll): a second "Refresh" on the page is a regression.
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(status).toHaveBeenCalledTimes(2));
    // Doctor still belongs to Re-run checks alone.
    expect(doctor).toHaveBeenCalledTimes(1);
  });

  it("collapses a gateway outage into one block with one Retry", async () => {
    status.mockRejectedValue(new Error("gateway down"));
    doctor.mockRejectedValue(new Error("gateway down"));
    insights.mockRejectedValue(new Error("gateway down"));
    render(<StatusPanel />);
    expect(await screen.findByText("Couldn't reach the gateway.")).toBeTruthy();
    expect(screen.getAllByText(/gateway down/)).toHaveLength(1);
    expect(screen.queryByText("Usage")).toBeNull();
    expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
  });

  it("keeps the other sections when only the doctor request fails", async () => {
    doctor.mockRejectedValue(new Error("doctor down"));
    render(<StatusPanel />);
    expect(await screen.findByText(/doctor down/)).toBeTruthy();
    expect(await screen.findByText("Runtime")).toBeTruthy();
    expect(screen.queryByText("Couldn't reach the gateway.")).toBeNull();
  });

  it("names what each section is loading and disables Refresh while its request is in flight", async () => {
    render(<StatusPanel />);
    await screen.findByText("Runtime");
    status.mockReturnValue(new Promise(() => {}));
    const refresh = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(refresh);
    await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(true));
  });

  it("says what it is loading", async () => {
    status.mockReturnValue(new Promise(() => {}));
    doctor.mockReturnValue(new Promise(() => {}));
    render(<StatusPanel />);
    expect(await screen.findByText("Loading health…")).toBeTruthy();
    expect(await screen.findByText("Running checks…")).toBeTruthy();
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
