import { describe, expect, it } from "vitest";

import {
  candidateAnnotation,
  candidatesFromError,
  skillReference,
} from "./clawhub";

describe("candidateAnnotation", () => {
  const base = { owner: "steipete", reference: "@steipete/weather", url: "" };

  it("says nothing when nothing is known", () => {
    // An older gateway sends neither field, and the lookup behind them is
    // best-effort. A bare reference is honest; "0 installs" would read as
    // "nobody uses this", which is a claim we have not earned.
    expect(candidateAnnotation(base)).toBe("");
    expect(candidateAnnotation({ ...base, downloads: 0 })).toBe("");
    expect(candidateAnnotation({ ...base, official: false })).toBe("");
  });

  it("reports installs and the official marker", () => {
    expect(candidateAnnotation({ ...base, downloads: 165212 })).toBe(
      "165,212 installs",
    );
    expect(
      candidateAnnotation({ ...base, downloads: 165212, official: true }),
    ).toBe("165,212 installs · official");
    expect(candidateAnnotation({ ...base, official: true })).toBe("official");
  });

  it("separates the fork from the original it copies", () => {
    // The concrete case this exists for: same slug, same display name, same
    // summary — only these numbers tell them apart.
    const original = candidateAnnotation({
      ...base,
      downloads: 165212,
      official: true,
    });
    const fork = candidateAnnotation({
      owner: "legionspace-hackathon",
      reference: "@legionspace-hackathon/weather",
      url: "",
      downloads: 68,
    });
    expect(original).not.toBe(fork);
    expect(fork).toBe("68 installs");
  });
});

describe("skillReference", () => {
  it("qualifies the publisher when the endpoint reported one", () => {
    // The reference is both the install target and the list key. A bare slug
    // installs whichever publisher the server happens to resolve, and four
    // same-slug rows would collide on one React key.
    expect(skillReference({ slug: "weather", ownerHandle: "steipete" })).toBe(
      "@steipete/weather",
    );
  });

  it("stays bare when no publisher is known", () => {
    // The browse listing reports no owner at all; those resolve through the
    // gateway's 409 instead of guessing here.
    expect(skillReference({ slug: "weather" })).toBe("weather");
    expect(skillReference({ slug: "weather", ownerHandle: "" })).toBe("weather");
    expect(skillReference({ slug: "weather", ownerHandle: "  " })).toBe(
      "weather",
    );
  });

  it("keeps same-slug results distinguishable", () => {
    const rows = [
      { slug: "weather", ownerHandle: "steipete" },
      { slug: "weather", ownerHandle: "lfengwa2" },
      { slug: "weather", ownerHandle: "tongguanghai" },
    ].map(skillReference);
    expect(new Set(rows).size).toBe(3);
  });
});

describe("candidatesFromError", () => {
  const ambiguous = {
    body: {
      error: "ambiguous_skill_slug",
      matches: [
        {
          owner: "steipete",
          reference: "@steipete/weather",
          url: "https://clawhub.ai/steipete/skills/weather",
        },
        { owner: "lfengwa2", reference: "@lfengwa2/weather", url: "" },
      ],
    },
  };

  it("extracts the publishers the gateway offered", () => {
    const candidates = candidatesFromError(ambiguous);
    expect(candidates).toHaveLength(2);
    expect(candidates?.[0].reference).toBe("@steipete/weather");
  });

  it("returns null for anything that is not an ambiguity", () => {
    // Every other failure has to fall back to showing its message rather
    // than opening an empty publisher picker.
    expect(candidatesFromError(new Error("network down"))).toBeNull();
    expect(candidatesFromError({ body: { error: "internal_error" } })).toBeNull();
    expect(candidatesFromError({ body: { matches: [] } })).toBeNull();
    expect(candidatesFromError(null)).toBeNull();
    expect(candidatesFromError(undefined)).toBeNull();
  });

  it("ignores malformed entries rather than rendering blank rows", () => {
    expect(
      candidatesFromError({ body: { matches: [{ owner: "x" }, null, 7] } }),
    ).toBeNull();
    const mixed = candidatesFromError({
      body: {
        matches: [{ owner: "x" }, { owner: "y", reference: "@y/w", url: "" }],
      },
    });
    expect(mixed).toHaveLength(1);
    expect(mixed?.[0].reference).toBe("@y/w");
  });
});
