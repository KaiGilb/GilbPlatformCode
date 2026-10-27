import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RemoveControl } from "./index";

afterEach(cleanup);

describe("RemoveControl", () => {
  it("is a named button with an SVG circle-minus, the size-6 box, and no text", () => {
    const onClick = vi.fn();
    render(<RemoveControl label="Remove address home" onClick={onClick} className="mt-1" />);
    const b = screen.getByRole("button", { name: "Remove address home" });
    expect(b.textContent).toBe("");
    expect(b.className).toMatch(/\bsize-6\b/);
    expect(b.className).toContain("mt-1");
    expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("style")).toContain("color-error-dark");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled", () => {
    const onClick = vi.fn();
    render(<RemoveControl label="Remove address home" onClick={onClick} disabled />);
    const b = screen.getByRole("button") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is enabled by default", () => {
    render(<RemoveControl label="Remove x" onClick={() => {}} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("carries data-remove-control=minus-circle and type=button", () => {
    render(<RemoveControl label="Remove x" onClick={() => {}} />);
    const b = screen.getByRole("button", { name: "Remove x" });
    expect(b.getAttribute("data-remove-control")).toBe("minus-circle");
    expect(b.getAttribute("type")).toBe("button");
  });

  it("the accessible name is the label, set as aria-label", () => {
    render(<RemoveControl label="Remove phone work" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove phone work" }).getAttribute("aria-label")).toBe("Remove phone work");
  });

  it("has no data-testid unless testId is given; testId is written as data-testid", () => {
    const { rerender } = render(<RemoveControl label="Remove x" onClick={() => {}} />);
    expect(screen.getByRole("button").hasAttribute("data-testid")).toBe(false);
    rerender(<RemoveControl label="Remove x" onClick={() => {}} testId="row-remove" />);
    expect(screen.getByTestId("row-remove").getAttribute("data-remove-control")).toBe("minus-circle");
  });

  it("className: the base classes first, then the nudge after one space; an empty nudge leaves no trailing space", () => {
    const { rerender } = render(<RemoveControl label="Remove x" onClick={() => {}} className="mt-1" />);
    const withNudge = screen.getByRole("button").getAttribute("class")!;
    expect(withNudge.endsWith(" disabled:opacity-50 mt-1")).toBe(true);
    rerender(<RemoveControl label="Remove x" onClick={() => {}} />);
    const plain = screen.getByRole("button").getAttribute("class")!;
    expect(plain.endsWith("disabled:opacity-50")).toBe(true);
    expect(plain.endsWith(" ")).toBe(false);
    rerender(<RemoveControl label="Remove x" onClick={() => {}} className="" />);
    expect(screen.getByRole("button").getAttribute("class")).toBe(plain);
    expect(withNudge).toBe(`${plain} mt-1`);
  });

  it("its hit area reaches 8 px past every side of the 24 px circle (40 px in all), and it has a focus-visible outline", () => {
    render(<RemoveControl label="Remove x" onClick={() => {}} />);
    const b = screen.getByRole("button", { name: "Remove x" });
    expect(b.className).toMatch(/size-6/);
    expect(b.className).toMatch(/before:absolute/);
    expect(b.className).toMatch(/before:-inset-2/);
    expect(b.className).toMatch(/focus-visible:outline/);
    expect(b.className).toContain("text-lg");
    expect(b.className).toContain("disabled:opacity-50");
  });

  it("is coloured with --color-error-dark, falling back to --bad, then #b3261e", () => {
    render(<RemoveControl label="Remove x" onClick={() => {}} />);
    expect(screen.getByRole("button").getAttribute("style")).toBe("color: var(--color-error-dark, var(--bad, #b3261e));");
  });

  it("draws a 24-unit viewBox SVG, 1em square, hidden from assistive technology, with an even-odd path", () => {
    render(<RemoveControl label="Remove x" onClick={() => {}} />);
    const svg = screen.getByRole("button").querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("1em");
    expect(svg.getAttribute("height")).toBe("1em");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    const path = svg.querySelector("path")!;
    expect(path.getAttribute("fill-rule")).toBe("evenodd");
    expect(path.getAttribute("d")).toBe("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM6 10.8h12v2.4H6Z");
  });
});
