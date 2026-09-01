import { describe, expect, it } from "vitest";
import { changes, isDirty, keyState, providerLabel, saveSummary } from "./providers";

const server = { provider: "ollama", model: "stub:latest", url: null, keyPresent: false };
const clean = { provider: "ollama", model: "stub:latest", key: "", url: "" };

describe("changes / isDirty", () => {
  it("an untouched form changes nothing", () => {
    const c = changes(clean, server);
    expect(c).toEqual({ provider: false, model: false, key: false, url: false });
    expect(isDirty(c)).toBe(false);
  });

  it("a different provider or model counts", () => {
    expect(changes({ ...clean, provider: "openai" }, server).provider).toBe(true);
    expect(changes({ ...clean, model: "llama3.3" }, server).model).toBe(true);
    expect(isDirty(changes({ ...clean, model: "llama3.3" }, server))).toBe(true);
  });

  it("an empty model is not a change (it is waiting for a pick)", () => {
    expect(changes({ ...clean, model: "" }, server).model).toBe(false);
  });

  it("a blank key or URL never counts, even over a stored URL", () => {
    const withUrl = { ...server, url: "https://api.example.com/v1" };
    const c = changes({ ...clean, key: "   ", url: "" }, withUrl);
    expect(c.key).toBe(false);
    expect(c.url).toBe(false);
    expect(isDirty(c)).toBe(false);
  });

  it("a typed key or a different URL counts; the stored URL does not", () => {
    const withUrl = { ...server, url: "https://api.example.com/v1" };
    expect(changes({ ...clean, key: "sk-1" }, withUrl).key).toBe(true);
    expect(changes({ ...clean, url: "https://api.example.com/v1" }, withUrl).url).toBe(false);
    expect(changes({ ...clean, url: "https://other.example.com" }, withUrl).url).toBe(true);
  });
});

describe("saveSummary", () => {
  it("names only the parts written", () => {
    expect(saveSummary({ provider: true, model: true, key: true, url: false }, "OpenAI", "gpt-5.5")).toBe(
      "Saved: provider OpenAI, model gpt-5.5, API key stored",
    );
    expect(saveSummary({ provider: false, model: true, key: false, url: false }, "OpenAI", "gpt-5.4")).toBe(
      "Saved: model gpt-5.4",
    );
    expect(saveSummary({ provider: false, model: false, key: false, url: true }, "OpenAI", "")).toBe(
      "Saved: base URL set",
    );
    expect(saveSummary({ provider: false, model: false, key: false, url: false }, "OpenAI", "")).toBe(
      "Nothing to save",
    );
  });
});

describe("keyState", () => {
  it("is a warning only for a provider that needs a key and has none", () => {
    expect(keyState(false, false)).toEqual({ label: "No key stored", variant: "warning" });
    expect(keyState(true, false)).toEqual({ label: "No key needed", variant: "outline" });
    expect(keyState(false, true)).toEqual({ label: "Key stored", variant: "success" });
    expect(keyState(true, true)).toEqual({ label: "Key stored", variant: "success" });
  });
});

describe("providerLabel", () => {
  const catalog = [{ id: "openai", display_name: "OpenAI", aliases: [], local: false }];
  it("uses the display name, falls back to the id, and says none when unset", () => {
    expect(providerLabel("openai", catalog)).toBe("OpenAI");
    expect(providerLabel("zzz", catalog)).toBe("zzz");
    expect(providerLabel("openai", null)).toBe("openai");
    expect(providerLabel(null, catalog)).toBe("none");
    expect(providerLabel("", catalog)).toBe("none");
  });
});
