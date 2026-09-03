// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AUTONOMY_CHANGED } from "@/lib/console";
import type { GatewayAutonomy } from "@/lib/types";

const config = vi.fn();
const setAutonomy = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastMessage = vi.fn();

// Keep the real `describeApiError` (useAsync maps every failure through it);
// only the two requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    config: () => config(),
    setAutonomy: (body: unknown) => setAutonomy(body),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

import { ToolsPanel } from "./tools-panel";

/** The fresh-install shape (0.25 / 0.27 defaults). */
function fresh(): GatewayAutonomy {
  return {
    level: "supervised",
    always_ask: ["ssh", "pty"],
    auto_approve: ["file_read", "memory_recall"],
    allowed_commands: ["git", "npm", "ls"],
    forbidden_paths: ["/etc"],
    max_actions_per_hour: 200,
    max_cost_per_day_cents: 500,
    workspace_only: true,
    block_high_risk_commands: false,
    require_approval_for_medium_risk: true,
  };
}

// A tiny gateway: `config` serves the current object, `setAutonomy` merges
// the body into it and answers with the stored object, as the real one does.
let server: GatewayAutonomy;

beforeEach(() => {
  server = fresh();
  config.mockImplementation(() => Promise.resolve({ autonomy: server }));
  setAutonomy.mockImplementation((body: Partial<GatewayAutonomy>) => {
    server = { ...server, ...body };
    return Promise.resolve(server);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const saveCaps = () => screen.getByRole("button", { name: "Save caps" });
const actionsField = () => screen.getByLabelText("actions / hour") as HTMLInputElement;

describe("ToolsPanel rung and rows", () => {
  it("reads a fresh install as Smart and lists ssh/pty as always-prompt rows", async () => {
    render(<ToolsPanel />);
    expect(await screen.findByText("Prompt only for writes & system changes. Recommended.")).toBeTruthy();
    const ssh = screen.getByRole("switch", { name: "Auto-approve ssh" }) as HTMLButtonElement;
    expect(ssh.disabled).toBe(true);
    expect(ssh.title).toBe("always prompts");
    expect(screen.getByRole("switch", { name: "Auto-approve file_read" }).getAttribute("title")).toBe(
      "runs without asking",
    );
    expect(screen.queryByText(/follows level default/)).toBeNull();
  });

  it("writes the wildcard for Manual, broadcasts, and disables every switch under it", async () => {
    const heard = vi.fn();
    window.addEventListener(AUTONOMY_CHANGED, heard);
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    await waitFor(() =>
      expect(setAutonomy).toHaveBeenCalledWith({ level: "supervised", always_ask: ["*"], auto_approve: [] }),
    );
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Every tool prompts \(Manual\)/)).toBeTruthy();
    for (const sw of screen.getAllByRole("switch", { name: /Auto-approve/ })) {
      expect((sw as HTMLButtonElement).disabled).toBe(true);
    }
    expect(toastSuccess).toHaveBeenCalledWith("Autonomy set to Manual");
    window.removeEventListener(AUTONOMY_CHANGED, heard);
  });

  it("re-reads the config when the rail broadcasts a rung change", async () => {
    render(<ToolsPanel />);
    await waitFor(() => expect(config).toHaveBeenCalledTimes(1));
    server = { ...server, level: "readonly" };
    act(() => {
      window.dispatchEvent(new Event(AUTONOMY_CHANGED));
    });
    await waitFor(() => expect(config).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Deny-by-default/)).toBeTruthy();
  });

  it("toasts the stored outcome after a switch toggle", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.click(screen.getByRole("switch", { name: "Auto-approve shell" }));
    await waitFor(() =>
      expect(setAutonomy).toHaveBeenCalledWith({ auto_approve: ["file_read", "memory_recall", "shell"] }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("shell: runs without asking"));
  });
});

describe("ToolsPanel caps", () => {
  it("keeps Save disabled until something changed", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    await waitFor(() => expect(actionsField().value).toBe("200"));
    expect(saveCaps().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(saveCaps());
    expect(setAutonomy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("keeps a typed cap across another write's refetch", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    await waitFor(() => expect(actionsField().value).toBe("200"));
    fireEvent.change(actionsField(), { target: { value: "300" } });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(saveCaps().getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(screen.getByRole("switch", { name: "Auto-approve shell" }));
    await waitFor(() => expect(config).toHaveBeenCalledTimes(2));
    expect(actionsField().value).toBe("300");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("saves both caps, names them, and goes clean again", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    await waitFor(() => expect(actionsField().value).toBe("200"));
    fireEvent.change(actionsField(), { target: { value: "300" } });
    fireEvent.click(saveCaps());
    await waitFor(() =>
      expect(setAutonomy).toHaveBeenCalledWith({ max_actions_per_hour: 300, max_cost_per_day_cents: 500 }),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Caps saved: 300 actions per hour, $5.00 per day (cost is reporting only)",
      ),
    );
    await waitFor(() => expect(saveCaps().getAttribute("aria-disabled")).toBe("true"));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("refuses a zero actions cap before the request", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    await waitFor(() => expect(actionsField().value).toBe("200"));
    fireEvent.change(actionsField(), { target: { value: "0" } });
    fireEvent.click(saveCaps());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Actions per hour must be at least 1"));
    expect(setAutonomy).not.toHaveBeenCalled();
  });

  it("labels the cost cap as reporting only", async () => {
    render(<ToolsPanel />);
    expect(await screen.findByLabelText("cost / day, reporting only")).toBeTruthy();
    expect(screen.getByText(/is not enforced/)).toBeTruthy();
  });
});

describe("ToolsPanel allowlist", () => {
  const input = () => screen.getByLabelText("Command to allow") as HTMLInputElement;

  it("compares by basename and says so when the entry is already there", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.change(input(), { target: { value: "/usr/bin/git" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(toastMessage).toHaveBeenCalledWith("git is already allowed"));
    expect(setAutonomy).not.toHaveBeenCalled();
  });

  it("stores the basename and names it in the toast", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.change(input(), { target: { value: "/opt/bin/docker" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() =>
      expect(setAutonomy).toHaveBeenCalledWith({ allowed_commands: ["git", "npm", "ls", "docker"] }),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Allowed docker (the basename of /opt/bin/docker)"),
    );
    expect(await screen.findByRole("button", { name: "Remove docker" })).toBeTruthy();
  });

  it("warns for a high-risk command", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.change(input(), { target: { value: "rm" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/^Allowed rm\. High-risk/)));
  });

  it("shows a duplicated stored entry once and removes it with a toast", async () => {
    server = { ...server, allowed_commands: ["git", "git", "ls"] };
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    expect(screen.getAllByRole("button", { name: "Remove git" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove git" }));
    await waitFor(() => expect(setAutonomy).toHaveBeenCalledWith({ allowed_commands: ["ls"] }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Removed git from the allowlist"));
  });
});

describe("ToolsPanel flags and feedback", () => {
  it("renders the three safety flags as switches and writes a toggle", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    expect(screen.queryByText("block high-risk")).toBeNull();
    const block = screen.getByRole("switch", { name: "Block high-risk shell commands even when allowlisted" });
    expect(block.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByRole("switch", { name: "Prompt for medium-risk shell commands" }).getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(block);
    await waitFor(() => expect(setAutonomy).toHaveBeenCalledWith({ block_high_risk_commands: true }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Block high-risk shell commands even when allowlisted: on"),
    );
  });

  it("marks only the control being written busy, and never disables it", async () => {
    let resolve!: (v: GatewayAutonomy) => void;
    setAutonomy.mockImplementationOnce(() => new Promise<GatewayAutonomy>((r) => (resolve = r)));
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.click(screen.getByRole("switch", { name: "Auto-approve shell" }));
    await waitFor(() => expect(setAutonomy).toHaveBeenCalledTimes(1));
    const shell = () => screen.getByRole("switch", { name: "Auto-approve shell" }) as HTMLButtonElement;
    expect(shell().getAttribute("aria-busy")).toBe("true");
    expect(shell().disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Manual" }).getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("switch", { name: "Auto-approve file_write" }).getAttribute("aria-busy")).toBe("false");
    // A second click on the busy control is ignored, not queued.
    fireEvent.click(shell());
    expect(setAutonomy).toHaveBeenCalledTimes(1);
    act(() => resolve({ ...server, auto_approve: [...(server.auto_approve ?? []), "shell"] }));
    await waitFor(() => expect(shell().getAttribute("aria-busy")).toBe("false"));
  });

  it("toasts the failure and keeps the page when a write fails", async () => {
    setAutonomy.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    fireEvent.click(screen.getByRole("switch", { name: "Auto-approve shell" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Update failed: boom"));
    expect(screen.getByRole("switch", { name: "Auto-approve shell" }).getAttribute("aria-checked")).toBe("false");
  });
});

describe("ToolsPanel names, focus targets and labels", () => {
  it("names the rung group and marks exactly one rung pressed", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    const group = screen.getByRole("group", { name: "Autonomy level" });
    const pressed = group.querySelectorAll('button[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe("Smart");
  });

  it("names every chip-removal button after its command, as a plain button", async () => {
    render(<ToolsPanel />);
    await screen.findByText(/Prompt only for writes/);
    const x = screen.getByRole("button", { name: "Remove git" });
    expect(x.getAttribute("type")).toBe("button");
    expect(x.className).toContain("chip-x");
  });

  it("says what it is loading and titles every section with SectionTitle", async () => {
    let resolve!: (v: unknown) => void;
    config.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<ToolsPanel />);
    expect(await screen.findByText("Loading policy…")).toBeTruthy();
    act(() => resolve({ autonomy: server }));
    await screen.findByText(/Prompt only for writes/);
    // Section headers share the console-wide SectionTitle (h3, sentence case);
    // the CAPS eyebrow scale is reserved for form field-groups.
    const sections = screen.getAllByRole("heading", { level: 3 });
    expect(sections.length).toBe(6);
    for (const h of sections) {
      expect(h.className).not.toContain("eyebrow");
    }
    expect(screen.getByText(/Applies to the next tool call, in chat and on channels/)).toBeTruthy();
    expect(screen.queryByText(/restart/)).toBeNull();
  });
});
