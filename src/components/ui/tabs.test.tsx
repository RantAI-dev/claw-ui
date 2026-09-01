// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

afterEach(() => cleanup());

function Fixture() {
  return (
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
        <TabsTrigger value="c">Gamma</TabsTrigger>
      </TabsList>
      <TabsContent value="a">panel a</TabsContent>
      <TabsContent value="b">panel b</TabsContent>
      <TabsContent value="c">panel c</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("exposes tablist, tab and tabpanel roles with the selected state", () => {
    render(<Fixture />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toBe("panel a");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(tabs[0].getAttribute("aria-controls")).toBe(panel.id);
  });

  it("moves and activates with the arrow keys, wrapping at the ends", () => {
    render(<Fixture />);
    const [a, b, c] = screen.getAllByRole("tab");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("panel b");
    fireEvent.keyDown(b, { key: "ArrowLeft" });
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(c);
    expect(screen.getByRole("tabpanel").textContent).toBe("panel c");
    fireEvent.keyDown(c, { key: "Home" });
    expect(document.activeElement).toBe(a);
  });

  it("carries the console's focus ring and coarse-pointer height, and passes data attributes through", () => {
    render(
      <Tabs defaultValue="x">
        <TabsList>
          <TabsTrigger value="x" data-autofocus>
            X
          </TabsTrigger>
        </TabsList>
        <TabsContent value="x">x</TabsContent>
      </Tabs>,
    );
    const tab = screen.getByRole("tab");
    expect(tab.className).toContain("focus-visible:outline-2");
    expect(tab.className).toContain("pointer-coarse:min-h-10");
    expect(tab.hasAttribute("data-autofocus")).toBe(true);
  });
});
