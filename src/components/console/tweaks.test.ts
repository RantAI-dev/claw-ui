import { describe, it, expect } from "vitest";
import { sanitizeTweaks, TWEAK_DEFAULTS } from "./tweaks";

describe("sanitizeTweaks", () => {
  it("returns the defaults for a non-object blob", () => {
    expect(sanitizeTweaks(null)).toEqual(TWEAK_DEFAULTS);
    expect(sanitizeTweaks("garbage")).toEqual(TWEAK_DEFAULTS);
    expect(sanitizeTweaks(42)).toEqual(TWEAK_DEFAULTS);
  });

  it("drops out-of-range fields and keeps the default per field", () => {
    // A corrupted / hand-edited blob: bogus enum, wrong-typed rightPanel.
    const out = sanitizeTweaks({ voice: "Nonsense", render: 123, rightPanel: "yes" });
    expect(out.voice).toBe(TWEAK_DEFAULTS.voice);
    expect(out.render).toBe(TWEAK_DEFAULTS.render);
    expect(out.rightPanel).toBe(TWEAK_DEFAULTS.rightPanel);
  });

  it("keeps valid fields verbatim", () => {
    const out = sanitizeTweaks({
      voice: "Serif",
      traces: "Expanded",
      density: "Compact",
      rightPanel: false,
      render: "Generative UI",
    });
    expect(out).toMatchObject({
      voice: "Serif",
      traces: "Expanded",
      density: "Compact",
      rightPanel: false,
      render: "Generative UI",
    });
  });

  it("ignores unknown keys entirely", () => {
    const out = sanitizeTweaks({ hacked: "<script>", voice: "Serif" });
    expect(out).not.toHaveProperty("hacked");
    expect(out.voice).toBe("Serif");
  });
});
