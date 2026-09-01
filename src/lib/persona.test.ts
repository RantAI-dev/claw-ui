import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  RUNTIME_DEFAULTS,
  fieldErrors,
  formFromPersonality,
  freshForm,
  isDirty,
  isFresh,
  isValidTimeZone,
  kbBlockState,
  kbUnavailableCode,
  nearCap,
  sameSet,
  timeZoneOptions,
  trimForm,
} from "./persona";

const SAVED = {
  profile: "default",
  preset: "default",
  name: "RantaiClaw",
  role: "AI employee",
  tone: "concise",
  avoid: "",
  timezone: "Asia/Jakarta",
  always_on_kbs: ["a", "b"],
};

describe("timezone", () => {
  it("accepts IANA names and rejects made-up ones", () => {
    expect(isValidTimeZone("Asia/Jakarta")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
  });

  it("lists the browser's IANA names", () => {
    expect(timeZoneOptions()).toContain("Asia/Jakarta");
  });
});

describe("form", () => {
  it("tells a fresh profile from a saved persona", () => {
    expect(isFresh({ profile: "default", preset: null, configured: false })).toBe(true);
    expect(isFresh(SAVED)).toBe(false);
  });

  it("fills the fresh form with the runtime defaults and the given timezone", () => {
    expect(freshForm("Asia/Jakarta")).toEqual({
      ...RUNTIME_DEFAULTS,
      timezone: "Asia/Jakarta",
      avoid: "",
      alwaysOn: [],
    });
  });

  it("maps nulls to empty strings and a missing list to []", () => {
    expect(formFromPersonality({ profile: "p", preset: null, role: null, avoid: null })).toEqual({
      preset: "",
      name: "",
      timezone: "",
      role: "",
      tone: "",
      avoid: "",
      alwaysOn: [],
    });
  });

  it("is clean against its own snapshot and dirty on any field or base change", () => {
    const saved = formFromPersonality(SAVED);
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty({ ...saved, avoid: "x" }, saved)).toBe(true);
    expect(isDirty({ ...saved, alwaysOn: ["b", "a"] }, saved)).toBe(false);
    expect(isDirty({ ...saved, alwaysOn: ["a", "b", "c"] }, saved)).toBe(true);
    expect(isDirty({ ...saved, name: " RantaiClaw " }, saved)).toBe(false);
  });

  it("trims every string and keeps the bases", () => {
    const f = trimForm({ ...formFromPersonality(SAVED), name: " x ", avoid: "  " });
    expect(f.name).toBe("x");
    expect(f.avoid).toBe("");
    expect(f.alwaysOn).toEqual(["a", "b"]);
  });

  it("compares id sets regardless of order", () => {
    expect(sameSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSet(["a"], ["a", "a"])).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("is empty for the runtime defaults", () => {
    expect(fieldErrors(freshForm("UTC"))).toEqual({});
  });

  it("names each blank required field", () => {
    const f = freshForm("UTC");
    expect(fieldErrors({ ...f, name: "  " }).name).toBe("Name is required.");
    expect(fieldErrors({ ...f, role: "" }).role).toBe("Role is required.");
    expect(fieldErrors({ ...f, tone: "" }).tone).toBe("Tone is required.");
    expect(fieldErrors({ ...f, timezone: "" }).timezone).toBe("Timezone is required.");
  });

  it("refuses a timezone the runtime would print verbatim", () => {
    expect(fieldErrors({ ...freshForm("UTC"), timezone: "Mars" }).timezone).toMatch(/IANA/);
  });
});

describe("nearCap", () => {
  it("shows a counter only within 20 characters of the cap", () => {
    expect(nearCap("a".repeat(60), 80)).toBe("60/80");
    expect(nearCap("abc", 80)).toBeNull();
  });
});

describe("knowledge-base block", () => {
  const group = { id: "g1", name: "Product docs", description: null, color: null };

  it("recognises the two unavailable codes and nothing else", () => {
    expect(kbUnavailableCode(new ApiError("off", 403, { error: "kb_disabled" }))).toBe("kb_disabled");
    expect(kbUnavailableCode(new ApiError("no key", 503, { error: "kb_not_configured" }))).toBe(
      "kb_not_configured",
    );
    expect(kbUnavailableCode(new ApiError("boom", 502, null))).toBeNull();
    expect(kbUnavailableCode(new Error("boom"))).toBeNull();
  });

  it("maps loading, off, no key, error, empty and list", () => {
    expect(kbBlockState({ loading: true, error: null, data: null })).toEqual({ kind: "loading" });
    expect(kbBlockState({ loading: false, error: null, data: { unavailable: "kb_disabled" } })).toEqual({
      kind: "off",
    });
    expect(
      kbBlockState({ loading: false, error: null, data: { unavailable: "kb_not_configured" } }),
    ).toEqual({ kind: "no-key" });
    expect(kbBlockState({ loading: false, error: "boom", data: null })).toEqual({
      kind: "error",
      message: "boom",
    });
    expect(kbBlockState({ loading: false, error: null, data: [] })).toEqual({ kind: "empty" });
    expect(kbBlockState({ loading: false, error: null, data: [group] })).toEqual({
      kind: "list",
      groups: [group],
    });
  });
});
