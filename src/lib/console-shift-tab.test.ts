// @vitest-environment happy-dom
//
// `shiftTabCyclesAutonomy` walks the DOM (`closest`), so it needs a document.
// The rest of `console.ts` is pure and stays on the fast node environment.
import { describe, it, expect } from "vitest";
import { shiftTabCyclesAutonomy } from "./console";

describe("shiftTabCyclesAutonomy", () => {
  /** A detached element tree, so `closest` has something real to walk. */
  function focusIn(html: string, sel: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.querySelector(sel)!;
  }

  it("does not claim the key from a button — that is reverse-tab", () => {
    // The defect: the old guard exempted only text fields, so Shift+Tab from
    // any button both swallowed the key and moved an approval-gating setting.
    const btn = focusIn('<button id="b">Refresh</button>', "#b");
    expect(shiftTabCyclesAutonomy(btn, false)).toBe(false);
  });

  it("does not claim the key from a link", () => {
    const link = focusIn('<a id="a" href="#x">Docs</a>', "#a");
    expect(shiftTabCyclesAutonomy(link, false)).toBe(false);
  });

  it("still claims the key from the autonomy control the hint is printed on", () => {
    const rung = focusIn(
      '<div class="auto-pick"><div class="seg"><button id="r">SMART</button></div></div>',
      "#r",
    );
    expect(shiftTabCyclesAutonomy(rung, false)).toBe(true);
  });

  it("claims the key when nothing is focused", () => {
    expect(shiftTabCyclesAutonomy(null, false)).toBe(true);
    expect(shiftTabCyclesAutonomy(document.body, false)).toBe(true);
  });

  it("never claims the key while a dialog is open", () => {
    // Control: the same focus without a dialog does claim it, so this is the
    // dialog check and not an inert guard.
    const rung = focusIn('<div class="auto-pick"><button id="r2">X</button></div>', "#r2");
    expect(shiftTabCyclesAutonomy(rung, false)).toBe(true);
    expect(shiftTabCyclesAutonomy(rung, true)).toBe(false);
  });

  it("does not claim the key from a text field", () => {
    const input = focusIn('<input id="i" />', "#i");
    expect(shiftTabCyclesAutonomy(input, false)).toBe(false);
  });
});
