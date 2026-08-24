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

describe("StatusPanel usage tiles", () => {
  it("fetches insights on mount and renders the totals", async () => {
    render(<StatusPanel />);
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(1));
    // Totals are formatted (thousands separator via toLocaleString) and the avg
    // is fixed to one decimal.
    expect(await screen.findByText("345")).toBeTruthy();
    expect(await screen.findByText("28.8")).toBeTruthy();
  });
});
