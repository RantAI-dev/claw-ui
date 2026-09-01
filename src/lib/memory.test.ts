import { describe, expect, it } from "vitest";
import {
  NAME_SEPARATOR_MESSAGE,
  absoluteTime,
  categoryOptions,
  emptyCopy,
  forgetFromTerminal,
  hasSeparator,
  isAutoSavedKey,
  isoTime,
  originWords,
  rememberToast,
} from "./memory";

describe("hasSeparator", () => {
  it("flags a slash or a backslash anywhere in the name", () => {
    expect(hasSeparator("team/alpha")).toBe(true);
    expect(hasSeparator("a\\b")).toBe(true);
    expect(hasSeparator("deploy-window")).toBe(false);
    expect(hasSeparator("")).toBe(false);
  });

  it("states the rule without an em dash", () => {
    expect(NAME_SEPARATOR_MESSAGE).toBe("A name cannot contain / or \\.");
  });
});

describe("forgetFromTerminal", () => {
  it("quotes the key so a space survives the shell", () => {
    expect(forgetFromTerminal("team/alpha notes")).toBe(
      'rantaiclaw memory clear --key "team/alpha notes" --yes',
    );
  });
});

describe("rememberToast", () => {
  it("says Remembered for a generated key and never prints it", () => {
    expect(
      rememberToast({ key: "memory_02c5bf27-0b49-482c-a882-ad52bd79d443", named: false, replaced: false, notes: [] }),
    ).toBe("Remembered");
  });

  it("names a chosen key", () => {
    expect(rememberToast({ key: "deploy-window", named: true, replaced: false, notes: [] })).toBe(
      "Remembered as deploy-window",
    );
  });

  it("says Replaced when the name was taken", () => {
    expect(rememberToast({ key: "deploy-window", named: true, replaced: true, notes: [] })).toBe(
      "Replaced deploy-window",
    );
  });

  it("appends the sanitizer notes as sentences, no em dash", () => {
    const t = rememberToast({
      key: "memory_02c5bf27-0b49-482c-a882-ad52bd79d443",
      named: false,
      replaced: false,
      notes: ["redacted what looked like a credential", "removed 2 invisible characters"],
    });
    expect(t).toBe("Remembered. Redacted what looked like a credential; removed 2 invisible characters.");
    expect(t).not.toContain("—");
  });
});

describe("isAutoSavedKey", () => {
  it("is true for a runtime auto-save key and false for the API's own generated key", () => {
    expect(isAutoSavedKey("user_msg_5a2b4873-e2a4-444d-b223-29b572d60755")).toBe(true);
    expect(isAutoSavedKey("assistant_resp_5a2b4873-e2a4-444d-b223-29b572d60755")).toBe(true);
    expect(isAutoSavedKey("memory_02c5bf27-0b49-482c-a882-ad52bd79d443")).toBe(false);
    expect(isAutoSavedKey("deploy-window")).toBe(false);
  });
});

describe("originWords", () => {
  const auto = "user_msg_5a2b4873-e2a4-444d-b223-29b572d60755";
  it("names an auto-save scoped to a conversation", () => {
    expect(originWords({ key: auto, session_id: "4735d9b0" })).toBe("saved from this conversation");
  });
  it("names an auto-save with no scope", () => {
    expect(originWords({ key: auto, session_id: null })).toBe("saved from a conversation");
  });
  it("names a chosen memory scoped to a conversation", () => {
    expect(originWords({ key: "scoped-note", session_id: "sess-1" })).toBe("this conversation only");
  });
  it("says nothing for a shared chosen memory or an API-generated one", () => {
    expect(originWords({ key: "deploy-window", session_id: null })).toBeNull();
    expect(originWords({ key: "memory_02c5bf27-0b49-482c-a882-ad52bd79d443", session_id: null })).toBeNull();
  });
});

describe("emptyCopy", () => {
  it("names the search that found nothing and offers to clear it", () => {
    expect(emptyCopy({ query: "zzzz", filter: "" })).toEqual({
      title: "No memories match “zzzz”.",
      hint: "Try fewer or different words.",
      action: "clear-search",
    });
  });
  it("names the empty category and offers to show all", () => {
    expect(emptyCopy({ query: "", filter: "daily" })).toEqual({
      title: "No daily memories.",
      hint: "Pick another category, or show all.",
      action: "clear-filter",
    });
  });
  it("prefers the search over the filter when both narrow", () => {
    expect(emptyCopy({ query: "x", filter: "daily" }).action).toBe("clear-search");
  });
  it("describes a fresh store with the next step", () => {
    expect(emptyCopy({ query: "", filter: "" })).toEqual({
      title: "No memories yet.",
      hint: "Add one above. Conversations are saved here too when auto-save is on.",
      action: null,
    });
  });
});

describe("categoryOptions", () => {
  it("lists the built-ins first, then what is on screen and what is selected, once each", () => {
    expect(categoryOptions(["core", "project", "daily", "project"], "ops")).toEqual([
      "core",
      "daily",
      "conversation",
      "project",
      "ops",
    ]);
  });
  it("ignores blanks", () => {
    expect(categoryOptions(["", "  "], "")).toEqual(["core", "daily", "conversation"]);
  });
});

describe("absoluteTime / isoTime", () => {
  it("renders an RFC3339 timestamp and an epoch number", () => {
    expect(absoluteTime("2026-09-01T09:22:14.499489656+00:00")).toEqual(expect.any(String));
    expect(isoTime("2026-09-01T09:22:14.499489656+00:00")).toBe("2026-09-01T09:22:14.499Z");
    expect(isoTime(1788254534)).toBe("2026-09-01T09:22:14.000Z");
  });
  it("is null for nothing or garbage", () => {
    expect(absoluteTime(null)).toBeNull();
    expect(absoluteTime("soon")).toBeNull();
    expect(isoTime(undefined)).toBeNull();
  });
});
