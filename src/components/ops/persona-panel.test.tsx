// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PERSONA_CHANGED } from "@/lib/console";

// ---- mock the gateway client ----
const personality = vi.fn();
const personalityPresets = vi.fn();
const setPersonality = vi.fn();
const kbGroups = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      personality: () => personality(),
      personalityPresets: () => personalityPresets(),
      setPersonality: (b: unknown) => setPersonality(b),
      kbGroups: () => kbGroups(),
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PersonaPanel } from "./persona-panel";

const SAVED = {
  profile: "default",
  preset: "default",
  name: "RantaiClaw",
  role: "AI employee",
  tone: "concise",
  avoid: "",
  timezone: "Asia/Jakarta",
  always_on_kbs: [],
};

beforeEach(() => {
  personality.mockResolvedValue({ ...SAVED });
  personalityPresets.mockResolvedValue({
    presets: [{ id: "default", label: "Default", description: "" }],
  });
  setPersonality.mockResolvedValue({ ...SAVED });
  kbGroups.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PersonaPanel", () => {
  it("seeds the form from the saved persona and enables Save only after an edit", async () => {
    render(<PersonaPanel />);
    const name = (await screen.findByDisplayValue("RantaiClaw")) as HTMLInputElement;
    const save = screen.getByRole("button", { name: /save persona/i }) as HTMLButtonElement;
    // Nothing changed yet — Save is inert so a stray click can't re-PUT the
    // unchanged persona.
    expect(save.disabled).toBe(true);

    fireEvent.change(name, { target: { value: "Atlas" } });
    expect(save.disabled).toBe(false);
  });

  it("PUTs the edited fields and announces PERSONA_CHANGED on save", async () => {
    const heard = vi.fn();
    window.addEventListener(PERSONA_CHANGED, heard);
    render(<PersonaPanel />);
    const name = (await screen.findByDisplayValue("RantaiClaw")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Scout" } });
    fireEvent.click(screen.getByRole("button", { name: /save persona/i }));

    await waitFor(() => expect(setPersonality).toHaveBeenCalledTimes(1));
    expect(setPersonality.mock.calls[0][0]).toMatchObject({ name: "Scout", timezone: "Asia/Jakarta" });
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    window.removeEventListener(PERSONA_CHANGED, heard);
  });

  it("falls back to the built-in preset list when the gateway has no presets endpoint", async () => {
    personalityPresets.mockRejectedValue(new Error("404"));
    render(<PersonaPanel />);
    // The fallback list carries presets the API response did not.
    expect(await screen.findByRole("option", { name: "Concise Pro" })).toBeTruthy();
  });

  it("keeps the operator's edits in the form when the save fails", async () => {
    setPersonality.mockRejectedValue(new Error("boom"));
    render(<PersonaPanel />);
    const name = (await screen.findByDisplayValue("RantaiClaw")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: /save persona/i }));

    await waitFor(() => expect(setPersonality).toHaveBeenCalled());
    // The field is not reset — the edit survives so it can be retried.
    expect((screen.getByDisplayValue("Nova") as HTMLInputElement).value).toBe("Nova");
  });
});
