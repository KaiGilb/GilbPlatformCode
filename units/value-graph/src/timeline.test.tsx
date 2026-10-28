/** The Timeline is a real chart: date x axis, unit y axis, one line per qualifier set, a no-date lane, a legend that highlights. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph, markerRenders } from "./PlanValueGraph";
import type { LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const lv = (kind: string, value: number, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});
const mk = (levels: ValueLevel[]): ValueCardData => ({
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "", direction: "lower", source: {} },
  variables: [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels,
});

const novice = { Release: "3.0", "User type": "Novice" };
const senior = { Release: "3.0", "User type": "Senior 70+" };
const norway = { Country: ["Norway", "Sweden"] };
const example = mk([
  lv("Past", 13, { when: "2025-10-01", variables: novice }),
  lv("Status", 5.8, { when: "2026-10-27", variables: novice }),
  lv("Tolerable", 10, { when: "2027-06-30", variables: novice }),
  lv("Goal", 5.2, { when: "2027-06-30", variables: novice }),
  lv("Tolerable", 14.6, { when: "2027-06-30", variables: senior }),
  lv("Goal", 1.2, { when: "2027-06-30", variables: senior }),
  lv("Wish", 4.2, { variables: norway }),
  lv("Wish", 1.4, { when: "2029-01-27", variables: novice }),
  lv("Fail", 20, { variables: novice }),
]);

const timeline = (data: ValueCardData, editing = false) => {
  const r = render(<PlanValueGraph data={data} editing={editing} onChangeLevels={() => {}} />);
  fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
  return r;
};
const pts = (el: Element) =>
  el.getAttribute("points")!.split(" ").map((p) => p.split(",").map(Number) as [number, number]);

describe("Timeline chart (the example)", () => {
  it("has date ticks on the x axis, value ticks and the unit on the y axis, gridlines and a today line", () => {
    const { container } = timeline(example);
    const labels = [...container.querySelectorAll("[data-xtick]")].map((g) => g.getAttribute("data-xtick"));
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels).toEqual(expect.arrayContaining(["2027"]));
    expect(container.querySelectorAll('line[data-grid="x"]').length).toBe(labels.length);
    expect(container.querySelectorAll('line[data-grid="y"]').length).toBeGreaterThan(2);
    for (const g of container.querySelectorAll("line[data-grid]")) {
      expect(g.getAttribute("stroke")).toBe("#e5e7eb");
      expect(g.getAttribute("stroke-width")).toBe("1");
    }
    expect(container.querySelector('line[data-axis="y"]')).not.toBeNull();
    expect(container.querySelector("[data-axis-unit]")!.textContent).toBe("min");
    expect(container.textContent).toContain("better ↑");
    const today = container.querySelector("[data-today]")!;
    expect(today.querySelector("text")!.textContent).toBe("today");
    expect(today.querySelector("line")!.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  it("draws no today line when today is outside the range", () => {
    const far = mk([lv("Goal", 5, { when: "2031-01-01" }), lv("Wish", 2, { when: "2032-01-01" })]);
    const { container } = timeline(far);
    expect(container.querySelector("[data-today]")).toBeNull();
  });

  it("each series has a solid line to its Status and a dashed line after it, points in date order", () => {
    const { container } = timeline(example);
    const s0 = container.querySelector('[data-series="0"]')!;
    const solid = s0.querySelector('polyline[data-line="solid"]')!;
    const planned = s0.querySelector('polyline[data-line="planned"]')!;
    expect(solid.getAttribute("stroke-dasharray")).toBeNull();
    expect(planned.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(solid.getAttribute("stroke-width")).toBe("2.5");
    expect(solid.getAttribute("stroke")).toBe(planned.getAttribute("stroke"));
    const a = pts(solid);
    const b = pts(planned);
    expect(a.length).toBe(2); // Past, Status
    expect(b.length).toBe(3); // Status, Goal, Wish 2029 (Status 5.8 is better than Tolerable 10, lower is better: no Tolerable)
    expect(a[1]).toEqual(b[0]); // the dashed part starts where the solid part stops
    const xs = [...a, ...b.slice(1)].map((p) => p[0]);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
    // Goal 5.2 (2027-06-30) then Wish 1.4 (2029): to the right
    expect(b[1]![0]).toBeLessThan(b[2]![0]);
  });

  it("a series with no Status or Past is all dashed", () => {
    const { container } = timeline(example);
    const s1 = container.querySelector('[data-series="1"]')!;
    expect(s1.querySelector('polyline[data-line="solid"]')).toBeNull();
    expect(s1.querySelector('polyline[data-line="planned"]')).not.toBeNull();
  });

  it("Goal is joined to the line; a Tolerable only when it is on the path", () => {
    const { container } = timeline(example);
    const total = [...container.querySelectorAll("polyline")].map((p) => pts(p).length);
    expect(total.reduce((x, y) => x + y, 0)).toBe(2 + 3 + 2); // Novice 2+3 (no Tolerable), senior 2 (no Status: Tolerable, Goal)
  });

  it("Fail is a red dashed horizontal line labelled at the right end, not on a polyline; its marker stays", () => {
    const { container } = timeline(example);
    const fail = container.querySelector('[data-limit="Fail"]')!;
    const line = fail.querySelector("line")!;
    expect(line.getAttribute("stroke")).toBe("#dc2626");
    expect(line.getAttribute("stroke-width")).toBe("1.5");
    expect(line.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(line.getAttribute("opacity")).toBe("0.4");
    expect(line.getAttribute("y1")).toBe(line.getAttribute("y2"));
    expect(fail.querySelector("text")!.textContent).toBe("Fail 20");
    expect(fail.querySelector("text")!.getAttribute("text-anchor")).toBe("end");
    expect(container.querySelector('[role=slider][aria-label^="Fail"]')).not.toBeNull();
  });

  it("undated levels sit in the 56px no-date lane at 60% opacity and are not on a line; no text list remains", () => {
    const { container } = timeline(example);
    const lane = container.querySelector("[data-lane-bg]")!;
    expect(lane.getAttribute("width")).toBe("56");
    expect(lane.getAttribute("fill")).toBe("#f3f4f6");
    expect(container.textContent).toContain("no date");
    expect(container.textContent).not.toContain("no date:");
    const laneX = Number(lane.getAttribute("x"));
    const inLane = [...container.querySelectorAll("[role=slider][data-lane]")];
    expect(inLane.map((s) => s.getAttribute("aria-label")!.split(",")[0]).sort()).toEqual(["Fail", "Wish"]);
    for (const s of inLane) {
      const r = s.querySelector("rect[fill=transparent]")!;
      const cx = Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2;
      expect(cx).toBeGreaterThanOrEqual(laneX);
      expect(cx).toBeLessThanOrEqual(laneX + 56);
      expect(s.getAttribute("opacity")).toBe("0.6");
    }
  });

  it("an undated level still drags vertically and writes once", () => {
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={example} editing onChangeLevels={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const svg = container.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) });
    const wish = container.querySelector('[data-lane][aria-label^="Wish"]')!;
    fireEvent.pointerDown(wish, { clientX: 580, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(wish, { clientX: 580, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(wish, { clientX: 580, clientY: 200, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ValueLevel[];
    expect(next[6]!.value).not.toBe(4.2);
    expect(next[6]!.qualifier.when).toBe("");
    next.forEach((l, i) => {
      if (i !== 6) expect(l).toEqual(example.levels[i]);
    });
  });

  it("the legend colour equals the line colour; a click highlights one series, again clears it", () => {
    const { container } = timeline(example);
    const buttons = [...container.querySelectorAll("button[data-legend]")] as HTMLElement[];
    expect(buttons.length).toBe(3);
    const line0 = container.querySelector('[data-series="0"] polyline')!.getAttribute("stroke")!;
    const dot0 = (buttons[0]!.querySelector("[data-legend-dot]") as HTMLElement).style.color;
    const probe = document.createElement("span");
    probe.style.color = line0;
    expect(dot0).toBe(probe.style.color);
    for (const b of buttons) expect(b.getAttribute("aria-pressed")).toBe("false");
    const op = (n: number) => container.querySelector(`[data-series="${n}"]`)!.getAttribute("opacity");
    fireEvent.click(buttons[1]!);
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
    expect([op(0), op(1), op(2)]).toEqual(["0.25", "1", "0.25"]);
    // markers of the other series dim too (Past is series 0)
    expect(container.querySelector('[role=slider][aria-label^="Past"]')!.getAttribute("opacity")).toBe("0.25");
    expect(container.querySelector('[role=slider][aria-label^="Goal, Release 3.0 · User type = Senior"]')?.getAttribute("opacity") ?? "1").toBe("1");
    fireEvent.click(buttons[1]!);
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("false");
    expect([op(0), op(1), op(2)]).toEqual(["1", "1", "1"]);
  });
});

describe("Timeline render budget", () => {
  it("with 200 levels one pointermove re-renders at most 2 markers", () => {
    const many: ValueLevel[] = Array.from({ length: 200 }, (_, i) =>
      lv("Goal", i + 1, { when: i % 3 ? `2027-${String((i % 12) + 1).padStart(2, "0")}-15` : "", conditions: [`c${i % 20}`] }),
    );
    const { container } = render(<PlanValueGraph data={mk(many)} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const svg = container.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) });
    const sliders = container.querySelectorAll("[role=slider]");
    expect(sliders.length).toBe(200);
    const first = sliders[50]!;
    fireEvent.pointerDown(first, { clientX: 100, clientY: 100, pointerId: 1 });
    markerRenders.count = 0;
    fireEvent.pointerMove(first, { clientX: 100, clientY: 160, pointerId: 1 });
    expect(markerRenders.count).toBeGreaterThan(0);
    expect(markerRenders.count).toBeLessThanOrEqual(2);
  });
});
