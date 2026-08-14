// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The harness itself. `vitest.config.mts` collected only `.test.ts`, so no
 * React component in this repo was testable — this asserts that a `.tsx` test
 * is now collected AND that jsdom is available to it, which is the precondition
 * every component test in this plan depends on.
 */
describe("component test harness", () => {
  it("renders a component into a DOM", () => {
    render(<button type="button">approve</button>);
    expect(screen.getByRole("button", { name: "approve" })).toBeTruthy();
  });
});
