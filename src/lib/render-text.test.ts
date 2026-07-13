import { describe, expect, it } from "vitest";
import { coerceText, stripThink } from "./render-text";

describe("stripThink", () => {
  it("removes a closed reasoning block and keeps the answer", () => {
    expect(stripThink("<think>plan the steps</think>Here is the answer.", false)).toBe(
      "Here is the answer.",
    );
  });

  it("removes multiple blocks anywhere in the content", () => {
    expect(stripThink("A<think>x</think>B<think>y</think>C", false)).toBe("ABC");
  });

  it("is case-insensitive and tolerates attributes on the tag", () => {
    expect(stripThink('pre<THINK id="1">hidden</THINK>post', false)).toBe("prepost");
  });

  it("hides an unclosed trailing block while streaming", () => {
    expect(stripThink("Answer so far<think>still reason", true)).toBe("Answer so far");
  });

  it("leaves an unclosed block intact when not streaming (nothing to hide yet)", () => {
    // A finalized turn with a dangling <think> is malformed; don't eat real text.
    expect(stripThink("Answer<think>oops", false)).toBe("Answer<think>oops");
  });

  it("leaves ordinary content untouched", () => {
    expect(stripThink("just a normal reply", true)).toBe("just a normal reply");
  });
});

describe("coerceText", () => {
  it("passes strings through", () => {
    expect(coerceText("hello")).toBe("hello");
  });

  it("maps null/undefined to empty string", () => {
    expect(coerceText(null)).toBe("");
    expect(coerceText(undefined)).toBe("");
  });

  it("never returns [object Object] — prefers a human field", () => {
    expect(coerceText({ label: "Ready", tone: "green" })).toBe("Ready");
    expect(coerceText({ name: "atlas" })).toBe("atlas");
  });

  it("falls back to compact JSON for a fieldless object", () => {
    expect(coerceText({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("stringifies primitives", () => {
    expect(coerceText(42)).toBe("42");
    expect(coerceText(true)).toBe("true");
  });
});
