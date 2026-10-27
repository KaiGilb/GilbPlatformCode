/** The Timeline's date axis helpers (pure). */
import { describe, expect, it } from "vitest";
import { DAY, dateAxis, dateRange, niceDateTicks, parseDate, seriesPath } from "./geometry";

const d = (s: string) => parseDate(s)!;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

describe("parseDate partial forms", () => {
  it("accepts YYYY-MM-DD, YYYY-MM (1st) and YYYY (1 Jan) as UTC midnight", () => {
    expect(iso(d("2026-10-27"))).toBe("2026-10-27");
    expect(d("2026-10-27")).toBe(Date.UTC(2026, 9, 27));
    expect(d("2026-10")).toBe(Date.UTC(2026, 9, 1));
    expect(d("2027")).toBe(Date.UTC(2027, 0, 1));
  });
  it("anything else is no date", () => {
    for (const bad of ["", "soon", "2026-13", "2026-02-30", "26-10-01", "2026-10-27T10:00", "10/27/2026", "2026-1-5"]) expect(parseDate(bad)).toBeNull();
  });
});

describe("dateRange", () => {
  const today = d("2026-10-27");
  it("no dates: today +/- 6 months", () => {
    expect(dateRange([], today)).toEqual({ min: d("2026-04-27"), max: d("2027-04-27") });
  });
  it("one date: that date +/- 6 months (today far away is left out)", () => {
    expect(dateRange([d("2031-01-15")], today)).toEqual({ min: d("2030-07-15"), max: d("2031-07-15") });
  });
  it("many dates: padded 8%, at least 30 days each side", () => {
    const a = d("2020-01-01");
    const b = d("2030-01-01");
    const r = dateRange([a, b], d("2025-01-01"));
    expect(r.min).toBeCloseTo(a - (b - a) * 0.08, -3);
    expect(r.max).toBeCloseTo(b + (b - a) * 0.08, -3);
    const close = dateRange([d("2026-10-20"), d("2026-10-27")], today);
    expect(close.min).toBe(d("2026-10-20") - 30 * DAY);
    expect(close.max).toBe(d("2026-10-27") + 30 * DAY);
  });
  it("today is included when within 2 years of the data, even outside the padded range", () => {
    const r = dateRange([d("2027-06-01"), d("2027-06-30")], today);
    expect(r.min).toBeLessThanOrEqual(today);
    expect(r.max).toBeGreaterThanOrEqual(d("2027-06-30"));
  });
  it("today is left out when more than 2 years from the data", () => {
    const r = dateRange([d("2030-01-01"), d("2031-01-01")], today);
    expect(r.min).toBeGreaterThan(today);
  });
  it("today inside the data range changes nothing", () => {
    const a = d("2025-10-01");
    const b = d("2029-01-27");
    expect(dateRange([a, b], today)).toEqual(dateRange([a, b], a));
  });
});

describe("niceDateTicks", () => {
  const cases: [string, string, string, number][] = [
    ["10 days", "2026-10-20", "2026-10-30", 6],
    ["3 months", "2026-08-01", "2026-11-01", 8],
    ["2 years", "2026-01-01", "2028-01-01", 8],
    ["8 years", "2020-01-01", "2028-01-01", 6],
  ];
  for (const [name, a, b, cap] of cases) {
    it(`${name}: 4 to ${cap} ticks, in order, inside the range`, () => {
      const ticks = niceDateTicks(d(a), d(b), cap);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(cap);
      for (let n = 0; n < ticks.length; n++) {
        expect(ticks[n]!.t).toBeGreaterThanOrEqual(d(a));
        expect(ticks[n]!.t).toBeLessThanOrEqual(d(b));
        if (n) expect(ticks[n]!.t).toBeGreaterThan(ticks[n - 1]!.t);
      }
    });
  }
  it("10 days: day steps labelled like 27 Oct", () => {
    const ticks = niceDateTicks(d("2026-10-20"), d("2026-10-30"), 6);
    expect(ticks.some((t) => t.label === "27 Oct" || t.label === "28 Oct")).toBe(true);
    expect(ticks.every((t) => /^\d{1,2} [A-Z][a-z]{2}$/.test(t.label))).toBe(true);
  });
  it("3 months: ticks on the 1st or Mondays", () => {
    for (const t of niceDateTicks(d("2026-08-01"), d("2026-11-01"), 8)) {
      const dt = new Date(t.t);
      expect(dt.getUTCDate() === 1 || dt.getUTCDay() === 1).toBe(true);
    }
  });
  it("month steps are on the 1st with labels like Oct 2026", () => {
    const ticks = niceDateTicks(d("2026-01-01"), d("2026-09-30"), 8);
    expect(ticks.map((t) => t.label)).toEqual(["Jan 2026", "Mar 2026", "May 2026", "Jul 2026", "Sep 2026"]);
    expect(ticks.every((t) => new Date(t.t).getUTCDate() === 1)).toBe(true);
  });
  it("quarter steps are labelled Q4 2026", () => {
    const ticks = niceDateTicks(d("2026-01-01"), d("2027-01-01"), 5);
    expect(ticks.map((t) => t.label)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026", "Q1 2027"]);
  });
  it("year steps are labelled 2027 and sit on 1 Jan", () => {
    const ticks = niceDateTicks(d("2020-01-01"), d("2028-01-01"), 6);
    expect(ticks.map((t) => t.label)).toEqual(["2020", "2022", "2024", "2026", "2028"]);
    expect(ticks.every((t) => iso(t.t).endsWith("-01-01"))).toBe(true);
  });
});

describe("dateAxis", () => {
  it("maps the range onto the pixels and back", () => {
    const a = dateAxis(d("2026-01-01"), d("2027-01-01"), 60, 560);
    expect(a.toPx(d("2026-01-01"))).toBe(60);
    expect(a.toPx(d("2027-01-01"))).toBe(560);
    for (const s of ["2026-03-05", "2026-07-02", "2026-12-31"]) expect(Math.abs(a.fromPx(a.toPx(d(s))) - d(s))).toBeLessThan(1);
    expect(a.fromPx(0)).toBe(d("2026-01-01"));
    expect(a.fromPx(9999)).toBe(d("2027-01-01"));
  });
});

describe("seriesPath", () => {
  const f = (rows: [string, string, number | null][]) => rows.map(([kind, when, v]) => ({ kind, t: parseDate(when), v }));
  const kinds = (lv: ReturnType<typeof f>, p: ReturnType<typeof seriesPath>) => p.order.map((i) => lv[i]!.kind);
  const all = (lv: ReturnType<typeof f>) => lv.map((_, i) => i);
  it("Past, Status, Goal, Wish; a Tolerable already passed, limits and undated are off the line", () => {
    const lv = f([["Wish", "2027-06-30", 1], ["Goal", "2027-06-30", 5], ["Tolerable", "2027-06-30", 9], ["Fail", "2027-06-30", 20], ["Status", "2026-10-27", 6], ["Past", "2025-10-01", 13], ["Goal", "", 4]]);
    // higher is better: Status 6 < Tolerable 9, so it IS worse: through Tolerable
    expect(kinds(lv, seriesPath(lv, all(lv), "higher"))).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    // lower is better: Status 6 < 9, not worse: direct to Goal
    const p = seriesPath(lv, all(lv), "lower");
    expect(kinds(lv, p)).toEqual(["Past", "Status", "Goal", "Wish"]);
    expect(p.split).toBe(1);
  });
  it("higher is better: Volvo Status 146 Tolerable 84 Goal 200 goes Status to Goal; Tesla 243 / 90 / 300 too", () => {
    for (const [s, t, g] of [[146, 84, 200], [243, 90, 300]] as const) {
      const lv = f([["Status", "2026-10-27", s], ["Tolerable", "2027-01-01", t], ["Goal", "2027-06-30", g]]);
      expect(kinds(lv, seriesPath(lv, all(lv), "higher"))).toEqual(["Status", "Goal"]);
    }
  });
  it("Status worse than Tolerable goes through it; equal is direct; lower is better mirrors", () => {
    const worse = f([["Status", "2026-10-27", 50], ["Tolerable", "2027-01-01", 84], ["Goal", "2027-06-30", 200]]);
    expect(kinds(worse, seriesPath(worse, all(worse), "higher"))).toEqual(["Status", "Tolerable", "Goal"]);
    const eq = f([["Status", "2026-10-27", 84], ["Tolerable", "2027-01-01", 84], ["Goal", "2027-06-30", 200]]);
    expect(kinds(eq, seriesPath(eq, all(eq), "higher"))).toEqual(["Status", "Goal"]);
    const low = f([["Status", "2026-10-27", 9], ["Tolerable", "2027-01-01", 6], ["Goal", "2027-06-30", 2]]);
    expect(kinds(low, seriesPath(low, all(low), "lower"))).toEqual(["Status", "Tolerable", "Goal"]);
    const lowOk = f([["Status", "2026-10-27", 4], ["Tolerable", "2027-01-01", 6], ["Goal", "2027-06-30", 2]]);
    expect(kinds(lowOk, seriesPath(lowOk, all(lowOk), "lower"))).toEqual(["Status", "Goal"]);
  });
  it("target: outside the Tolerable band is worse; inside goes direct", () => {
    const out = f([["Status", "2026-10-27", 1], ["Tolerable", "2027-01-01", 4], ["Tolerable", "2027-01-02", 8], ["Goal", "2027-06-30", 6]]);
    expect(kinds(out, seriesPath(out, all(out), "target"))).toEqual(["Status", "Tolerable", "Goal"]);
    const inside = f([["Status", "2026-10-27", 5], ["Tolerable", "2027-01-01", 4], ["Tolerable", "2027-01-02", 8], ["Goal", "2027-06-30", 6]]);
    expect(kinds(inside, seriesPath(inside, all(inside), "target"))).toEqual(["Status", "Goal"]);
  });
  it("several Goals in date order; several Tolerables use the one at or before the first Goal, else the earliest", () => {
    const lv = f([["Status", "2026-01-01", 1], ["Tolerable", "2026-02-01", 5], ["Tolerable", "2026-05-01", 7], ["Tolerable", "2028-01-01", 9], ["Goal", "2027-06-30", 20], ["Goal", "2027-01-01", 10]]);
    const p = seriesPath(lv, all(lv), "higher");
    expect(p.order).toEqual([0, 2, 5, 4]);
    const late = f([["Status", "2026-01-01", 1], ["Tolerable", "2029-01-01", 5], ["Tolerable", "2030-01-01", 7], ["Goal", "2027-01-01", 10]]);
    expect(seriesPath(late, all(late), "higher").order).toEqual([0, 1, 3]);
  });
  it("no Status judges the last Past; a Past before a Status stays on the line", () => {
    const lv = f([["Past", "2025-01-01", 2], ["Past", "2025-06-01", 50], ["Tolerable", "2027-01-01", 84], ["Goal", "2027-06-30", 200]]);
    const p = seriesPath(lv, all(lv), "higher");
    expect(kinds(lv, p)).toEqual(["Past", "Past", "Tolerable", "Goal"]);
    expect(p.split).toBe(1);
    const ok = f([["Past", "2025-06-01", 90], ["Tolerable", "2027-01-01", 84], ["Goal", "2027-06-30", 200]]);
    expect(kinds(ok, seriesPath(ok, all(ok), "higher"))).toEqual(["Past", "Goal"]);
  });
  it("no Status: solid through the Pasts; neither: all planned", () => {
    const a = f([["Past", "2025-01-01", 1], ["Past", "2025-06-01", 2], ["Goal", "2027-01-01", 3]]);
    expect(seriesPath(a, [0, 1, 2]).split).toBe(1);
    const c = f([["Wish", "2028-01-01", 1], ["Goal", "2027-01-01", 3], ["Tolerable", "2026-06-01", 2]]);
    expect(seriesPath(c, [0, 1, 2]).order.map((i) => c[i]!.kind)).toEqual(["Tolerable", "Goal", "Wish"]);
    const b = f([["Goal", "2027-01-01", 3], ["Wish", "2028-01-01", 1]]);
    expect(seriesPath(b, [0, 1]).split).toBe(-1);
  });
});
