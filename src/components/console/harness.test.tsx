// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The harness itself. `vitest.config.mts` collected only `.test.ts`, so no
 * React component in this repo was testable — this asserts that a `.tsx` test
 * is now collected AND that a DOM is available to it, which is the precondition
 * every component test depends on.
 *
 * `happy-dom`, not jsdom: jsdom 30 pulls an undici that needs a newer Node than
 * CI's 20, and the forks worker died with
 * `webidl.util.markAsUncloneable is not a function`. It passed locally on Node
 * 26 — local green was not CI green.
 */
describe("component test harness", () => {
  it("renders a component into a DOM", () => {
    render(<button type="button">approve</button>);
    expect(screen.getByRole("button", { name: "approve" })).toBeTruthy();
  });
});
