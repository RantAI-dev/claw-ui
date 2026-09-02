// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CONFIG_CHANGED } from "@/lib/console";

const config = vi.fn();
const setConfigModel = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

// Keep the real `describeApiError` (useAsync maps every failure through it);
// only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    config: () => config(),
    setConfigModel: (body: unknown) => setConfigModel(body),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { ConfigPanel } from "./config-panel";

const CONFIG = {
  default_provider: "ollama",
  default_temperature: 0.7,
  mcp_servers: {
    qa: {
      command: "npx",
      args: ["-y", "qa-server", "--api-key", "sk-arg-9999"],
      env: { MY_API_KEY: "sk-test-12345" },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  config.mockResolvedValue(structuredClone(CONFIG));
  setConfigModel.mockResolvedValue({
    default_provider: "ollama",
    default_model: "stub:latest",
    default_temperature: 1.2,
  });
});

afterEach(cleanup);

async function renderLoaded() {
  const utils = render(<ConfigPanel />);
  const input = (await screen.findByRole("spinbutton")) as HTMLInputElement;
  // The first seed lands in an effect after the field renders; wait it out so
  // a test's typing cannot race it (an operator cannot type before the load).
  await waitFor(() => expect(input.value).toBe("0.7"));
  return { ...utils, input };
}

const saveButton = () =>
  screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

// happy-dom does not run the implicit form submission a real click on a
// type="submit" button causes; drive the form directly. The real click and
// Enter paths are exercised live in the browser drive.
const submitForm = (container: HTMLElement) =>
  fireEvent.submit(container.querySelector("form")!);

describe("ConfigPanel save honesty", () => {
  it("seeds the saved temperature and disables Save until an edit", async () => {
    const { input, container } = await renderLoaded();
    expect(input.value).toBe("0.7");
    expect(saveButton().disabled).toBe(true);
    submitForm(container);
    expect(setConfigModel).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("PUTs an edited temperature, toasts, and broadcasts CONFIG_CHANGED", async () => {
    const { input, container } = await renderLoaded();
    const seen = vi.fn();
    window.addEventListener(CONFIG_CHANGED, seen);
    try {
      fireEvent.change(input, { target: { value: "1.2" } });
      expect(saveButton().disabled).toBe(false);
      submitForm(container);
      await waitFor(() => expect(setConfigModel).toHaveBeenCalledWith({ temperature: 1.2 }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
      expect(seen).toHaveBeenCalled();
    } finally {
      window.removeEventListener(CONFIG_CHANGED, seen);
    }
  });

  it("disables Save on an empty field: the API has no unset", async () => {
    const { input } = await renderLoaded();
    fireEvent.change(input, { target: { value: "" } });
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects an out-of-range value inline, before the gateway sees it", async () => {
    const { input, container } = await renderLoaded();
    fireEvent.change(input, { target: { value: "3" } });
    expect(screen.getByRole("alert").textContent).toBe("Temperature is 0.0 to 2.0.");
    expect(saveButton().disabled).toBe(true);
    submitForm(container);
    expect(setConfigModel).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "1.5" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a typed value across Refresh, and follows the server while clean", async () => {
    const { input } = await renderLoaded();
    fireEvent.change(input, { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(config).toHaveBeenCalledTimes(2));
    // The dirty edit survives the re-fetch.
    expect(input.value).toBe("1.5");

    cleanup();
    config.mockResolvedValue({ ...structuredClone(CONFIG), default_temperature: 0.7 });
    const second = await renderLoaded();
    config.mockResolvedValue({ ...structuredClone(CONFIG), default_temperature: 1.9 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    // A clean field re-seeds from the changed saved value.
    await waitFor(() => expect(second.input.value).toBe("1.9"));
  });

  it("saves on Enter: the field and button are a form", async () => {
    const { input, container } = await renderLoaded();
    fireEvent.change(input, { target: { value: "1.2" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(setConfigModel).toHaveBeenCalledWith({ temperature: 1.2 }));
  });

  it("keeps the typed value and toasts the cause when the save fails", async () => {
    const { input, container } = await renderLoaded();
    setConfigModel.mockRejectedValue(new Error("boom"));
    fireEvent.change(input, { target: { value: "1.5" } });
    submitForm(container);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(input.value).toBe("1.5");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("ConfigPanel masked viewer", () => {
  it("exposes aria-expanded and reveals the masked dump without credentials", async () => {
    const { container } = await renderLoaded();
    const toggle = screen.getByRole("button", { name: /full config/ }) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const pre = container.querySelector("pre")!;
    expect(pre.textContent).toContain("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
    expect(pre.textContent).not.toContain("sk-arg-9999");
    expect(pre.textContent).not.toContain("sk-test-12345");
  });

  it("renders no disclosure until config data exists", async () => {
    config.mockRejectedValue(new Error("down"));
    render(<ConfigPanel />);
    await screen.findByText("Couldn't load this panel");
    expect(screen.queryByRole("button", { name: /full config/ })).toBeNull();
  });
});

describe("ConfigPanel surface craft", () => {
  it("labels the field on the shared scale, with no tracked-uppercase relic", async () => {
    const { container } = await renderLoaded();
    const byLabel = screen.getByLabelText("Default sampling temperature") as HTMLInputElement;
    expect(byLabel.getAttribute("type")).toBe("number");
    expect(byLabel.placeholder).toBe("");
    expect(container.querySelector(".tracking-wider")).toBeNull();
  });

  it("titles the section Configuration, not Config", async () => {
    await renderLoaded();
    expect(screen.getByRole("heading", { name: "Configuration" })).toBeTruthy();
    expect(screen.queryByText("Config")).toBeNull();
  });

  it("names its loading state and shows Refresh only once data exists", async () => {
    let resolveConfig!: (v: unknown) => void;
    config.mockReturnValue(new Promise((r) => (resolveConfig = r)));
    render(<ConfigPanel />);
    await screen.findByText("Loading config…");
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    resolveConfig(structuredClone(CONFIG));
    await screen.findByRole("spinbutton");
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("links Providers as a real route link", async () => {
    await renderLoaded();
    const link = screen.getByRole("link", { name: "Providers" });
    expect(link.getAttribute("href")).toBe("#providers");
  });
});
