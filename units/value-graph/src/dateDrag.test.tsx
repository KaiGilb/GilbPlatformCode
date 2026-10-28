/** Drag a point on the Timeline to change its date (and its value); the no-date lane; Alt+arrow keys; the Arrow follows. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph, markerRenders } from "./PlanValueGraph";
import { DAY, isoDay, parseDate, snapDate, formatDay } from "@kaigilb/gilbplatformcode-value-graph-geometry";
import type { LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
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

// Goal A (series 1) 2027-01-01 = 5; Goal B (series 2) 2027-06-30 = 9; Wish undated = 7; Fail dated 2027-03-01 = 12.
const short = mk([
  lv("Goal", 5, { when: "2027-01-01" }),
  lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] }),
  lv("Wish", 7, { conditions: ["c"] }),
  lv("Fail", 12, { when: "2027-03-01", conditions: ["d"] }),
]);
// The same two Goals four years apart: the visible span is above 2 years, so dates snap to a Monday.
const wide = mk([lv("Goal", 5, { when: "2025-01-01" }), lv("Goal", 9, { when: "2029-01-01", conditions: ["b"] })]);

const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };

function mount(data: ValueCardData, onChange = vi.fn()) {
  const r = render(<PlanValueGraph data={data} editing onChangeLevels={onChange} />);
  fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
  const svg = r.container.querySelector("svg")!;
  svg.getBoundingClientRect = () => RECT;
  return { ...r, onChange, svg };
}
const slider = (c: Element, i: number) => c.querySelector(`[role=slider][data-level="${i}"]`)!;
const centre = (el: Element) => {
  const r = el.querySelector("rect[fill=transparent]")!;
  return { x: Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2, y: Number(r.getAttribute("y")) + Number(r.getAttribute("height")) / 2 };
};
/** Pixel <-> date and pixel <-> value maps, read off two dated markers (the axes are linear). */
function maps(c: Element, a: [number, string, number], b: [number, string, number]) {
  const ca = centre(slider(c, a[0]));
  const cb = centre(slider(c, b[0]));
  const ta = parseDate(a[1])!;
  const tb = parseDate(b[1])!;
  const pxPerMs = (cb.x - ca.x) / (tb - ta);
  const pxPerVal = (cb.y - ca.y) / (b[2] - a[2]);
  return {
    xOf: (t: number) => ca.x + (t - ta) * pxPerMs,
    yOf: (v: number) => ca.y + (v - a[2]) * pxPerVal,
  };
}
const drag = (el: Element, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) => {
  fireEvent.pointerDown(el, { clientX: from.x, clientY: from.y, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: to.x, clientY: to.y, pointerId: 1, shiftKey: shift });
  fireEvent.pointerUp(el, { clientX: to.x, clientY: to.y, pointerId: 1, shiftKey: shift });
};
const nextOf = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls[0]![0] as ValueLevel[];
const MAR10 = parseDate("2027-03-10")!;

describe("geometry: snapDate", () => {
  it("snaps to the day; above a 2-year span to the nearest Monday", () => {
    expect(isoDay(snapDate(MAR10 + 0.4 * DAY, 200 * DAY))).toBe("2027-03-10");
    expect(isoDay(snapDate(MAR10 + 0.6 * DAY, 200 * DAY))).toBe("2027-03-11");
    // 2027-03-10 is a Wednesday: the Monday before is the 8th.
    expect(isoDay(snapDate(MAR10, 800 * DAY))).toBe("2027-03-08");
    // Friday the 12th is nearer next Monday the 15th.
    expect(isoDay(snapDate(parseDate("2027-03-12")!, 800 * DAY))).toBe("2027-03-15");
    expect(formatDay(parseDate("2027-06-30")!)).toBe("30 Jun 2027");
    expect(formatDay(parseDate("2027-06-30")!, true)).toBe("30 June 2027");
  });
});

describe("drag on the Timeline", () => {
  it("horizontal drag changes only the date, with one write", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: m.xOf(MAR10), y: a.y + 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = nextOf(onChange);
    expect(next[0]!.qualifier.when).toBe("2027-03-10");
    expect(next[0]!.value).toBe(5);
    next.forEach((l, i) => i !== 0 && expect(l).toBe(short.levels[i]));
  });

  it("vertical drag changes only the value, with one write", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: a.x + 2, y: m.yOf(8) });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = nextOf(onChange);
    expect(next[0]!.value).toBe(8);
    expect(next[0]!.qualifier.when).toBe("2027-01-01");
  });

  it("a diagonal drag locks to its main direction after 6 px; Shift releases the lock and both change", () => {
    const a1 = mount(short);
    const m = maps(a1.container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(a1.container, 0));
    const target = { x: m.xOf(MAR10), y: m.yOf(8) };
    drag(slider(a1.container, 0), a, target); // mostly horizontal: date only
    let next = nextOf(a1.onChange);
    expect(next[0]!.qualifier.when).toBe("2027-03-10");
    expect(next[0]!.value).toBe(5);
    cleanup();
    const b1 = mount(short);
    drag(slider(b1.container, 0), a, target, true); // Shift: both
    next = nextOf(b1.onChange);
    expect(b1.onChange).toHaveBeenCalledTimes(1);
    expect(next[0]!.qualifier.when).toBe("2027-03-10");
    expect(next[0]!.value).toBe(8);
  });

  it("moves under 6 px change nothing (no lock yet): a click opens the popover and writes nothing", () => {
    const { container, onChange } = mount(short);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: a.x + 4, y: a.y + 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
  });

  it("the date snaps to the day", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: m.xOf(MAR10 + 0.3 * DAY), y: a.y });
    expect(nextOf(onChange)[0]!.qualifier.when).toBe("2027-03-10");
  });

  it("the date snaps to a Monday when the visible span is above 2 years", () => {
    const { container, onChange } = mount(wide);
    const m = maps(container, [0, "2025-01-01", 5], [1, "2029-01-01", 9]);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: m.xOf(MAR10), y: a.y });
    expect(nextOf(onChange)[0]!.qualifier.when).toBe("2027-03-08");
  });

  it("the axes do not rescale during a drag, and the tooltip names kind, value, unit and date", () => {
    const { container, svg } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const ticks = () => [...container.querySelectorAll("[data-xtick]")].map((g) => `${g.getAttribute("data-xtick")}@${g.querySelector("line")!.getAttribute("x1")}`);
    const yticks = () => [...container.querySelectorAll('line[data-grid="y"]')].map((l) => l.getAttribute("y1"));
    const before = [ticks(), yticks(), centre(slider(container, 1))];
    const a = centre(slider(container, 0));
    fireEvent.pointerDown(slider(container, 0), { clientX: a.x, clientY: a.y, pointerId: 1 });
    fireEvent.pointerMove(slider(container, 0), { clientX: m.xOf(MAR10), clientY: a.y, pointerId: 1 });
    expect([ticks(), yticks(), centre(slider(container, 1))]).toEqual(before);
    const tip = container.querySelector("[data-drag-tip]")!;
    expect(tip.textContent).toBe("Goal 5 min · 10 Mar 2027");
    // The dragged marker is under the snapped date.
    expect(centre(slider(container, 0)).x).toBeCloseTo(m.xOf(MAR10), 3);
    void svg;
  });

  it("the series line follows the dragged marker", () => {
    // One series with three points; drag the Status marker and read the polyline points.
    const data = mk([lv("Past", 13, { when: "2026-01-01" }), lv("Status", 8, { when: "2026-10-27" }), lv("Goal", 3, { when: "2027-06-30" })]);
    const { container } = mount(data);
    const m = maps(container, [0, "2026-01-01", 13], [2, "2027-06-30", 3]);
    const st = centre(slider(container, 1));
    fireEvent.pointerDown(slider(container, 1), { clientX: st.x, clientY: st.y, pointerId: 1 });
    fireEvent.pointerMove(slider(container, 1), { clientX: st.x + 2, clientY: m.yOf(6), pointerId: 1 });
    const pts = [...container.querySelectorAll("[data-series] polyline")].flatMap((p) => p.getAttribute("points")!.split(" "));
    const moved = pts.filter((p) => Math.abs(Number(p.split(",")[1]) - m.yOf(6)) < 0.01);
    expect(moved.length).toBeGreaterThan(0);
    expect(Math.abs(Number(moved[0]!.split(",")[0]) - centre(slider(container, 1)).x)).toBeLessThan(0.01);
  });

  it("Escape during a drag cancels it with no write", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(container, 0));
    fireEvent.pointerDown(slider(container, 0), { clientX: a.x, clientY: a.y, pointerId: 1 });
    fireEvent.pointerMove(slider(container, 0), { clientX: m.xOf(MAR10), clientY: a.y, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(slider(container, 0), { clientX: m.xOf(MAR10), clientY: a.y, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("[data-drag-tip]")).toBeNull();
    expect(centre(slider(container, 0)).x).toBeCloseTo(a.x, 3);
  });

  it("a Fail line drags vertically (value) and never changes its date", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const f = centre(slider(container, 3));
    drag(slider(container, 3), f, { x: m.xOf(MAR10), y: m.yOf(11) }); // a diagonal that is mostly horizontal
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = nextOf(onChange);
    expect(next[3]!.value).toBe(11);
    expect(next[3]!.qualifier.when).toBe("2027-03-01");
  });
});

describe("the no-date lane", () => {
  it("dragging a dated marker into the lane clears its date; the lane highlights and the tooltip says no date", () => {
    const { container, onChange } = mount(short);
    const a = centre(slider(container, 0));
    const lane = container.querySelector("[data-lane-bg]")!;
    const laneMid = Number(lane.getAttribute("x")) + 28;
    fireEvent.pointerDown(slider(container, 0), { clientX: a.x, clientY: a.y, pointerId: 1 });
    fireEvent.pointerMove(slider(container, 0), { clientX: laneMid, clientY: a.y, pointerId: 1 });
    expect(container.querySelector("[data-lane-bg]")!.hasAttribute("data-lane-active")).toBe(true);
    expect(container.querySelector("[data-drag-tip]")!.textContent).toBe("Goal 5 min · no date");
    fireEvent.pointerUp(slider(container, 0), { clientX: laneMid, clientY: a.y, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = nextOf(onChange);
    expect(next[0]!.qualifier.when).toBe("");
    expect(next[0]!.value).toBe(5);
    expect(container.querySelector("[data-lane-bg]")!.hasAttribute("data-lane-active")).toBe(false);
  });

  it("dragging an undated marker out of the lane into the plot gives it the date where it is dropped", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const w = centre(slider(container, 2));
    drag(slider(container, 2), w, { x: m.xOf(MAR10), y: w.y });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = nextOf(onChange);
    expect(next[2]!.qualifier.when).toBe("2027-03-10");
    expect(next[2]!.value).toBe(7);
  });
});

describe("keyboard", () => {
  const press = (el: Element, key: string, opts: { shift?: boolean } = {}) =>
    fireEvent.keyDown(el, { key, altKey: true, shiftKey: !!opts.shift });

  it("Alt+Right three times then keyup is one write, +3 days", () => {
    const { container, onChange } = mount(short);
    const el = slider(container, 0);
    press(el, "ArrowRight");
    press(el, "ArrowRight");
    press(el, "ArrowRight");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyUp(el, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = nextOf(onChange);
    expect(next[0]!.qualifier.when).toBe("2027-01-04");
    expect(next[0]!.value).toBe(5);
    // Nothing more is written when the idle timer would have run.
    act(() => void vi.advanceTimersByTime(1000));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("Alt+Shift+Left moves 7 days back", () => {
    const { container, onChange } = mount(short);
    const el = slider(container, 0);
    press(el, "ArrowLeft", { shift: true });
    fireEvent.keyUp(el, { key: "ArrowLeft" });
    expect(nextOf(onChange)[0]!.qualifier.when).toBe("2026-12-25");
  });

  it("with no keyup, the step is written once after 400 ms idle", () => {
    const { container, onChange } = mount(short);
    const el = slider(container, 0);
    press(el, "ArrowRight");
    act(() => void vi.advanceTimersByTime(300));
    press(el, "ArrowRight");
    act(() => void vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled(); // the second press restarted the 400 ms
    act(() => void vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(nextOf(onChange)[0]!.qualifier.when).toBe("2027-01-03");
  });

  it("Up and Down still step the value; an undated marker has no date to step", () => {
    const { container, onChange } = mount(short);
    fireEvent.keyDown(slider(container, 0), { key: "ArrowUp" });
    expect(nextOf(onChange)[0]!.value).not.toBe(5);
    onChange.mockClear();
    press(slider(container, 2), "ArrowRight");
    fireEvent.keyUp(slider(container, 2), { key: "ArrowRight" });
    act(() => void vi.advanceTimersByTime(1000));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("aria-valuetext reads kind, value with unit and the date", () => {
    const { container } = mount(short);
    expect(slider(container, 0).getAttribute("aria-valuetext")).toBe("Goal, 5 minutes, 1 January 2027");
    expect(slider(container, 2).getAttribute("aria-valuetext")).toBe("Wish, 7 minutes, no date");
    press(slider(container, 0), "ArrowRight");
    expect(slider(container, 0).getAttribute("aria-valuetext")).toBe("Goal, 5 minutes, 2 January 2027");
  });
});

describe("render budget", () => {
  it("with 200 levels, a Timeline date drag re-renders at most 2 markers per pointermove and writes once", () => {
    const many: ValueLevel[] = Array.from({ length: 200 }, (_, i) =>
      lv("Goal", i + 1, { when: i % 3 ? `2027-${String((i % 12) + 1).padStart(2, "0")}-15` : "", conditions: [`c${i % 20}`] }),
    );
    const { container, onChange } = mount(mk(many));
    const first = container.querySelectorAll("[role=slider]")[50]!;
    expect(container.querySelectorAll("[role=slider]").length).toBe(200);
    const c = centre(first);
    fireEvent.pointerDown(first, { clientX: c.x, clientY: c.y, pointerId: 1 });
    markerRenders.count = 0;
    fireEvent.pointerMove(first, { clientX: c.x + 90, clientY: c.y + 1, pointerId: 1 });
    expect(markerRenders.count).toBeGreaterThan(0);
    expect(markerRenders.count).toBeLessThanOrEqual(2);
    markerRenders.count = 0;
    fireEvent.pointerMove(first, { clientX: c.x + 120, clientY: c.y + 1, pointerId: 1 });
    expect(markerRenders.count).toBeLessThanOrEqual(2);
    fireEvent.pointerUp(first, { clientX: c.x + 120, clientY: c.y + 1, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("the failed write snaps the marker back", () => {
  it("when the parent keeps the old data (a rolled-back write), the marker is back where it was after the drop", () => {
    const { container, onChange } = mount(short);
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: m.xOf(MAR10), y: a.y });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(centre(slider(container, 0)).x).toBeCloseTo(a.x, 3);
  });
});

describe("the Arrow follows a Timeline date change", () => {
  it("both Goals are one set, so one Arrow row before and after; the dragged Goal shows its new date on its marker", () => {
    const data = mk([lv("Goal", 5, { when: "2027-01-01" }), lv("Goal", 9, { when: "2027-06-30" })]);
    const onChange = vi.fn();
    const { container, rerender } = render(<PlanValueGraph data={data} editing onChangeLevels={onChange} />);
    // Before: one row (the set), holding both Goals, each with its own date.
    expect(container.querySelectorAll("[data-row]").length).toBe(1);
    expect(container.querySelector('[data-row="0"] [data-level="0"]')).not.toBeNull();
    expect(container.querySelector('[data-row="0"] [data-level="1"]')).not.toBeNull();
    expect(container.querySelector('[data-row="0"] [data-level="0"]')!.textContent).toContain("2027-01-01");
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    const m = maps(container, [0, "2027-01-01", 5], [1, "2027-06-30", 9]);
    const a = centre(slider(container, 0));
    drag(slider(container, 0), a, { x: m.xOf(parseDate("2027-06-30")!), y: a.y });
    const next = nextOf(onChange);
    expect(next[0]!.qualifier.when).toBe("2027-06-30");
    rerender(<PlanValueGraph data={{ ...data, levels: next }} editing onChangeLevels={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Arrow" }));
    const rows = container.querySelectorAll("[data-row]");
    expect(rows.length).toBe(1);
    expect(rows[0]!.querySelector('[data-level="0"]')).not.toBeNull();
    expect(rows[0]!.querySelector('[data-level="1"]')).not.toBeNull();
    expect(rows[0]!.querySelector('[data-level="0"]')!.textContent).toContain("2027-06-30");
    expect(rows[0]!.textContent).not.toContain("2027-01-01");
  });
});
