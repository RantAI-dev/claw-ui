// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Combobox } from "./combobox";

const items = [
  { value: "a", label: "A" },
  { value: "b", label: "B", hint: "local" },
];

afterEach(cleanup);

describe("Combobox", () => {
  it("is named by its visible label on the trigger and the list", () => {
    render(
      <>
        <span id="pick-label">Provider</span>
        <Combobox ariaLabelledBy="pick-label" items={items} value="a" onChange={() => {}} />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Provider" });
    expect(trigger.getAttribute("aria-labelledby")).toBe("pick-label");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox").getAttribute("aria-labelledby")).toBe("pick-label");
  });

  it("returns focus to the trigger on Escape", () => {
    render(<Combobox items={items} value="a" onChange={() => {}} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("picks with the arrow keys and Enter, then focuses the trigger", () => {
    const onChange = vi.fn();
    render(<Combobox items={items} value="a" onChange={onChange} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
