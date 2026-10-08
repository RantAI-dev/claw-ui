import { describe, expect, it } from "vitest";
import {
  NAME_SEPARATOR_MESSAGE,
  absoluteTime,
  categoryOptions,
  emptyCopy,
  groupRecordings,
  removedToast,
  forgetFromTerminal,
  hasSeparator,
  isAutoSavedKey,
  isoTime,
  originWords,
  rememberToast,
  memoryUsage,
  memoryVerdict,
  placeLabel,
  placeOptions,
  rowOrigin,
} from "./memory";
import type { SessionSummary } from "./types";

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
  it("names an empty place and offers to show all places", () => {
    expect(emptyCopy({ query: "", filter: "", place: "private" })).toEqual({
      title: "No notes in this place.",
      hint: "Pick another place, or show all.",
      action: "clear-place",
    });
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

describe("memoryVerdict", () => {
  it("answers with the count when the backend is healthy and holds entries", () => {
    expect(memoryVerdict({ backend: "sqlite", total_entries: 7, healthy: true })).toEqual({
      headline: "7 memories on recall",
      tone: "ok",
      meta: ["sqlite backend"],
    });
    expect(memoryVerdict({ backend: "sqlite", total_entries: 1, healthy: true }).headline).toBe(
      "1 memory on recall",
    );
  });

  it("names the empty store and the first move", () => {
    const v = memoryVerdict({ backend: "markdown", total_entries: 0, healthy: true });
    expect(v.tone).toBe("warn");
    expect(v.headline).toBe("Nothing on recall yet");
    expect(v.meta).toEqual(["markdown backend"]);
    expect(v.detail).toMatch(/auto-save/);
  });

  it("reports a failed health check over everything else", () => {
    const v = memoryVerdict({ backend: "sqlite", total_entries: 9, healthy: false });
    expect(v.tone).toBe("warn");
    expect(v.headline).toBe("Recall isn't working");
    expect(v.detail).toMatch(/health check/);
  });
});

describe("memoryUsage", () => {
  it("reads used over maximum while under the cap", () => {
    expect(memoryUsage(1200, 4000)).toEqual({ text: "MEMORY.md 1200 / 4000 characters", over: false });
  });

  it("is not over exactly at the cap", () => {
    expect(memoryUsage(4000, 4000)).toEqual({ text: "MEMORY.md 4000 / 4000 characters", over: false });
  });

  it("is over once the count passes the cap", () => {
    expect(memoryUsage(4001, 4000)).toEqual({ text: "MEMORY.md 4001 / 4000 characters", over: true });
  });

  it("says nothing unless the gateway sent both numbers", () => {
    expect(memoryUsage(undefined, 4000)).toBeNull();
    expect(memoryUsage(1200, undefined)).toBeNull();
    expect(memoryUsage(undefined, undefined)).toBeNull();
    expect(memoryUsage(0, 4000)?.text).toBe("MEMORY.md 0 / 4000 characters");
  });
});

describe("memoryVerdict: placement and usage", () => {
  const base = { backend: "sqlite", total_entries: 5, healthy: true };

  it("adds the counts, the search mode and the usage when the gateway sent them", () => {
    const v = memoryVerdict({
      ...base,
      mode: "hybrid",
      private_entries: 3,
      conversation_entries: 2,
      memory_md_chars: 1200,
      memory_md_max_chars: 4000,
    });
    expect(v.tone).toBe("ok");
    expect(v.meta).toEqual([
      "sqlite backend",
      "3 private notes",
      "2 conversation notes",
      "hybrid search",
      "MEMORY.md 1200 / 4000 characters",
    ]);
    expect(v.detail).toBeUndefined();
  });

  it("uses the singular and keeps a zero count that was sent", () => {
    const v = memoryVerdict({ ...base, private_entries: 1, conversation_entries: 0 });
    expect(v.meta).toEqual(["sqlite backend", "1 private note", "0 conversation notes"]);
  });

  it("leaves out every part the gateway did not send, with no placeholder", () => {
    const v = memoryVerdict(base);
    expect(v.meta).toEqual(["sqlite backend"]);
    expect(JSON.stringify(v)).not.toMatch(/undefined|NaN|null/);
  });

  it("turns to the warning tone over the cap and says what is left out", () => {
    const v = memoryVerdict({ ...base, memory_md_chars: 4500, memory_md_max_chars: 4000 });
    expect(v.tone).toBe("warn");
    expect(v.headline).toBe("5 memories on recall");
    expect(v.detail).toMatch(/oldest notes are left out of the prompt file/);
  });

  it("stays in the ok tone at the cap", () => {
    expect(memoryVerdict({ ...base, memory_md_chars: 4000, memory_md_max_chars: 4000 }).tone).toBe("ok");
  });

  it("lets a failed health check outrank the cap", () => {
    const v = memoryVerdict({ ...base, healthy: false, memory_md_chars: 4500, memory_md_max_chars: 4000 });
    expect(v.headline).toBe("Recall isn't working");
  });
});

describe("placeLabel", () => {
  it("says Private for a note with no session whose placement fields are all null", () => {
    expect(placeLabel({ session_id: null, surface: null, place: null, thread: null })).toBe("Private");
  });

  it("joins the surface, the place and the thread when the surface is a string", () => {
    expect(placeLabel({ session_id: "telegram:team-room", surface: "telegram", place: "team-room", thread: null })).toBe(
      "telegram · team-room",
    );
    expect(placeLabel({ session_id: "slack:ops:t42", surface: "slack", place: "ops", thread: "t42" })).toBe(
      "slack · ops · thread t42",
    );
  });

  it("is null for a session id with no surface, so the old wording applies", () => {
    expect(placeLabel({ session_id: "sess-1", surface: null, place: null, thread: null })).toBeNull();
  });

  it("is null when the gateway sent no placement", () => {
    expect(placeLabel({ session_id: null })).toBeNull();
    expect(placeLabel({})).toBeNull();
  });
});

describe("rowOrigin", () => {
  const AUTO = "user_msg_5a2b4873-e2a4-444d-b223-29b572d60755";

  it("names the conversation place and nothing else", () => {
    expect(
      rowOrigin({ key: AUTO, session_id: "telegram:room", surface: "telegram", place: "room", thread: null }),
    ).toBe("telegram · room");
  });

  it("keeps the auto-saved hint next to Private", () => {
    expect(rowOrigin({ key: AUTO, session_id: null, surface: null, place: null, thread: null })).toBe(
      "Private · saved from a conversation",
    );
    expect(rowOrigin({ key: "deploy-window", session_id: null, surface: null, place: null, thread: null })).toBe(
      "Private",
    );
  });

  it("falls back to the session-id wording for a session id without a surface", () => {
    expect(rowOrigin({ key: "scoped", session_id: "sess-1", surface: null, place: null, thread: null })).toBe(
      "this conversation only",
    );
    expect(rowOrigin({ key: "scoped", session_id: "sess-1" })).toBe("this conversation only");
  });
});

describe("placeOptions", () => {
  const rows = [
    { session_id: "telegram:room-a", surface: "telegram", place: "room-a", thread: null },
    { session_id: "telegram:room-a", surface: "telegram", place: "room-a", thread: null },
    { session_id: null, surface: null, place: null, thread: null },
    { session_id: "slack:ops", surface: "slack", place: "ops", thread: null },
    { session_id: "old-session", surface: undefined, place: undefined, thread: undefined },
  ];

  it("offers one option per conversation on the page, once each", () => {
    expect(placeOptions(rows, "")).toEqual([
      { value: "telegram:room-a", label: "telegram · room-a" },
      { value: "slack:ops", label: "slack · ops" },
    ]);
  });

  it("keeps a selected conversation that is not on the page, labelled by its key", () => {
    expect(placeOptions([], "discord:lobby")).toEqual([{ value: "discord:lobby", label: "discord:lobby" }]);
  });

  it("does not repeat the private choice as a conversation", () => {
    expect(placeOptions([], "private")).toEqual([]);
  });
});

describe("groupRecordings", () => {
  const row = (over: Partial<SessionSummary>): SessionSummary => ({
    id: "s1",
    title: null,
    model: null,
    started_at: null,
    message_count: 1,
    source: "channel",
    conversation_key: "telegram:room-a",
    surface: "telegram",
    place: "room-a",
    thread: null,
    ...over,
  });

  it("puts the rows of one conversation together, in order of first appearance", () => {
    const groups = groupRecordings([
      row({ id: "a1" }),
      row({ id: "b1", conversation_key: "slack:ops", surface: "slack", place: "ops" }),
      row({ id: "a2" }),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.recordings.map((r) => r.id)])).toEqual([
      ["telegram:room-a", "telegram · room-a", ["a1", "a2"]],
      ["slack:ops", "slack · ops", ["b1"]],
    ]);
  });

  it("drops a row whose source is not channel, or is absent", () => {
    expect(groupRecordings([row({ source: "cli" }), row({ source: undefined })])).toEqual([]);
  });

  it("falls back to the key, then to a plain name, when the gateway sent no placement", () => {
    expect(groupRecordings([row({ surface: null, place: null })])[0].label).toBe("telegram:room-a");
    expect(
      groupRecordings([row({ surface: null, place: null, conversation_key: null })])[0].label,
    ).toBe("Unknown conversation");
  });
});

describe("removedToast", () => {
  it("counts the recordings removed", () => {
    expect(removedToast(1)).toBe("Removed 1 recording");
    expect(removedToast(3)).toBe("Removed 3 recordings");
    expect(removedToast(undefined)).toBe("Conversation deleted");
  });
});
