// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PERSONA_CHANGED } from "@/lib/console";
import { ApiError } from "@/lib/api";

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

  it("fills a fresh profile with the runtime defaults, says so, and saves exactly those", async () => {
    personality.mockResolvedValue({ profile: "default", preset: null, configured: false });
    render(<PersonaPanel />);
    expect(await screen.findByText(/No persona saved yet/)).toBeTruthy();
    // The band renders on `data` alone; the form waits for the seed effect.
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.value).toBe("RantaiClaw");
    expect((screen.getByLabelText("Tone") as HTMLInputElement).value).toBe("neutral");
    expect((screen.getByLabelText("Role") as HTMLTextAreaElement).value).toBe(
      "general productivity and helpful assistance",
    );
    expect((screen.getByLabelText("Timezone") as HTMLInputElement).value).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    const save = screen.getByRole("button", { name: /save persona/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(setPersonality).toHaveBeenCalledTimes(1));
    const body = setPersonality.mock.calls[0][0] as Record<string, string>;
    expect(body.preset).toBe("default");
    for (const k of ["name", "role", "tone", "timezone"]) expect(body[k].length).toBeGreaterThan(0);
  });

  it("requires a name and refuses to save without one", async () => {
    render(<PersonaPanel />);
    const name = (await screen.findByDisplayValue("RantaiClaw")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "  " } });
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const save = screen.getByRole("button", { name: /save persona/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(setPersonality).not.toHaveBeenCalled();
  });

  it("refuses a made-up timezone and offers the browser's", async () => {
    render(<PersonaPanel />);
    await screen.findByDisplayValue("RantaiClaw");
    const tz = screen.getByLabelText("Timezone") as HTMLInputElement;
    fireEvent.change(tz, { target: { value: "Mars/Olympus Mons" } });
    expect(screen.getByRole("alert").textContent).toMatch(/IANA/);
    expect((screen.getByRole("button", { name: /save persona/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Use this browser's timezone/ }));
    expect(tz.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the selected preset's description and follows the selection", async () => {
    personalityPresets.mockResolvedValue({
      presets: [
        { id: "default", label: "Default", description: "Balanced general-purpose helper." },
        { id: "concise_pro", label: "Concise Pro", description: "Short, formal, lead-with-the-answer." },
      ],
    });
    render(<PersonaPanel />);
    expect(await screen.findByText("Balanced general-purpose helper.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Preset"), { target: { value: "concise_pro" } });
    expect(screen.getByText("Short, formal, lead-with-the-answer.")).toBeTruthy();
    expect(screen.queryByText("Balanced general-purpose helper.")).toBeNull();
  });

  const GROUPS = [
    { id: "g1", name: "Product docs", description: "Manuals", color: null },
    { id: "g2", name: "Support runbook", description: null, color: null },
  ];

  it("keeps a base toggle in the form and saves it with the fields", async () => {
    kbGroups.mockResolvedValue(GROUPS);
    render(<PersonaPanel />);
    const chip = (await screen.findByRole("button", { name: "Product docs" })) as HTMLButtonElement;
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(setPersonality).not.toHaveBeenCalled();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    const save = screen.getByRole("button", { name: /save persona/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(setPersonality).toHaveBeenCalledTimes(1));
    expect(setPersonality.mock.calls[0][0]).toMatchObject({ name: "RantaiClaw", always_on_kbs: ["g1"] });
  });

  it("keeps an unsaved edit through Refresh and through a base toggle", async () => {
    kbGroups.mockResolvedValue(GROUPS);
    render(<PersonaPanel />);
    const name = (await screen.findByDisplayValue("RantaiClaw")) as HTMLInputElement;
    await screen.findByRole("button", { name: "Product docs" });
    fireEvent.change(name, { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
    await waitFor(() => expect(personality).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Nova");
    fireEvent.click(screen.getByRole("button", { name: "Support runbook" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Nova");
    expect((screen.getByRole("button", { name: /save persona/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("re-seeds a clean form when the saved persona changes on the gateway", async () => {
    render(<PersonaPanel />);
    await screen.findByDisplayValue("RantaiClaw");
    personality.mockResolvedValue({ ...SAVED, name: "Atlas" });
    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
    expect(await screen.findByDisplayValue("Atlas")).toBeTruthy();
  });

  it("names why the knowledge bases cannot be listed, and links the route", async () => {
    kbGroups.mockRejectedValue(new ApiError("The Knowledge Base is turned off.", 403, { error: "kb_disabled" }));
    const { unmount } = render(<PersonaPanel />);
    expect(await screen.findByText(/turned off/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Knowledge Bases" }).getAttribute("href")).toBe("#kb");
    unmount();

    kbGroups.mockRejectedValue(new ApiError("no key", 503, { error: "kb_not_configured" }));
    const r2 = render(<PersonaPanel />);
    expect(await screen.findByText(/embedding key/)).toBeTruthy();
    r2.unmount();

    kbGroups.mockClear();
    kbGroups.mockRejectedValueOnce(new ApiError("boom", 502, null)).mockResolvedValue([]);
    const r3 = render(<PersonaPanel />);
    expect(await screen.findByText(/Couldn't load knowledge bases/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/No knowledge bases yet/)).toBeTruthy();
    expect(kbGroups).toHaveBeenCalledTimes(2);
    r3.unmount();
  });

  it("opens with the saved identity: the band, the mark and the meta line", async () => {
    personality.mockResolvedValue({ ...SAVED, always_on_kbs: ["g1"] });
    render(<PersonaPanel />);
    expect(await screen.findByText("Speaking as RantaiClaw")).toBeTruthy();
    expect(screen.getByText("RA")).toBeTruthy(); // the identity mark's initials
    expect(screen.getByText("default preset")).toBeTruthy();
    expect(screen.getByText(/Always searches 1 knowledge base/)).toBeTruthy();
  });

  it("labels every control, is titled Persona, and names what it loads", async () => {
    let resolve: (v: unknown) => void = () => {};
    personality.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(<PersonaPanel />);
    expect(screen.getByText("Loading persona…")).toBeTruthy();
    resolve({ ...SAVED });
    await screen.findByDisplayValue("RantaiClaw");
    expect(screen.getByRole("button", { name: /^refresh$/i })).toBeTruthy();
    for (const l of ["Preset", "Name", "Timezone", "Tone", "Role", "Avoid"]) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
    expect(screen.getByRole("heading", { level: 3, name: "Persona" })).toBeTruthy();
    expect(screen.queryByText(/Personality/)).toBeNull();
    expect(container.querySelector(".tracking-wider")).toBeNull();
    expect(container.querySelectorAll("label.eyebrow").length).toBe(6);
  });
});
