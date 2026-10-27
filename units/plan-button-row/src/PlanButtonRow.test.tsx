import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanButtonRow } from "./index";

afterEach(cleanup);

const BASE = "flex w-full flex-wrap items-center justify-end gap-3";

describe("PlanButtonRow", () => {
  it('renders a div with the attribute data-plan-button-row=""', () => {
    const r = render(<PlanButtonRow>x</PlanButtonRow>);
    const row = r.container.firstElementChild as HTMLElement;
    expect(row.tagName).toBe("DIV");
    expect(row.hasAttribute("data-plan-button-row")).toBe(true);
    expect(row.getAttribute("data-plan-button-row")).toBe("");
  });
  it("has exactly the base class string with no className", () => {
    const r = render(<PlanButtonRow>x</PlanButtonRow>);
    expect((r.container.firstElementChild as HTMLElement).getAttribute("class")).toBe(BASE);
  });
  it("appends a className after the base classes", () => {
    const r = render(<PlanButtonRow className="x">x</PlanButtonRow>);
    expect((r.container.firstElementChild as HTMLElement).getAttribute("class")).toBe(`${BASE} x`);
  });
  it("an empty className leaves no trailing space", () => {
    const r = render(<PlanButtonRow className="">x</PlanButtonRow>);
    expect((r.container.firstElementChild as HTMLElement).getAttribute("class")).toBe(BASE);
  });
  it("keeps the children in the order given", () => {
    const r = render(
      <PlanButtonRow>
        <button>Cancel</button>
        <button>Save</button>
      </PlanButtonRow>,
    );
    const names = [...r.container.querySelectorAll("button")].map((b) => b.textContent);
    expect(names).toEqual(["Cancel", "Save"]);
  });
  it("renders nothing else around the row", () => {
    const r = render(<PlanButtonRow>x</PlanButtonRow>);
    expect(r.container.children).toHaveLength(1);
  });
});
