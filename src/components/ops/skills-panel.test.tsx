// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ClawHubSkill, Skill } from "@/lib/types";

const skills = vi.fn();
const setSkillEnabled = vi.fn();
const uninstallSkill = vi.fn();
const installSkill = vi.fn();
const clawhub = vi.fn();
const skillContent = vi.fn();
const saveSkillContent = vi.fn();
const createSkill = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastLoading = vi.fn((..._a: unknown[]) => "t1");
const toastDismiss = vi.fn();

// Keep the real `ApiError` / `describeApiError` (useAsync and the handlers map
// every failure through them); only the requests are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    skills: () => skills(),
    setSkillEnabled: (slug: string, enabled: boolean) => setSkillEnabled(slug, enabled),
    uninstallSkill: (slug: string) => uninstallSkill(slug),
    installSkill: (reference: string) => installSkill(reference),
    clawhub: (...a: unknown[]) => clawhub(...a),
    skillContent: (slug: string) => skillContent(slug),
    saveSkillContent: (slug: string, content: string) => saveSkillContent(slug, content),
    createSkill: (name: string, content: string) => createSkill(name, content),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    loading: (...a: unknown[]) => toastLoading(...a),
    dismiss: (...a: unknown[]) => toastDismiss(...a),
  },
}));

import { ApiError } from "@/lib/api";
import { SkillsPanel } from "./skills-panel";

function skill(over: Partial<Skill> = {}): Skill {
  return {
    name: "Kopi Pagi",
    version: "0.1.0",
    description: "How to brew V60 pour-over.",
    tags: ["kopi"],
    tools: [],
    enabled: true,
    active: true,
    reasons: [],
    slug: "kopi-pagi",
    origin: { kind: "authored", source: null },
    ...over,
  };
}

const KOPI = skill();
const WEATHER = skill({
  name: "weather",
  slug: "weather",
  description: "Get current weather and forecasts.",
  tags: [],
  origin: { kind: "clawhub", source: "@steipete/weather" },
  clawhub: { owner: "steipete", slug: "weather", version: "1.0.0", reference: "@steipete/weather" },
});
const GATED = skill({
  name: "Needs Ripgrep Plus",
  slug: "needs-ripgrep-plus",
  description: "Needs a binary this host lacks.",
  tags: [],
  active: false,
  reasons: ["missing binary `definitely-missing-bin-xyz`", "env `QA_MISSING_ENV` not set"],
});

function list(items: Skill[]) {
  return { skills: items, count: items.length };
}

function hubSkill(over: Partial<ClawHubSkill> = {}): ClawHubSkill {
  return { slug: "weather", displayName: "Weather", summary: "Forecasts.", ownerHandle: "steipete", ...over };
}

beforeEach(() => {
  skills.mockImplementation(() => Promise.resolve(list([KOPI, WEATHER])));
  setSkillEnabled.mockImplementation((_slug: string, enabled: boolean) =>
    Promise.resolve({ name: "Kopi Pagi", enabled }),
  );
  uninstallSkill.mockImplementation(() => Promise.resolve({ name: "Kopi Pagi", removed: true }));
  installSkill.mockImplementation(() => Promise.resolve({ slug: "weather", installed: true }));
  clawhub.mockImplementation(() => Promise.resolve({ items: [] }));
  skillContent.mockImplementation(() => Promise.resolve({ slug: "kopi-pagi", name: "Kopi Pagi", content: "" }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const filterBox = () => screen.getByRole("textbox", { name: "Filter installed skills" });
const searchBox = () => screen.getByRole("textbox", { name: "Search ClawHub" });
const browseTab = () => screen.getByRole("button", { name: "Browse ClawHub" });
const installedTab = () => screen.getByRole("button", { name: /^Installed/ });

describe("SkillsPanel: state words", () => {
  it("shows a skill the loader drops as not loadable, with its reasons, and counts it apart", async () => {
    skills.mockImplementation(() => Promise.resolve(list([KOPI, GATED])));
    render(<SkillsPanel />);
    await screen.findByText("Needs Ripgrep Plus");
    expect(screen.getByText("not loadable")).toBeTruthy();
    expect(
      screen.getByText(
        "Not loaded: missing binary definitely-missing-bin-xyz; env QA_MISSING_ENV not set",
      ),
    ).toBeTruthy();
    expect(screen.getByText("1 active · 1 not loadable")).toBeTruthy();
    // Enabled, but not in force: the Power icon does not claim it is.
    const toggle = screen.getByRole("button", { name: "Disable Needs Ripgrep Plus" });
    expect(toggle.className).not.toMatch(/text-success/);
    expect(screen.getByRole("button", { name: "Disable Kopi Pagi" }).className).toMatch(/text-success/);
  });

  it("keeps the cards and shows a strip when a refresh fails", async () => {
    skills
      .mockImplementationOnce(() => Promise.resolve(list([KOPI, WEATHER])))
      .mockImplementation(() => Promise.reject(new ApiError("boom", 502, {})));
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/gateway is unreachable/);
    expect(screen.getByText("Kopi Pagi")).toBeTruthy();
    expect(screen.getByText("weather")).toBeTruthy();
  });

  it("prints a version only when someone set it", async () => {
    skills.mockImplementation(() =>
      Promise.resolve(list([KOPI, WEATHER, skill({ name: "weather-lite", slug: "weather-lite", version: "1.2.0" })])),
    );
    render(<SkillsPanel />);
    await screen.findByText("weather-lite");
    expect(screen.queryByText("v0.1.0")).toBeNull();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("v1.2.0")).toBeTruthy();
  });
});

describe("SkillsPanel: one query per view", () => {
  it("filters the installed list without searching ClawHub, and opens Browse with an empty box", async () => {
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.change(filterBox(), { target: { value: "kopi" } });
    expect(screen.queryByText("weather")).toBeNull();
    expect(screen.getByText("1 of 2 match “kopi”")).toBeTruthy();
    expect(clawhub).not.toHaveBeenCalled();
    fireEvent.click(browseTab());
    await waitFor(() => expect(clawhub).toHaveBeenCalled());
    expect(clawhub.mock.calls[0][0]).toBeUndefined();
    expect((searchBox() as HTMLInputElement).value).toBe("");
  });

  it("does not bring a ClawHub search back as a filter", async () => {
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.click(browseTab());
    await waitFor(() => expect(clawhub).toHaveBeenCalled());
    fireEvent.change(searchBox(), { target: { value: "zz" } });
    fireEvent.click(installedTab());
    await screen.findByText("Kopi Pagi");
    expect(screen.getByText("weather")).toBeTruthy();
    expect((filterBox() as HTMLInputElement).value).toBe("");
  });

  it("hands the term over only through 'Search ClawHub instead'", async () => {
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.change(filterBox(), { target: { value: "zzz" } });
    expect(screen.getByText("Nothing installed matches “zzz”.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search ClawHub instead" }));
    await waitFor(() => expect(clawhub.mock.calls.some((c) => c[0] === "zzz")).toBe(true), {
      timeout: 2000,
    });
    expect((searchBox() as HTMLInputElement).value).toBe("zzz");
    expect(await screen.findByText("No ClawHub skills match “zzz”.")).toBeTruthy();
    expect(screen.getByText("Try another word, or write one.")).toBeTruthy();
  });
});

describe("SkillsPanel: removing a skill", () => {
  it("calls it a delete for an authored skill and says there is no other copy", async () => {
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.click(screen.getByRole("button", { name: "Delete Kopi Pagi" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete “Kopi Pagi”?")).toBeTruthy();
    expect(within(dialog).getByText("Its SKILL.md is deleted. There is no other copy.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(uninstallSkill).toHaveBeenCalledWith("kopi-pagi"));
    expect(toastSuccess).toHaveBeenCalledWith("Deleted Kopi Pagi");
    // The trigger left with the card; a keyboard user is not dropped on <body>.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Write" })),
    );
  });

  it("names the ClawHub reference an uninstalled skill can be fetched from again", async () => {
    render(<SkillsPanel />);
    await screen.findByText("weather");
    fireEvent.click(screen.getByRole("button", { name: "Uninstall weather" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Uninstall “weather”?")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "It is removed from the agent. You can install @steipete/weather again from ClawHub.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Uninstall" })).toBeTruthy();
  });
});

describe("SkillsPanel: chrome", () => {
  it("uses the shared label scale and a focus ring on the segments", async () => {
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    expect(screen.getByText("2 active").className).toContain("eyebrow");
    expect(installedTab().className).toContain("focus-visible:outline-2");
    expect(browseTab().className).toContain("pointer-coarse:min-h-10");
  });
});

describe("SkillsPanel: ClawHub and feedback", () => {
  it("says who could not be reached and refreshes for real on Retry", async () => {
    clawhub.mockImplementation(() =>
      Promise.reject(
        new ApiError("fetch failed", 502, { error: "clawhub_unreachable", detail: "fetch failed" }),
      ),
    );
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.click(browseTab());
    await screen.findByText(
      "ClawHub could not be reached from the console's server (fetch failed). Check its network access, then retry.",
    );
    expect(clawhub.mock.calls[0][1]).toEqual({ fresh: false });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(clawhub).toHaveBeenCalledTimes(2));
    expect(clawhub.mock.calls[1][1]).toEqual({ fresh: true });
  });

  it("puts an install failure through the shared error words", async () => {
    clawhub.mockImplementation(() =>
      Promise.resolve({ items: [hubSkill({ slug: "gog", displayName: "Gog", ownerHandle: undefined })] }),
    );
    installSkill.mockImplementation(() => Promise.reject(new ApiError("x", 502, {})));
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.click(browseTab());
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/Install failed: The gateway is unreachable/);
  });

  it("writes the other-publisher note as text, not a tooltip", async () => {
    clawhub.mockImplementation(() =>
      Promise.resolve({ items: [hubSkill({ ownerHandle: "paudyyin" })] }),
    );
    render(<SkillsPanel />);
    await screen.findByText("Kopi Pagi");
    fireEvent.click(browseTab());
    await screen.findByText("Installed from @steipete. Uninstall it first to switch publishers.");
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("does not repeat the toolbar in the empty state", async () => {
    skills.mockImplementation(() => Promise.resolve(list([])));
    render(<SkillsPanel />);
    await screen.findByText("No skills installed yet.");
    expect(screen.queryByRole("button", { name: "Write a skill" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Browse ClawHub" })).toHaveLength(1);
    expect(screen.getByText(/Write one with the Write button, or open Browse ClawHub\./)).toBeTruthy();
  });

  it("keeps the full description reachable", async () => {
    render(<SkillsPanel />);
    const p = await screen.findByText("How to brew V60 pour-over.");
    expect(p.getAttribute("title")).toBe("How to brew V60 pour-over.");
  });
});

export { hubSkill };
