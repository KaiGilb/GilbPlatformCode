import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CardIcon, type CardIconName } from "./index";

afterEach(cleanup);

// Written as a Record so that adding or removing a name in the source fails to compile here.
const NAMES: Record<CardIconName, true> = {
  name: true,
  email: true,
  phone: true,
  address: true,
  account: true,
  skill: true,
  interest: true,
  language: true,
  employment: true,
  memberOf: true,
  represents: true,
  relation: true,
  channel: true,
  clock: true,
  record: true,
  attachment: true,
  note: true,
  pin: true,
};
const ALL = Object.keys(NAMES) as CardIconName[];

describe("CardIcon", () => {
  it("there are 18 names", () => {
    expect(ALL).toHaveLength(18);
  });
  it.each(ALL)("%s draws one decorative stroke svg with a path", (name) => {
    const { container } = render(<CardIcon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-card-icon")).toBe(name);
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("1em");
    expect(svg.getAttribute("height")).toBe("1em");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("fill")).toBe("none");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("1.7");
    expect(svg.getAttribute("stroke-linecap")).toBe("round");
    expect(svg.getAttribute("stroke-linejoin")).toBe("round");
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(10);
  });
  it("className is passed through; the default is empty", () => {
    const { container, rerender } = render(<CardIcon name="email" className="shrink-0 text-[14px]" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toBe("shrink-0 text-[14px]");
    rerender(<CardIcon name="email" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toBe("");
  });
  it("address and pin share one path (the pin is the address mark)", () => {
    const d = (n: CardIconName) => render(<CardIcon name={n} />).container.querySelector("path")!.getAttribute("d");
    expect(d("pin")).toBe(d("address"));
  });
  it("every other name has its own path", () => {
    const paths = ALL.map((n) => {
      const { container, unmount } = render(<CardIcon name={n} />);
      const d = container.querySelector("path")!.getAttribute("d");
      unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(17);
  });
});
