// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CONFIG_CHANGED } from "@/lib/console";

const providers = vi.fn();
const secrets = vi.fn();
const status = vi.fn();
const providerModels = vi.fn();
const refreshProviderModels = vi.fn();
const setConfigModel = vi.fn();
const setSecrets = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

// Keep the real `describeApiError` (useAsync maps every failure through it);
// only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    providers: () => providers(),
    secrets: () => secrets(),
    status: () => status(),
    providerModels: (id: string) => providerModels(id),
    refreshProviderModels: (id: string) => refreshProviderModels(id),
    setConfigModel: (body: unknown) => setConfigModel(body),
    setSecrets: (body: unknown) => setSecrets(body),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: vi.fn(),
    message: vi.fn(),
  },
}));

import { ProvidersPanel } from "./providers-panel";

const CATALOG = {
  providers: [
    { id: "openai", display_name: "OpenAI", aliases: [], local: false },
    { id: "ollama", display_name: "Ollama", aliases: [], local: true },
    { id: "anthropic", display_name: "Anthropic", aliases: [], local: false },
  ],
  count: 3,
};

function statusWith(provider: string, model: string) {
  return {
    version: "0.0.0",
    provider,
    model,
    memory_backend: "sqlite",
    autonomy: "Supervised",
    workspace_dir: "/w",
    paired: false,
    runtime: {},
  };
}

function secretsWith(provider: string, extra: Record<string, unknown> = {}) {
  return { provider, api_url: null, api_key_present: false, encrypt_at_rest: true, ...extra };
}

const MODELS: Record<string, { models: string[]; default: string }> = {
  openai: { models: ["gpt-5.5", "gpt-5.4"], default: "gpt-5.5" },
  ollama: { models: ["llama3.3", "stub:latest"], default: "llama3.3" },
  anthropic: { models: ["claude-sonnet-4.6"], default: "claude-sonnet-4.6" },
};

beforeEach(() => {
  for (const fn of [providers, secrets, status, providerModels, refreshProviderModels, setConfigModel, setSecrets, toastSuccess, toastError]) {
    fn.mockReset();
  }
  providers.mockResolvedValue(CATALOG);
  secrets.mockResolvedValue(secretsWith("ollama"));
  status.mockResolvedValue(statusWith("ollama", "stub:latest"));
  providerModels.mockImplementation(async (id: string) => ({
    provider: id,
    ...MODELS[id],
    source: "curated",
    age_secs: null,
    count: MODELS[id].models.length,
  }));
  setConfigModel.mockResolvedValue({ default_provider: "openai", default_model: "gpt-5.5", default_temperature: 0.7 });
  setSecrets.mockResolvedValue({ ok: true, api_key_present: true });
});
afterEach(cleanup);

const saveButton = () => screen.getByRole("button", { name: /Save provider/ }) as HTMLButtonElement;
const providerTrigger = () => document.getElementById("provider-picker") as HTMLButtonElement;
const modelTrigger = () => document.querySelectorAll("button[aria-haspopup=listbox]")[1] as HTMLButtonElement;

async function pickProvider(name: string) {
  fireEvent.click(providerTrigger());
  fireEvent.click(await screen.findByRole("option", { name }));
}

describe("ProvidersPanel", () => {
  it("an untouched form has nothing to save", async () => {
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    fireEvent.click(saveButton());
    expect(setConfigModel).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("a provider switch takes the catalog default model, writes both, and says so once", async () => {
    const fired = vi.fn();
    window.addEventListener(CONFIG_CHANGED, fired);
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    await pickProvider("OpenAI");
    await waitFor(() => expect(modelTrigger().textContent).toContain("gpt-5.5"));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(setConfigModel).toHaveBeenCalledWith({ provider: "openai", model: "gpt-5.5" });
    expect(setSecrets).not.toHaveBeenCalled();
    expect(toastSuccess.mock.calls[0][0]).toBe("Saved: provider OpenAI, model gpt-5.5");
    expect(fired).toHaveBeenCalled();
    window.removeEventListener(CONFIG_CHANGED, fired);
  });

  it("does not re-send a model that did not change under the new provider", async () => {
    status.mockResolvedValue(statusWith("ollama", "gpt-5.5"));
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    await pickProvider("OpenAI");
    await waitFor(() => expect(modelTrigger().textContent).toContain("gpt-5.5"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(setConfigModel).toHaveBeenCalledTimes(1));
    expect(setConfigModel).toHaveBeenCalledWith({ provider: "openai", model: undefined });
    expect(toastSuccess.mock.calls[0][0]).toBe("Saved: provider OpenAI");
  });

  it("waits for a model while the picked provider's list has not answered", async () => {
    providerModels.mockImplementation((id: string) =>
      id === "openai" ? new Promise(() => {}) : Promise.resolve({ provider: id, ...MODELS[id], source: "curated", age_secs: null, count: 2 }),
    );
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    await pickProvider("OpenAI");
    expect(await screen.findByText("Choose a model for OpenAI")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("carries the gateway's key warning only for a provider that needs a key", async () => {
    setConfigModel.mockResolvedValue({ default_provider: "x", default_model: "m", default_temperature: 0.7, warning: "No API key found" });
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    await pickProvider("OpenAI");
    await waitFor(() => expect(modelTrigger().textContent).toContain("gpt-5.5"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][1]).toEqual({ description: "No API key found" });

    cleanup();
    toastSuccess.mockReset();
    secrets.mockResolvedValue(secretsWith("openai"));
    status.mockResolvedValue(statusWith("openai", "gpt-5.5"));
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    await pickProvider("Ollama local");
    await waitFor(() => expect(modelTrigger().textContent).toContain("llama3.3"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][1]).toEqual({ description: undefined });
  });

  it("a typed key is the only thing sent when nothing else changed", async () => {
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    fireEvent.change(document.getElementById("provider-api-key")!, { target: { value: "sk-1" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(setSecrets).toHaveBeenCalledWith({ api_key: "sk-1", api_url: undefined }));
    expect(setConfigModel).not.toHaveBeenCalled();
    expect(toastSuccess.mock.calls[0][0]).toBe("Saved: API key stored");
  });

  it("the verdict says stored / not stored / not needed, by name", async () => {
    render(<ProvidersPanel />);
    expect(await screen.findByText("Talking to Ollama")).toBeTruthy();
    expect(screen.getByText("no key needed")).toBeTruthy();
    expect(screen.queryByText("no key stored")).toBeNull();
    cleanup();
    secrets.mockResolvedValue(secretsWith("openai"));
    render(<ProvidersPanel />);
    expect(await screen.findByText("Talking to OpenAI")).toBeTruthy();
    expect(screen.getByText("no key stored")).toBeTruthy();
    expect(screen.getByText(/If OpenAI needs a key/)).toBeTruthy();
    cleanup();
    secrets.mockResolvedValue(secretsWith("openai", { api_key_present: true }));
    render(<ProvidersPanel />);
    expect(await screen.findByText("key stored encrypted")).toBeTruthy();
  });

  it("picking a provider from the catalog fills the form", async () => {
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Anthropic/ }));
    expect(providerTrigger().textContent).toContain("Anthropic");
    await waitFor(() => expect(modelTrigger().textContent).toContain("claude-sonnet-4.6"));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("a failed first read is an error, never 'none / no key'", async () => {
    secrets.mockRejectedValue(new Error("boom"));
    render(<ProvidersPanel />);
    expect(await screen.findByText(/Couldn't load this panel/)).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.queryByText("none")).toBeNull();
    expect(screen.queryByText(/no key/i)).toBeNull();
    expect(screen.queryByText(/Talking to/)).toBeNull();
    expect(providerTrigger()).toBeNull();
  });

  it("a failed refresh keeps the card under a strip, and Refresh re-reads all three", async () => {
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    secrets.mockRejectedValue(new Error("later"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("later")).toBeTruthy();
    expect(providerTrigger()).toBeTruthy();
    expect(providers).toHaveBeenCalledTimes(2);
    expect(secrets).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("says how the key is stored from the gateway's flag, never from static copy", async () => {
    secrets.mockResolvedValue(secretsWith("ollama", { api_key_present: true }));
    render(<ProvidersPanel />);
    expect(await screen.findByText("key stored encrypted")).toBeTruthy();
    cleanup();
    secrets.mockResolvedValue(secretsWith("ollama", { api_key_present: true, encrypt_at_rest: false }));
    render(<ProvidersPanel />);
    expect(await screen.findByText("key stored in plain text (secrets.encrypt off)")).toBeTruthy();
    expect(screen.queryByText("key stored encrypted")).toBeNull();
  });

  it("a blank URL over a stored one says it keeps it and is not dirty", async () => {
    secrets.mockResolvedValue(secretsWith("ollama", { api_url: "https://api.example.com/v1" }));
    render(<ProvidersPanel />);
    const urlInput = (await screen.findByLabelText(/API base URL override/)) as HTMLInputElement;
    await waitFor(() => expect(urlInput.value).toBe("https://api.example.com/v1"));
    expect(screen.queryByText(/Blank keeps the stored URL/)).toBeNull();
    fireEvent.change(urlInput, { target: { value: "" } });
    expect(await screen.findByText(/Blank keeps the stored URL/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Reset base URL/ })).toBeTruthy();
  });

  it("a provider switch with a stored URL says the URL follows", async () => {
    secrets.mockResolvedValue(secretsWith("ollama", { api_url: "https://api.example.com/v1" }));
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    await pickProvider("OpenAI");
    expect(await screen.findByText("This URL will be used for OpenAI too.")).toBeTruthy();
  });

  it("is a form with named pickers and a write-only key field", async () => {
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    expect(screen.getByLabelText("Provider").getAttribute("aria-haspopup")).toBe("listbox");
    expect(screen.getByLabelText("Model").getAttribute("aria-haspopup")).toBe("listbox");
    // The label names the provider once the secrets effect has seeded it.
    const keyInput = (await screen.findByLabelText("API key for Ollama")) as HTMLInputElement;
    expect(keyInput.getAttribute("autocomplete")).toBe("new-password");
    expect(keyInput.getAttribute("placeholder")).toBe("Paste the key for Ollama");
    expect((screen.getByLabelText(/API base URL override/) as HTMLInputElement).getAttribute("autocomplete")).toBe("off");
    expect(screen.queryByText(/Providers · /)).toBeNull();
    expect(screen.getByRole("heading", { name: "Active provider" })).toBeTruthy();
    fireEvent.change(keyInput, { target: { value: "sk-2" } });
    fireEvent.submit(keyInput.closest("form")!);
    await waitFor(() => expect(setSecrets).toHaveBeenCalledWith({ api_key: "sk-2", api_url: undefined }));
  });

  it("Refresh is held while any of the three reads is in flight", async () => {
    render(<ProvidersPanel />);
    await waitFor(() => expect(providerTrigger()).toBeTruthy());
    secrets.mockReturnValue(new Promise(() => {}));
    const refresh = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    fireEvent.click(refresh);
    await waitFor(() => expect(refresh.disabled).toBe(true));
    expect(refresh.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
  });
});
