import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import { buildAxis, snapStep, staggerRows, textWidth } from "@kaigilb/gilbplatformcode-value-graph-geometry";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

afterEach(cleanup);

const lv = (kind: string, value: number, when: string, conditions: string[], variables: Record<string, string> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when, variables, conditions, side: "" },
  source: {},
  note: "",
});

const data: ValueCardData = {
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "in [Country]", direction: "lower", source: {} },
  variables: [
    { name: "User type", definition: "", defaultOption: "Novice", options: [], source: {} },
    { name: "Task", definition: "", defaultOption: "Order.Place", options: [], source: {} },
    { name: "Device", definition: "", defaultOption: "Mobile", options: [], source: {} },
  ],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels: [
    lv("Past", 14, "2025-10-01", ["Release 1.0"]),
    lv("Status", 9, "2026-10-27", ["Release 2.3"]),
    lv("Tolerable", 10, "2027-06-30", ["Release 3.0"]),
    lv("Goal", 3, "2027-06-30", ["Release 3.0"]),
    lv("Wish", 1, "2027-06-30", ["Release 3.0"]),
    lv("Tolerable", 15, "2027-06-30", ["Release 3.0"], { "User type": "Senior 70+" }),
    lv("Goal", 5, "2027-06-30", ["Release 3.0"], { "User type": "Senior 70+" }),
  ],
};

describe("PlanValueGraph", () => {
  it("axis never goes below 0 when all values are non-negative", () => {
    expect(buildAxis([1, 3, 14], "lower", 0, 100).min).toBe(0);
  });

  it("draws one row per qualifier set (Release 1.0, 2.3, 3.0 and the Senior set are four) and ArrowRight moves a lower-is-better Goal one step better", () => {
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={data} editing onChangeLevels={onChange} />);
    expect(container.querySelectorAll("[data-row]").length).toBe(4);
    const kindsOf = (r: number) => [...container.querySelector(`[data-row="${r}"]`)!.querySelectorAll("[role=slider]")].map((e) => e.getAttribute("aria-label")!.split(",")[0]);
    expect(kindsOf(0)).toEqual(["Past"]);
    expect(kindsOf(1)).toEqual(["Status"]);
    expect(kindsOf(2)).toEqual(["Tolerable", "Goal", "Wish"]);
    expect(kindsOf(3)).toEqual(["Tolerable", "Goal"]);
    const goal = screen.getAllByRole("slider").find((s) => s.getAttribute("aria-label")?.startsWith("Goal"))!;
    fireEvent.keyDown(goal, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ValueLevel[];
    expect(next[3].value).toBe(2);
    next.forEach((l, i) => {
      if (i !== 3) expect(l).toEqual(data.levels[i]);
    });
  });

  it("round-trips value to pixel to value within half a step", () => {
    const axis = buildAxis([1, 3, 5, 9, 14, 15], "lower", 28, 612);
    const step = snapStep(axis, false);
    for (const v of [1, 3.3, 9, 14.7]) {
      expect(Math.abs(axis.fromPx(axis.toPx(v)) - v)).toBeLessThanOrEqual(step / 2);
    }
  });
});

describe("label stagger", () => {
  it("puts Tolerable (10) and Status (9.5) on different label rows", () => {
    const axis = buildAxis([0, 18], "lower", 20, 600);
    const rows = staggerRows([
      { x: axis.toPx(10), w: textWidth("Tolerable", 10) },
      { x: axis.toPx(9.5), w: textWidth("Status", 10) },
    ]);
    expect(rows[0]).not.toBe(rows[1]);
    expect(Math.max(...rows)).toBeLessThanOrEqual(2);
  });
});

describe("PlanValueGraph qualifier filter", () => {
  it("filtering Country = Norway hides a Sweden row and keeps ALL and unset rows", () => {
    const withCountry: ValueCardData = {
      ...data,
      variables: [{ name: "Country", definition: "", defaultOption: "", options: [{ name: "Norway", definition: "" }, { name: "Sweden", definition: "" }], source: {} }],
      levels: [
        lv("Goal", 3, "", [], { Country: "Norway" }),
        lv("Goal", 4, "", [], { Country: "Sweden" }),
        lv("Goal", 5, "", [], { Country: "ALL" }),
        lv("Status", 9, "", []),
      ],
    };
    const { container } = render(<PlanValueGraph data={withCountry} editing={false} onChangeLevels={() => {}} />);
    const count = () => container.querySelectorAll("[data-level]").length;
    const before = count();
    expect(before).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Show Country" }));
    fireEvent.click(screen.getByLabelText("Show Country Norway"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(count()).toBe(before - 1);
    expect(container.querySelector('[aria-label*="Sweden"]')).toBeNull();
    expect(container.querySelector('[aria-label*="Norway"]')).not.toBeNull();
  });
});

describe("PlanValueGraph each level drawn once", () => {
  const base: ValueCardData = {
    ...data,
    levels: [
      lv("Past", 14, "2025-10-01", [], { "User type": "Novice" }),
      lv("Status", 9, "2026-10-27", [], { "User type": "Novice" }),
      lv("Goal", 3, "2027-06-30", []),
      lv("Goal", 5, "2027-06-30", [], { "User type": "Senior 70+" }),
    ],
  };

  it("Past/Status with User type Novice sit on the Novice row only; Senior row has no Status (the + New menu offers it)", () => {
    const { container } = render(<PlanValueGraph data={base} editing onChangeLevels={() => {}} />);
    expect(container.querySelectorAll("[data-row]").length).toBe(2);
    expect(container.querySelectorAll('[data-level="0"]').length).toBe(1);
    expect(container.querySelectorAll('[data-level="1"]').length).toBe(1);
    expect(container.querySelector('[data-row="0"] [data-level="1"]')).not.toBeNull();
    const row2 = container.querySelector('[data-row="1"]')!;
    expect(row2.querySelector("[data-level=\"1\"]")).toBeNull();
    // The in-row "+ Status / + Past" hints are gone; the "+ New" menu says the Senior set has no Status.
    expect(row2.querySelectorAll("button").length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    const senior = document.querySelector('[data-newmenu-set="1"]')!;
    expect(senior.querySelector('[data-kind-btn="Status"] [data-has-one]')).toBeNull();
    expect(senior.querySelector('[data-kind-btn="Status"]')!.textContent).toBe("Status");
  });

  it("Status from the + New menu (Senior set) creates nothing until picked, then one level on the Senior row", () => {
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={base} editing onChangeLevels={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-newmenu-set="1"] [data-kind-btn="Status"]')!);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ValueLevel[];
    expect(next.length).toBe(5);
    expect(next[4].kind).toBe("Status");
    expect(next[4].qualifier.variables).toEqual({ "User type": "Senior 70+" });
    expect(container.querySelectorAll("[data-row]").length).toBe(2);
  });

  it("two Status levels each sit on their own row; ArrowRight on Senior's changes only it", () => {
    const two: ValueCardData = {
      ...data,
      levels: [
        lv("Status", 9, "2026-10-27", [], { "User type": "Novice" }),
        lv("Status", 12, "2026-10-27", [], { "User type": "Senior 70+" }),
        lv("Goal", 3, "2027-06-30", [], { "User type": "Novice" }),
        lv("Goal", 5, "2027-06-30", [], { "User type": "Senior 70+" }),
      ],
    };
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={two} editing onChangeLevels={onChange} />);
    expect(container.querySelector('[data-row="0"] [data-level="0"]')).not.toBeNull();
    expect(container.querySelector('[data-row="0"] [data-level="1"]')).toBeNull();
    const senior = container.querySelector('[data-row="1"] [data-level="1"]')!;
    fireEvent.keyDown(senior, { key: "ArrowRight" });
    const next = onChange.mock.calls[0][0] as ValueLevel[];
    const changed = next.map((l, i) => (l === two.levels[i] ? -1 : i)).filter((i) => i >= 0);
    expect(changed).toEqual([1]);
    expect(next[1].value).not.toBe(12);
  });
});

describe("a pointermove does not re-render every marker", () => {
  it("with 200 levels one pointermove re-renders at most 2 markers", async () => {
    const { markerRenders } = await import("./PlanValueGraph");
    const many: ValueLevel[] = Array.from({ length: 200 }, (_, i) => lv("Goal", i + 1, "", [`c${i}`]));
    const big: ValueCardData = { ...data, levels: many };
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={big} editing onChangeLevels={onChange} />);
    const svg = container.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 300, width: 640, height: 300, x: 0, y: 0, toJSON: () => ({}) });
    const sliders = container.querySelectorAll("[role=slider]");
    expect(sliders.length).toBe(200);
    const first = sliders[50]!;
    fireEvent.pointerDown(first, { clientX: 100, clientY: 20, pointerId: 1 });
    markerRenders.count = 0;
    fireEvent.pointerMove(first, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(markerRenders.count).toBeGreaterThan(0);
    expect(markerRenders.count).toBeLessThanOrEqual(2);
    fireEvent.pointerUp(first, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
