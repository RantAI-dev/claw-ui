// @vitest-environment happy-dom
//
// The MCP panel was the only ops panel with no test file, and the only console
// surface that could not use a feature the API already exposed: the gateway
// accepts `env` on `POST /api/v1/config/mcp_servers/{name}` and encrypts it at
// rest, while the panel sent `{command, args}` and nothing else. So a server
// needing a credential could not be added from the console at all.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GatewayConfig } from "@/lib/types";

const config = vi.fn();
const addMcpServer = vi.fn();
const deleteMcpServer = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    config: () => config(),
    addMcpServer: (...a: unknown[]) => addMcpServer(...a),
    deleteMcpServer: (...a: unknown[]) => deleteMcpServer(...a),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { McpPanel, parseEnv } from "./mcp-panel";

function cfg(servers: GatewayConfig["mcp_servers"] = {}): GatewayConfig {
  return { mcp_servers: servers } as GatewayConfig;
}

async function renderPanel(servers: GatewayConfig["mcp_servers"] = {}) {
  config.mockResolvedValue(cfg(servers));
  render(<McpPanel />);
  await waitFor(() => expect(config).toHaveBeenCalled());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("parseEnv", () => {
  it("reads one KEY=value per line", () => {
    expect(parseEnv("A=1\nB=2")).toEqual({ A: "1", B: "2" });
  });

  // Space-splitting is what the args field does, and it is wrong here: an MCP
  // credential routinely contains spaces and `=`.
  it("keeps spaces and further equals signs inside the value", () => {
    expect(parseEnv("TOKEN=a b=c d")).toEqual({ TOKEN: "a b=c d" });
  });

  it("ignores blank lines, comments, and lines with no assignment", () => {
    expect(parseEnv("\n# a comment\nJUST_A_WORD\n  \nK=v")).toEqual({ K: "v" });
  });

  it("ignores a line whose key is empty rather than storing one", () => {
    expect(parseEnv("=novalue")).toEqual({});
  });

  it("keeps an explicitly empty value", () => {
    expect(parseEnv("EMPTY=")).toEqual({ EMPTY: "" });
  });
});

describe("McpPanel", () => {
  it("sends env with the server when the operator supplies it", async () => {
    addMcpServer.mockResolvedValue({ name: "github", added: true, count: 1 });
    await renderPanel();

    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.change(screen.getByLabelText("Arguments"), {
      target: { value: "-y @modelcontextprotocol/server-github" },
    });
    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "GITHUB_TOKEN=ghp_secret\nAPI_BASE=https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add server/i }));

    await waitFor(() => expect(addMcpServer).toHaveBeenCalled());
    expect(addMcpServer).toHaveBeenCalledWith("github", {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "ghp_secret", API_BASE: "https://example.com" },
    });
  });

  // Sending `env: {}` would overwrite a stored env with nothing. Omitting the
  // key is the difference between "no change" and "clear it".
  it("omits env entirely when the field is left blank", async () => {
    addMcpServer.mockResolvedValue({ name: "fs", added: true, count: 1 });
    await renderPanel();

    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "fs" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.click(screen.getByRole("button", { name: /add server/i }));

    await waitFor(() => expect(addMcpServer).toHaveBeenCalled());
    const body = addMcpServer.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("env");
  });

  it("lists env keys with masked values, never the value itself", async () => {
    await renderPanel({
      github: {
        command: "npx",
        args: ["-y", "server-github"],
        env: { GITHUB_TOKEN: "ghp_secret_value" },
      },
    });

    // The name alone is ambiguous — it also appears in the summary band and as
    // the form's placeholder. The remove button's label is unique per row.
    const remove = await screen.findByLabelText("Remove MCP server github");
    const card = remove.closest("div.flex.items-center.gap-3") as HTMLElement;
    expect(within(card).getByText(/GITHUB_TOKEN=/)).toBeTruthy();
    expect(card.textContent).not.toContain("ghp_secret_value");
    expect(card.textContent).toContain("••••••••");
  });

  it("renders a server with no env without inventing an empty row", async () => {
    await renderPanel({ fs: { command: "npx", args: ["-y", "server-filesystem"] } });
    const remove = await screen.findByLabelText("Remove MCP server fs");
    const card = remove.closest("div.flex.items-center.gap-3") as HTMLElement;
    expect(card.textContent).not.toContain("••••••••");
  });
});
