// Pins for every export of the geometry that the ported cases do not reach.
// The code wins: where a result looks odd it is pinned as it is.
import { describe, expect, it } from "vitest";
import * as dateRules from "@kaigilb/gilbplatformcode-date-rules";
import { blankLevel, blankVariable, emptyValueCard } from "@kaigilb/gilbplatformcode-value-card-model";
import {
  BAND_GREEN,
  BAND_RED,
  BAND_YELLOW,
  DAY,
  MARKER,
  MAX_YEAR,
  MIN_YEAR,
  WEEK_SNAP_SPAN,
  YEAR_RANGE_SENTENCE,
  allWhole,
  buildAxis,
  currentValues,
  dateAxis,
  dateRange,
  fmt,
  formatDay,
  groupKey,
  groupLabel,
  groupLevels,
  isLimitKind,
  isWorseThanTolerable,
  isoDay,
  markerHalf,
  niceDateTicks,
  niceStep,
  parseDate,
  roundTo,
  seriesPath,
  snapDate,
  snapStep,
  snapValue,
  staggerRows,
  textWidth,
  yearOutOfRange,
} from "./index";
import * as api from "./index";

describe("the year rule is the date-rules peer's", () => {
  it("the same constants and the same function", () => {
    expect(MIN_YEAR).toBe(1900);
    expect(MAX_YEAR).toBe(2200);
    expect(YEAR_RANGE_SENTENCE).toBe("Year must be 1900–2200");
    expect(MIN_YEAR).toBe(dateRules.MIN_YEAR);
    expect(MAX_YEAR).toBe(dateRules.MAX_YEAR);
    expect(YEAR_RANGE_SENTENCE).toBe(dateRules.YEAR_RANGE_SENTENCE);
    expect(yearOutOfRange).toBe(dateRules.yearOutOfRange);
  });
  it("yearOutOfRange looks at the first four digits only", () => {
    expect(["1899-12-31", "1900", "2200-12-31", "2201", "  0202-01-01", "abc", "12345", ""].map(yearOutOfRange)).toEqual([true, false, false, true, true, false, true, false]);
  });
});

describe("markers", () => {
  it("MARKER holds the sizes", () => {
    expect(MARKER).toEqual({
      hit: 44,
      status: { r: 12, half: 12 },
      past: { r: 11, stroke: 3, half: 12.5 },
      goal: { w: 10, h: 34, half: 17 },
      bar: { w: 8, h: 30, half: 15 },
      wish: { outer: 15.3, inner: 6.8, half: 15.3 },
      other: { side: 18, half: 12.8 },
      gap: 4,
    });
  });
  it("markerHalf is the half-height of a kind, without case; any other word is a diamond", () => {
    expect(["Status", "past", "GOAL", "Tolerable", "fail", "Survival", "Wish", "Budget", ""].map((k) => markerHalf(k))).toEqual([12, 12.5, 17, 15, 15, 15, 15.3, 12.8, 12.8]);
  });
});

describe("qualifier sets", () => {
  const data = { ...emptyValueCard(), variables: [{ ...blankVariable("Country"), defaultOption: "Norway" }, { ...blankVariable("Task"), defaultOption: "" }] };
  const lv = (variables: Record<string, string | string[]>, conditions: string[] = [], side: "" | "low" | "high" = "") => ({
    ...blankLevel("Goal"),
    qualifier: { when: "2027-01-01", variables, conditions, side },
  });
  it("groupKey fills in defaults, sorts a set's values and the conditions, folds case, and never holds the date", () => {
    expect(groupKey(data, lv({}))).toBe('[[["Country","Norway"]],[],""]');
    expect(groupKey(data, lv({ Country: "Sweden" }))).toBe('[[["Country","Sweden"]],[],""]');
    expect(groupKey(data, lv({ Country: ["b", "a"] }))).toBe('[[["Country","{a, b}"]],[],""]');
    expect(groupKey(data, lv({}, [" B ", "a", ""]))).toBe(groupKey(data, lv({}, ["a", "B"])));
    expect(groupKey(data, lv({}, ["a", "B"]))).toBe('[[["Country","Norway"]],["a","b"],""]');
    expect(groupKey(data, lv({}, [], "low"))).toBe('[[["Country","Norway"]],[],"low"]');
    expect(groupKey(emptyValueCard(), lv({ Z: "1", A: "2" }))).toBe('[[["A","2"],["Z","1"]],[],""]');
    expect(groupKey(data, { ...lv({}), qualifier: { ...lv({}).qualifier, when: "2030-05-05" } })).toBe(groupKey(data, lv({})));
  });
  it("groupLabel shows only what the level sets itself, its conditions and its side", () => {
    expect(groupLabel(data, lv({}))).toBe("no qualifier");
    expect(groupLabel(data, lv({ Country: "Sweden" }))).toBe("Country = Sweden");
    expect(groupLabel(data, lv({ Country: ["b", "a"] }))).toBe("Country = {b, a}");
    expect(groupLabel(data, lv({ Country: ["only"] }))).toBe("Country = only");
    expect(groupLabel(data, lv({ Country: [] }))).toBe("no qualifier");
    expect(groupLabel(data, lv({}, ["Release 3"], "high"))).toBe("Release 3 · high side");
    expect(groupLabel(data, lv({ Task: "Order" }, ["c"], "low"))).toBe("Task = Order · c · low side");
  });
  it("groupLevels: sets in order of first appearance, each with the indexes of its levels", () => {
    const d = { ...data, levels: [lv({ Country: "Sweden" }), lv({}), lv({ Country: "Sweden" }), { ...lv({ Country: "Norway" }) }] };
    const sets = groupLevels(d);
    expect(sets.map((s) => [s.label, s.indexes])).toEqual([
      ["Country = Sweden", [0, 2]],
      ["no qualifier", [1, 3]],
    ]);
    expect(sets[0]!.key).toBe(groupKey(d, d.levels[0]!));
    expect(groupLevels(emptyValueCard())).toEqual([]);
  });
});

describe("the value axis", () => {
  it("niceStep: a 1, 2, 5 x 10^n step for about `target` ticks; no span gives 1", () => {
    expect([niceStep(100), niceStep(100, 10), niceStep(0), niceStep(-5), niceStep(Number.NaN), niceStep(7), niceStep(0.3), niceStep(1000, 4), niceStep(1)]).toEqual([20, 10, 1, 1, 1, 1, 0.05, 200, 0.2]);
  });
  it("roundTo rounds to a step and keeps the step's decimals", () => {
    expect([roundTo(1.234, 0.1), roundTo(123, 10), roundTo(0.15, 0.01), roundTo(2.5, 1), roundTo(-1.26, 0.5)]).toEqual([1.2, 120, 0.15, 3, -1.5]);
  });
  it("fmt: at most six decimals, no trailing zeros", () => {
    expect([fmt(1.23456789), fmt(5), fmt(0.1 + 0.2), fmt(-0), fmt(1e-9)]).toEqual(["1.234568", "5", "0.3", "0", "0"]);
  });
  it("buildAxis pads 10%, rounds to the tick step and maps to pixels both ways", () => {
    const a = buildAxis([0, 100], "higher", 0, 1000);
    expect([a.min, a.max, a.tickStep, a.flip, a.p0, a.p1]).toEqual([0, 120, 20, false, 0, 1000]);
    expect(a.ticks).toEqual([0, 20, 40, 60, 80, 100, 120]);
    expect(a.toPx(50)).toBeCloseTo(416.6667, 3);
    expect(a.fromPx(500)).toBe(60);
    expect(a.fromPx(-50)).toBe(0);
    expect(a.fromPx(5000)).toBe(120);
    expect(a.toPx(Infinity)).toBe(1000);
    expect(a.toPx(-Infinity)).toBe(0);
  });
  it("buildAxis: lower flips; flip can be forced; one value is padded by half of itself; negatives stay negative", () => {
    const b = buildAxis([10, 10], "lower", 100, 0);
    expect([b.min, b.max, b.flip, b.toPx(10)]).toEqual([4, 16, true, 50]);
    expect(buildAxis([5, 15], "higher", 0, 100, true).flip).toBe(true);
    expect(buildAxis([5, 15], "lower", 0, 100, false).flip).toBe(false);
    const n = buildAxis([-10, -2], "higher", 0, 100);
    expect(n.min).toBe(-12);
    expect(Object.is(n.max, -0)).toBe(true); // the top is negative zero
    const zero = buildAxis([0], "higher", 0, 100);
    expect([zero.min, zero.max, zero.tickStep]).toEqual([0, 0.5, 0.1]);
    const none = buildAxis([], "target", 0, 100);
    expect([none.min, none.tickStep, none.flip]).toEqual([0, 0.2, false]);
    expect(none.max).toBeCloseTo(1.2, 10);
  });
  it("buildAxis: a zero-length pixel span maps every pixel to the start", () => {
    const c = buildAxis([0, 10], "higher", 50, 50);
    expect([c.fromPx(50), c.fromPx(70)]).toEqual([0, 12]);
  });
  it("allWhole: true when every set value is a whole number (null values do not count)", () => {
    const d = { ...emptyValueCard(), levels: [{ ...blankLevel("Goal"), value: 5 }, { ...blankLevel("Wish"), value: null }] };
    expect(allWhole(d)).toBe(true);
    expect(allWhole({ ...d, levels: [...d.levels, { ...blankLevel("Wish"), value: 2.5 }] })).toBe(false);
    expect(allWhole(emptyValueCard())).toBe(true);
  });
  it("snapStep and snapValue: tick step / 10, or 1 when every value is whole; clamped to the axis", () => {
    const a = buildAxis([0, 100], "higher", 0, 1000);
    expect([snapStep(a, true), snapStep(a, false)]).toEqual([1, 2]);
    expect([snapValue(a, 33.3, false), snapValue(a, 33.7, true), snapValue(a, -5, false), snapValue(a, 150, true), snapValue(a, 33.34, false)]).toEqual([34, 34, 0, 120, 34]);
  });
});

describe("dates", () => {
  it("DAY and WEEK_SNAP_SPAN", () => {
    expect(DAY).toBe(86_400_000);
    expect(WEEK_SNAP_SPAN).toBe(2 * 365 * DAY);
  });
  it("parseDate: YYYY, YYYY-MM and YYYY-MM-DD in 1900..2200 as UTC midnight; trims; anything else is null", () => {
    expect(parseDate("2026-10-27")).toBe(Date.UTC(2026, 9, 27));
    expect(parseDate("2026-10")).toBe(Date.UTC(2026, 9, 1));
    expect(parseDate("2026")).toBe(Date.UTC(2026, 0, 1));
    expect(parseDate(" 2026-10-27 ")).toBe(Date.UTC(2026, 9, 27));
    expect(parseDate("1900")).toBe(Date.UTC(1900, 0, 1));
    expect(parseDate("2200")).toBe(Date.UTC(2200, 0, 1));
    expect(parseDate("2024-02-29")).toBe(Date.UTC(2024, 1, 29));
    for (const bad of ["1899", "2201", "0202", "2026-02-29", "2026-00-10", "2026-10-00", "2026-10-32", "", "junk", "2026-10-27 10:00"]) expect(parseDate(bad), bad).toBeNull();
    expect(parseDate(undefined as never)).toBeNull();
    expect(parseDate(null as never)).toBeNull();
  });
  it("dateRange: a degenerate list and a non-finite date are left out", () => {
    const today = Date.UTC(2026, 9, 27);
    expect(dateRange([Number.NaN], today)).toEqual(dateRange([], today));
  });
  it("niceDateTicks: fewer than two ticks allowed counts as two; a day step is labelled like 27 Oct", () => {
    const ticks = niceDateTicks(Date.UTC(2026, 9, 20), Date.UTC(2026, 9, 30), 0);
    expect(ticks.length).toBeLessThanOrEqual(2);
    expect(niceDateTicks(Date.UTC(2026, 9, 20), Date.UTC(2026, 9, 30), 6).map((t) => t.label)).toEqual(["20 Oct", "22 Oct", "24 Oct", "26 Oct", "28 Oct", "30 Oct"]);
  });
  it("dateAxis: a zero-width range maps without dividing by zero", () => {
    const a = dateAxis(1000, 1000, 0, 100);
    expect(a.toPx(1000)).toBe(0);
    expect(a.fromPx(50)).toBe(1000 + 0.5);
    expect([a.min, a.max, a.x0, a.x1]).toEqual([1000, 1000, 0, 100]);
  });
  it("snapDate: to the day within 2 years; to the nearest Monday above it", () => {
    expect(snapDate(Date.UTC(2026, 9, 27, 13), 100 * DAY)).toBe(Date.UTC(2026, 9, 28));
    expect(snapDate(Date.UTC(2026, 9, 27, 11), 100 * DAY)).toBe(Date.UTC(2026, 9, 27));
    expect(snapDate(Date.UTC(2026, 9, 27), WEEK_SNAP_SPAN)).toBe(Date.UTC(2026, 9, 27));
    const wide = 3 * 365 * DAY;
    expect(isoDay(snapDate(Date.UTC(2026, 9, 28), wide))).toBe("2026-10-26");
    expect(isoDay(snapDate(Date.UTC(2026, 9, 30), wide))).toBe("2026-11-02");
    expect(isoDay(snapDate(Date.UTC(2026, 9, 26), wide))).toBe("2026-10-26");
    expect(new Date(snapDate(Date.UTC(2026, 9, 30), wide)).getUTCDay()).toBe(1);
  });
  it("isoDay: the UTC day as YYYY-MM-DD", () => {
    expect(isoDay(Date.UTC(2026, 9, 27, 23, 59))).toBe("2026-10-27");
    expect(isoDay(0)).toBe("1970-01-01");
    expect(isoDay(Date.UTC(2200, 0, 1))).toBe("2200-01-01");
  });
  it("formatDay: fixed English names for the UTC day, short or long", () => {
    expect(formatDay(Date.UTC(2027, 5, 30))).toBe("30 Jun 2027");
    expect(formatDay(Date.UTC(2027, 5, 30), true)).toBe("30 June 2027");
    expect(formatDay(Date.UTC(2027, 0, 1, 23, 59))).toBe("1 Jan 2027");
    expect(formatDay(Date.UTC(2026, 11, 31))).toBe("31 Dec 2026");
    expect(formatDay(Date.UTC(2026, 11, 31), true)).toBe("31 December 2026");
    expect(formatDay(Date.UTC(2026, 4, 5), true)).toBe("5 May 2026");
  });
});

describe("series and bands", () => {
  it("isLimitKind: Fail and Survival, without case", () => {
    expect(["Fail", "survival", "SURVIVAL", "Goal", ""].map(isLimitKind)).toEqual([true, true, true, false, false]);
  });
  it("isWorseThanTolerable: higher, lower and target", () => {
    expect(isWorseThanTolerable("higher", 5, [10])).toBe(true);
    expect(isWorseThanTolerable("higher", 10, [10])).toBe(false);
    expect(isWorseThanTolerable("lower", 11, [10])).toBe(true);
    expect(isWorseThanTolerable("lower", 9, [10])).toBe(false);
    expect(isWorseThanTolerable("higher", 5, [])).toBe(false);
    expect(isWorseThanTolerable("higher", 5, [Number.NaN])).toBe(false);
    expect(isWorseThanTolerable("higher", 5, [10, 1])).toBe(true);
    expect(isWorseThanTolerable("target", 1, [4, 8])).toBe(true);
    expect(isWorseThanTolerable("target", 9, [4, 8])).toBe(true);
    expect(isWorseThanTolerable("target", 5, [4, 8])).toBe(false);
  });
  it("isWorseThanTolerable, target with one Tolerable: the far side of it from the Goal; no Goal is not worse", () => {
    expect(isWorseThanTolerable("target", 1, [4], [8])).toBe(true);
    expect(isWorseThanTolerable("target", 9, [4], [8])).toBe(false);
    expect(isWorseThanTolerable("target", 1, [8], [4])).toBe(false);
    expect(isWorseThanTolerable("target", 9, [8], [4])).toBe(true);
    expect(isWorseThanTolerable("target", 1, [4])).toBe(false);
    expect(isWorseThanTolerable("target", 1, [4], [4])).toBe(false);
  });
  it("seriesPath: Fail, Survival and undated levels are off the line; an empty index list is an empty path", () => {
    const lv = [
      { kind: "Fail", t: parseDate("2027-01-01"), v: 1 },
      { kind: "Budget", t: parseDate("2027-01-01"), v: 2 },
      { kind: "Goal", t: null, v: 3 },
      { kind: "Goal", t: parseDate("2027-01-01"), v: null },
    ];
    expect(seriesPath(lv, [0, 1, 2, 3])).toEqual({ order: [], split: -1 });
    expect(seriesPath(lv, [])).toEqual({ order: [], split: -1 });
  });
  it("staggerRows: a mark whose label overlaps an earlier one goes to the next row, at most maxRows", () => {
    expect(staggerRows([{ x: 100, w: 50 }, { x: 120, w: 50 }, { x: 140, w: 50 }, { x: 160, w: 50 }])).toEqual([0, 1, 2, 0]);
    expect(staggerRows([])).toEqual([]);
    expect(staggerRows([{ x: 0, w: 10 }, { x: 100, w: 10 }])).toEqual([0, 0]);
    expect(staggerRows([{ x: 300, w: 50 }, { x: 100, w: 50 }, { x: 120, w: 50 }])).toEqual([0, 0, 1]);
    expect(staggerRows([{ x: 100, w: 50 }, { x: 151, w: 50 }], 0)).toEqual([0, 0]);
    expect(staggerRows([{ x: 100, w: 50 }, { x: 120, w: 50 }, { x: 130, w: 50 }], 4, 2)).toEqual([0, 1, 1]);
  });
  it("textWidth is 0.58 of the size per character", () => {
    expect(textWidth("abcd", 10)).toBeCloseTo(23.2, 10);
    expect(textWidth("", 12)).toBe(0);
  });
  it("the band colours", () => {
    expect([BAND_RED, BAND_YELLOW, BAND_GREEN]).toEqual(["#fee2e2", "#fef3c7", "#dcfce7"]);
  });
  it("currentValues: the values of the latest-dated items; an undated or unreadable date is the earliest", () => {
    expect(currentValues([{ value: 1, when: "2026-01-01" }, { value: 2, when: "2027-01-01" }, { value: 3, when: "2027-01-01" }])).toEqual([2, 3]);
    expect(currentValues([{ value: 1, when: "" }, { value: 2, when: "junk" }])).toEqual([1, 2]);
    expect(currentValues([{ value: 1, when: "" }, { value: 2, when: "2025" }])).toEqual([2]);
    expect(currentValues([])).toEqual([]);
  });
});

describe("the package index", () => {
  it("exports the geometry and nothing of the model", () => {
    expect(typeof api.arrowBands).toBe("function");
    expect(typeof api.buildAxis).toBe("function");
    expect((api as Record<string, unknown>).readValueCard).toBeUndefined();
  });
});
