import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("children API: a Cancel-last row warns in dev, a Save-last row does not", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <PlanButtonRow>
        <button>Save</button>
        <button>Cancel</button>
      </PlanButtonRow>,
    );
    expect(warn).toHaveBeenCalledWith("PlanButtonRow: positive action must be rightmost — RuleUiActionRowMacOrder");
    warn.mockClear();
    render(
      <PlanButtonRow>
        <button>Cancel</button>
        <button>Save</button>
      </PlanButtonRow>,
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("children API is unchanged: the same single div, no wrapper", () => {
    const r = render(<PlanButtonRow><button>Cancel</button><button>Save</button></PlanButtonRow>);
    expect(r.container.querySelector("[data-plan-button-row-box]")).toBeNull();
    expect(r.container.querySelector("[data-slot]")).toBeNull();
  });
});

describe("PlanButtonRow structured API", () => {
  const three = () =>
    render(<PlanButtonRow destructive={<button>Delete</button>} cancel={<button>Cancel</button>} primary={<button>Save</button>} />);
  it("orders the slots destructive, cancel, primary whatever the prop order", () => {
    const r = three();
    expect([...r.container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Delete", "Cancel", "Save"]);
    const r2 = render(<PlanButtonRow primary={<button>Save</button>} cancel={<button>Cancel</button>} />);
    expect([...r2.container.querySelectorAll("[data-structured] button")].map((b) => b.textContent)).toEqual(["Cancel", "Save"]);
  });
  it("is right-aligned and pushes the destructive slot to the far left", () => {
    const r = three();
    const row = r.container.querySelector("[data-plan-button-row]") as HTMLElement;
    expect(row.className).toContain("justify-end");
    expect(r.container.querySelector('[data-slot="destructive"]')!.className).toContain("mr-auto");
    expect(r.container.querySelector('[data-slot="primary"]')!.className).not.toContain("mr-auto");
  });
  it("shares the width equally below 360px (container query classes on every slot)", () => {
    const r = three();
    expect((r.container.querySelector("[data-plan-button-row-box]") as HTMLElement).className).toContain("@container");
    for (const slot of r.container.querySelectorAll("[data-slot]")) {
      expect(slot.className).toContain("@max-[360px]:flex-1");
      expect(slot.className).toContain("@max-[360px]:[&>*]:w-full");
    }
  });
  it("does not warn (no children)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    three();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("passes a style through to the row, for a host without Tailwind", () => {
    const r = render(<PlanButtonRow style={{ gap: 12 }} cancel={<button>Cancel</button>} primary={<button>Save</button>} />);
    expect((r.container.querySelector("[data-plan-button-row]") as HTMLElement).style.gap).toBe("12px");
  });
});

describe("PlanButtonRow action-row CSS and confirm", () => {
  it("structured row has gs-actionrow, marks the destructive slot far, and writes the CSS once", () => {
    document.head.querySelectorAll("style[data-gs-actionrow]").forEach((n) => n.remove());
    const r = render(<PlanButtonRow destructive={<button>Delete</button>} cancel={<button>Cancel</button>} primary={<button>Save</button>} />);
    render(<PlanButtonRow cancel={<button>Cancel</button>} primary={<button>Save</button>} />);
    const row = r.container.querySelector("[data-plan-button-row]") as HTMLElement;
    expect(row.className.split(" ")).toContain("gs-actionrow");
    expect(row.getAttribute("data-default")).toBe("primary");
    expect(r.container.querySelector('[data-slot="destructive"]')!.className).toContain("gs-actionrow__far");
    expect(r.container.querySelector('[data-slot="cancel"]')!.className).not.toContain("gs-actionrow__far");
    expect(document.head.querySelectorAll("style[data-gs-actionrow]")).toHaveLength(1);
  });
  it("record view: Edit primary + Delete destructive renders Delete, Edit", () => {
    const r = render(<PlanButtonRow destructive={<button>Delete</button>} primary={<button>Edit</button>} />);
    expect([...r.container.querySelectorAll("[data-structured] button")].map((b) => b.textContent)).toEqual(["Delete", "Edit"]);
  });
  it("confirm: no far slot, Cancel then primary, Cancel is the default, data-confirm set", () => {
    const r = render(<PlanButtonRow confirm destructive={<button>Ignored</button>} cancel={<button>Cancel</button>} primary={<button>Delete camera</button>} />);
    expect([...r.container.querySelectorAll("[data-structured] button")].map((b) => b.textContent)).toEqual(["Cancel", "Delete camera"]);
    const row = r.container.querySelector("[data-plan-button-row]") as HTMLElement;
    expect(row.hasAttribute("data-confirm")).toBe(true);
    expect(row.getAttribute("data-default")).toBe("cancel");
    expect(r.container.querySelector(".gs-actionrow__far")).toBeNull();
  });
  it("the children API still has no gs-actionrow class (unchanged output)", () => {
    const r = render(<PlanButtonRow>x</PlanButtonRow>);
    expect((r.container.firstElementChild as HTMLElement).className).not.toContain("gs-actionrow");
  });
});
