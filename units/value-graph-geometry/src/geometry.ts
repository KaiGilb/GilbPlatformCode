/**
 * Pure geometry for the Value card's Picture: grouping levels into rows, the shared axis,
 * value <-> pixel mapping and snapping. No React here, so it can be tested alone.
 */
import { kindClass, type ScaleDirection, type ValueCardData, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

/**
 * Marker sizes shared by the Arrow and the Timeline. `half` is the half-height the labels clear
 * (plus 4px); `HIT` is the minimum side of the transparent grab area (a 44px touch target).
 */
export const MARKER = {
  hit: 44,
  status: { r: 12, half: 12 },
  past: { r: 11, stroke: 3, half: 12.5 },
  goal: { w: 10, h: 34, half: 17 },
  bar: { w: 8, h: 30, half: 15 }, // Tolerable, Fail, Survival
  wish: { outer: 15.3, inner: 6.8, half: 15.3 },
  other: { side: 18, half: 12.8 }, // diamond: a 18x18 square turned 45 degrees
  gap: 4,
} as const;

/** The half-height of a kind's marker, for placing labels clear of it. */
export function markerHalf(kind: string, resource?: boolean): number {
  const k = kindClass(kind, resource);
  if (k === "status") return MARKER.status.half;
  if (k === "past") return MARKER.past.half;
  if (k === "goal") return MARKER.goal.half;
  if (k === "tolerable" || k === "fail" || k === "survival") return MARKER.bar.half;
  if (k === "wish") return MARKER.wish.half;
  return MARKER.other.half;
}

export interface LevelGroup {
  key: string;
  label: string;
  /** Indexes into data.levels, in original order. */
  indexes: number[];
}

/** Qualifier variables with defaults filled in. */
function resolvedVariables(data: ValueCardData, level: ValueLevel): [string, string][] {
  const merged: Record<string, string> = {};
  for (const v of data.variables) if (v.defaultOption) merged[v.name] = v.defaultOption;
  for (const [k, v] of Object.entries(level.qualifier.variables)) {
    const vals = Array.isArray(v) ? [...v].sort() : v ? [v] : [];
    if (vals.length > 1) merged[k] = `{${vals.join(", ")}}`;
    else if (vals.length) merged[k] = vals[0]!;
  }
  return Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
}

function variablesLabel(data: ValueCardData, level: ValueLevel): string[] {
  // Short label: only variables the level sets itself (the rest are the defaults).
  const set = Object.entries(level.qualifier.variables)
    .map(([k, v]): [string, string] => [k, Array.isArray(v) ? (v.length > 1 ? `{${v.join(", ")}}` : (v[0] ?? "")) : v])
    .filter(([, v]) => v);
  const names = new Set(set.map(([k]) => k));
  const out = set.map(([k, v]) => `${k} = ${v}`);
  void data;
  void names;
  return out;
}

/** A qualifier set's key: choices (defaults filled in), free conditions and side. Never the date. */
export function groupKey(data: ValueCardData, level: ValueLevel): string {
  const q = level.qualifier;
  // Conditions are compared trimmed, case-folded and sorted, so order and case do not split a set (the label keeps the first-seen spelling).
  const conditions = q.conditions.map((c) => c.trim().toLowerCase()).filter(Boolean).sort();
  return JSON.stringify([resolvedVariables(data, level), conditions, q.side]);
}

/** A qualifier set's label ("Country = Norway"). No date: each level carries its own. */
export function groupLabel(data: ValueCardData, level: ValueLevel): string {
  const q = level.qualifier;
  const parts: string[] = [...variablesLabel(data, level), ...q.conditions];
  if (q.side) parts.push(`${q.side} side`);
  return parts.length ? parts.join(" · ") : "no qualifier";
}

/**
 * The qualifier sets of a Value, in order of first appearance. ONE grouping for the Arrow (a row per set), the Timeline (a series per
 * set) and the "+ New" menu: a set is its qualifier, never the date of a level.
 */
export function groupLevels(data: ValueCardData): LevelGroup[] {
  const map = new Map<string, LevelGroup>();
  data.levels.forEach((lv, i) => {
    const key = groupKey(data, lv);
    let g = map.get(key);
    if (!g) {
      g = { key, label: groupLabel(data, lv), indexes: [] };
      map.set(key, g);
    }
    g.indexes.push(i);
  });
  return [...map.values()];
}

/** 1, 2, 5 x 10^n step giving about `target` ticks over `span`. */
export function niceStep(span: number, target = 6): number {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * pow;
}

export interface Axis {
  min: number;
  max: number;
  tickStep: number;
  ticks: number[];
  /** True when numbers decrease to the right (direction "lower"). */
  flip: boolean;
  p0: number;
  p1: number;
  /** value -> pixel along the axis. */
  toPx: (v: number) => number;
  /** pixel -> value (unsnapped, clamped to the axis range). */
  fromPx: (p: number) => number;
}

export function roundTo(v: number, step: number): number {
  const dec = Math.min(10, Math.max(0, Math.ceil(-Math.log10(step)) + 1));
  return Number((Math.round(v / step) * step).toFixed(dec));
}

/** The shared axis. `p0`..`p1` is the pixel span (left to right, or top to bottom for the timeline). */
export function buildAxis(values: number[], direction: ScaleDirection, p0: number, p1: number, flip?: boolean): Axis {
  const f = flip ?? direction === "lower";
  values = values.filter((v) => Number.isFinite(v));
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (lo === hi) {
    const d = Math.abs(lo) * 0.5 || 0.5;
    lo -= d;
    hi += d;
  } else {
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  if ((!values.length || Math.min(...values) >= 0) && lo < 0) lo = 0;
  const tickStep = niceStep(hi - lo);
  const min = Math.floor(lo / tickStep) * tickStep;
  const max = Math.ceil(hi / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let t = min; t <= max + tickStep / 1000; t += tickStep) ticks.push(roundTo(t, tickStep / 10));
  const span = max - min || 1;
  const toPx = (v: number) => {
    const vv = Number.isFinite(v) ? v : v > 0 ? max : min;
    const r = (vv - min) / span;
    return p0 + (f ? 1 - r : r) * (p1 - p0);
  };
  const fromPx = (p: number) => {
    let r = (p - p0) / (p1 - p0 || 1);
    r = Math.max(0, Math.min(1, r));
    return min + (f ? 1 - r : r) * span;
  };
  return { min, max, tickStep, ticks, flip: f, p0, p1, toPx, fromPx };
}

export function allWhole(data: ValueCardData): boolean {
  return data.levels.every((l) => l.value === null || Number.isInteger(l.value));
}

/** Drag/keyboard step: tick step / 10, or 1 when every value is whole. */
export function snapStep(axis: Axis, whole: boolean): number {
  return whole ? 1 : axis.tickStep / 10;
}

export function snapValue(axis: Axis, v: number, whole: boolean): number {
  const step = snapStep(axis, whole);
  return roundTo(Math.max(axis.min, Math.min(axis.max, v)), step);
}

export function fmt(v: number): string {
  return String(Number(v.toFixed(6)));
}

/** Milliseconds in a UTC day. */
export const DAY = 86_400_000;

import { MAX_YEAR, MIN_YEAR, YEAR_RANGE_SENTENCE, yearOutOfRange } from "@kaigilb/gilbplatformcode-date-rules";
export { MAX_YEAR, MIN_YEAR, YEAR_RANGE_SENTENCE, yearOutOfRange };

/** UTC midnight of a calendar day, for any year (Date.UTC would map the years 0..99 to 1900..1999). */
function utcDay(y: number, m: number, d: number): number {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m, d);
  return dt.getTime();
}

/**
 * A level's date as ms since the epoch (UTC midnight). Accepts `YYYY-MM-DD`, `YYYY-MM` (the 1st) and `YYYY`
 * (1 Jan), for the years {@link MIN_YEAR}..{@link MAX_YEAR}. Anything else, including an impossible date or a year outside that range, is no date (null).
 */
export function parseDate(s: string): number | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec((s ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime();
}

/** `ms` moved by whole calendar months (UTC), day of month kept at 1..28 safe for the callers here. */
function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.getTime();
}

export interface DateRange {
  min: number;
  max: number;
}

/**
 * The x range of the Timeline (ms, UTC midnight).
 * - No dates: today +/- 6 months. One date: that date +/- 6 months.
 * - Several: min..max padded by 8% of the span on each side, and at least 30 days each side.
 * - Today is added only when it lies within 2 years of the data (before min or after max); the side it
 *   extends gets the same padding.
 */
export function dateRange(dates: number[], today: number): DateRange {
  const ds = dates.filter((d) => Number.isFinite(d));
  if (!ds.length) return { min: addMonths(today, -6), max: addMonths(today, 6) };
  const lo = Math.min(...ds);
  const hi = Math.max(...ds);
  let min: number;
  let max: number;
  if (lo === hi) {
    min = addMonths(lo, -6);
    max = addMonths(hi, 6);
  } else {
    const pad = Math.max((hi - lo) * 0.08, 30 * DAY);
    min = lo - pad;
    max = hi + pad;
  }
  const near = addMonths(lo, -24) <= today && today <= addMonths(hi, 24);
  if (near && (today < min || today > max)) {
    const pad = Math.max(((Math.max(max, today) - Math.min(min, today)) * 0.08), 30 * DAY);
    if (today < min) min = today - pad;
    if (today > max) max = today + pad;
  }
  return { min, max };
}

export interface DateTick {
  t: number;
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Candidate steps, finest first. `d` days (aligned on the day count), `w` weeks (Mondays), `m` months, `y` years. */
const DATE_STEPS: { unit: "d" | "w" | "m" | "y"; n: number }[] = [
  { unit: "d", n: 1 },
  { unit: "d", n: 2 },
  { unit: "w", n: 1 },
  { unit: "w", n: 2 },
  { unit: "m", n: 1 },
  { unit: "m", n: 2 },
  { unit: "m", n: 3 },
  { unit: "m", n: 6 },
  { unit: "y", n: 1 },
  { unit: "y", n: 2 },
  { unit: "y", n: 5 },
  { unit: "y", n: 10 },
  { unit: "y", n: 20 },
  { unit: "y", n: 50 },
];

function dateTickList(min: number, max: number, step: { unit: "d" | "w" | "m" | "y"; n: number }): DateTick[] {
  const out: DateTick[] = [];
  const label = (t: number): string => {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (step.unit === "d" || step.unit === "w") return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    if (step.unit === "m") return step.n === 3 ? `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}` : `${MONTHS[d.getUTCMonth()]} ${y}`;
    return String(y);
  };
  if (step.unit === "d" || step.unit === "w") {
    const n = step.unit === "w" ? step.n * 7 : step.n;
    let day = Math.ceil(min / DAY);
    if (step.unit === "w") {
      // 1970-01-01 is a Thursday, so day 4 is the first Monday; align on Mondays.
      while ((((day - 4) % 7) + 7) % 7 !== 0) day++;
      while (((Math.round((day - 4) / 7) % step.n) + step.n) % step.n !== 0) day += 7;
    } else while (day % n !== 0) day++;
    for (; day * DAY <= max; day += n) out.push({ t: day * DAY, label: label(day * DAY) });
    return out;
  }
  if (step.unit === "m") {
    const d = new Date(min);
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    const at = () => utcDay(y, m, 1);
    if (at() < min) m++;
    while (m % step.n !== 0) m++; // quarters on Jan/Apr/Jul/Oct, halves on Jan/Jul
    for (;;) {
      y += Math.floor(m / 12);
      m = ((m % 12) + 12) % 12;
      const t = at();
      if (t > max) break;
      out.push({ t, label: label(t) });
      m += step.n;
    }
    return out;
  }
  let y = new Date(min).getUTCFullYear();
  if (utcDay(y, 0, 1) < min) y++;
  while (y % step.n !== 0) y++;
  for (; utcDay(y, 0, 1) <= max; y += step.n) out.push({ t: utcDay(y, 0, 1), label: String(y) });
  return out;
}

/**
 * Date ticks on calendar boundaries (UTC) between `min` and `max`. The step is the finest of day, 2 days,
 * week (Mondays), 2 weeks, month, 2 months, quarter, half year, year and multi-year with at most `maxTicks`
 * ticks (the caller passes floor(plotWidth / 110)). Labels: days `27 Oct`, months `Oct 2026`,
 * quarters `Q4 2026`, years `2027`.
 */
export function niceDateTicks(min: number, max: number, maxTicks: number): DateTick[] {
  const cap = Math.max(2, Math.floor(maxTicks));
  const span = max - min;
  // The step is chosen from span / cap directly: only the lists that can fit are ever built.
  let from = DATE_STEPS.findIndex((st) => span / stepDays(st) / DAY <= cap);
  if (from < 0) from = DATE_STEPS.length - 1;
  let best: DateTick[] = [];
  // One step finer than the estimate is tried too (the estimate is rounded up), so the result is the finest step that fits.
  for (let k = Math.max(0, from - 1); k < DATE_STEPS.length; k++) {
    best = dateTickList(min, max, DATE_STEPS[k]!);
    if (best.length <= cap) return best;
  }
  // Even the coarsest step is too fine: keep every n-th tick.
  const every = Math.ceil(best.length / cap);
  return best.filter((_, n) => n % every === 0);
}

/** The step's length in days (months and years by their mean length), to pick a step without building its ticks. */
function stepDays(step: { unit: "d" | "w" | "m" | "y"; n: number }): number {
  return step.n * (step.unit === "d" ? 1 : step.unit === "w" ? 7 : step.unit === "m" ? 30.4375 : 365.25) * 1;
}

export interface DateAxis {
  min: number;
  max: number;
  x0: number;
  x1: number;
  /** ms -> pixel. */
  toPx: (t: number) => number;
  /** pixel -> ms (unsnapped, clamped to the range). A dragged date is then snapped to the day. */
  fromPx: (p: number) => number;
}

export function dateAxis(min: number, max: number, x0: number, x1: number): DateAxis {
  const span = max - min || 1;
  const toPx = (t: number) => x0 + ((t - min) / span) * (x1 - x0);
  const fromPx = (p: number) => {
    const r = Math.max(0, Math.min(1, (p - x0) / (x1 - x0 || 1)));
    return min + r * span;
  };
  return { min, max, x0, x1, toPx, fromPx };
}

/** Visible span (ms) above which a dragged date snaps to a Monday instead of to the day (more than 2 years). */
export const WEEK_SNAP_SPAN = 2 * 365 * DAY;

/**
 * A dragged date snapped for the drop: to the day; to the nearest Monday when the visible span is above 2 years.
 * `spanMs` is the width of the visible date range. Input and output are UTC-midnight ms.
 */
export function snapDate(ms: number, spanMs: number): number {
  const day = Math.round(ms / DAY);
  if (spanMs <= WEEK_SNAP_SPAN) return day * DAY;
  // Day 0 (1970-01-01) is a Thursday, so a Monday is a day count d with (d + 3) % 7 === 0.
  const since = (((day + 3) % 7) + 7) % 7;
  return (since >= 4 ? day + (7 - since) : day - since) * DAY;
}

/** `YYYY-MM-DD` of a UTC-midnight ms (the form a level's `qualifier.when` is stored in). */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "30 Jun 2027", or "30 June 2027" when `long`. Fixed English names, so the result does not depend on the machine's locale. */
export function formatDay(ms: number, long = false): string {
  const d = new Date(ms);
  const names = long ? MONTHS_LONG : MONTHS;
  return `${d.getUTCDate()} ${names[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}


/** Fail and Survival are limits drawn as horizontal lines, not points on the path. */
export const isLimitKind = (kind: string) => ["fail", "survival"].includes(kind.toLowerCase());

export interface SeriesPath {
  /** Level indexes along the line, in path order (see {@link seriesPath}). */
  order: number[];
  /** Index into `order` where the solid part ends (the latest Status, else the last Past); -1 = all planned. */
  split: number;
}

/**
 * Is `status` WORSE than the Tolerable? Higher is better: status < tolerable. Lower is better: status > tolerable.
 * Target: outside the band of the Tolerables when there are two or more; with one, on the far side of it from the Goal
 * (no Goal: not worse). Equal is never worse.
 */
export function isWorseThanTolerable(dir: ScaleDirection, status: number, tolerables: number[], goals: number[] = []): boolean {
  const ts = tolerables.filter(Number.isFinite);
  if (ts.length === 0) return false;
  if (dir === "higher") return status < ts[0]!;
  if (dir === "lower") return status > ts[0]!;
  if (ts.length >= 2) return status < Math.min(...ts) || status > Math.max(...ts);
  const g = goals.filter(Number.isFinite);
  if (!g.length) return false;
  return ts[0]! < g[0]! ? status < ts[0]! : ts[0]! > g[0]! ? status > ts[0]! : false;
}

/**
 * The line of one series: the dated levels with a value, in this path. Past(s) and earlier Statuses in date order, then the
 * latest Status, then the Tolerable ONLY if that Status is worse than it (see {@link isWorseThanTolerable}), then the Goal(s) in date
 * order, then the Wish(es). Several Tolerables: the latest one dated at or before the first Goal, else the earliest. No Status: the
 * last Past is judged instead; with neither, Tolerable, Goal and Wish in date order (all planned). Fail and Survival are limit lines and
 * words outside the standard kinds are markers only: neither is on the line. Solid up to the latest Status (else the last Past).
 */
export function seriesPath(
  levels: { kind: string; t: number | null; v: number | null }[],
  indexes: number[],
  dir: ScaleDirection = "higher",
): SeriesPath {
  const kindOf = (i: number) => levels[i].kind.toLowerCase();
  const byDate = (a: number, b: number) => levels[a].t! - levels[b].t! || a - b;
  const pick = (k: string) =>
    indexes.filter((i) => kindOf(i) === k && levels[i].t !== null && levels[i].v !== null).sort(byDate);
  const pasts = pick("past"), statuses = pick("status"), tols = pick("tolerable"), goals = pick("goal"), wishes = pick("wish");
  const status = statuses.length ? statuses[statuses.length - 1]! : -1;
  const history = [...pasts, ...statuses.slice(0, -1)].sort(byDate);
  const anchor = status >= 0 ? status : history.length ? history[history.length - 1]! : -1;
  const v = (i: number) => levels[i].v as number;
  let tol = -1;
  if (tols.length) {
    const firstGoal = goals.length ? levels[goals[0]!].t! : null;
    const chosen = firstGoal === null ? tols[0]! : ([...tols].reverse().find((i) => levels[i].t! <= firstGoal) ?? tols[0]!);
    if (anchor < 0 || isWorseThanTolerable(dir, v(anchor), dir === "target" ? tols.map(v) : [v(chosen)], goals.map(v))) tol = chosen;
  }
  const order = [...history, ...(status >= 0 ? [status] : []), ...(tol >= 0 ? [tol] : []), ...goals, ...wishes];
  const split = anchor >= 0 ? order.indexOf(anchor) : -1;
  return { order, split };
}

/**
 * Label rows for marks on one axis row. Marks sorted left to right; a mark whose label would
 * overlap an earlier one on the same row moves to the next row (0, 1, 2 at most).
 * `w` is the label width in pixels. Returns one row number per input, in input order.
 */
export function staggerRows(items: { x: number; w: number }[], gap = 4, maxRows = 3): number[] {
  const out = new Array<number>(items.length).fill(0);
  const right: number[] = [];
  items
    .map((it, i) => ({ ...it, i }))
    .sort((a, b) => a.x - b.x)
    .forEach((it) => {
      const left = it.x - it.w / 2;
      let r = 0;
      while (r < maxRows - 1 && right[r] !== undefined && right[r] + gap > left) r++;
      out[it.i] = r;
      right[r] = it.x + it.w / 2;
    });
  return out;
}

/** Rough text width in px. */
export const textWidth = (s: string, size: number) => s.length * size * 0.58;

export const BAND_RED = "#fee2e2";
export const BAND_YELLOW = "#fef3c7";
/** A tint of the Goal marker green (#16a34a), the same tint level as the yellow and red bands. */
export const BAND_GREEN = "#dcfce7";

export interface ArrowBand {
  /** Left and right pixel (x1 >= x0). */
  x0: number;
  x1: number;
  fill: string;
  tone: "red" | "yellow" | "green";
}

type BandAxis = Pick<Axis, "min" | "max" | "flip" | "toPx">;

/**
 * Coloured bands behind one Arrow row.
 * - lower / higher: red from the worse end to Tolerable, yellow Tolerable to Goal, green from Goal to the
 *   arrowhead. Several Goals: green starts at the Goal nearest the worse end. No Tolerable: no red or yellow.
 * - target (best in the middle): green between the lowest and the highest Goal. Past each Goal on the far
 *   side: yellow up to that side's nearest Tolerable, then red to the line end. A side with no Tolerable is
 *   yellow to the line end. One Goal: as lower/higher (red to Tolerable, yellow to Goal, green on the far side; no Tolerable: green to the arrowhead). No Goal: no bands.
 * Bands are returned in draw order, never overlapping.
 */
export function arrowBands(dir: ScaleDirection, goals: number[], tolerables: number[], axis: BandAxis): ArrowBand[] {
  const out: ArrowBand[] = [];
  const add = (a: number, b: number, fill: string, tone: ArrowBand["tone"]) => {
    const pa = axis.toPx(a), pb = axis.toPx(b);
    const x0 = Math.min(pa, pb), x1 = Math.max(pa, pb);
    if (x1 - x0 > 0) out.push({ x0, x1, fill, tone });
  };
  const gs = goals.filter(Number.isFinite), ts = tolerables.filter(Number.isFinite);
  if (dir === "target") {
    if (gs.length === 1) {
      // One Goal: like lower/higher. Red to Tolerable, yellow to the Goal, green away from the Tolerable.
      const g = gs[0]!;
      const below = ts.filter((t) => t <= g);
      const above = ts.filter((t) => t > g);
      if (below.length || !above.length) {
        const t = below.length ? Math.max(...below) : null;
        if (t !== null) {
          add(t, axis.min, BAND_RED, "red");
          add(t, g, BAND_YELLOW, "yellow");
        }
        add(g, axis.max, BAND_GREEN, "green");
      } else {
        const t = Math.min(...above);
        add(axis.min, g, BAND_GREEN, "green");
        add(g, t, BAND_YELLOW, "yellow");
        add(t, axis.max, BAND_RED, "red");
      }
      return out;
    }
    if (gs.length < 2) return out;
    const lo = Math.min(...gs), hi = Math.max(...gs);
    const tLow = ts.filter((t) => t < lo);
    const tHigh = ts.filter((t) => t > hi);
    const low = tLow.length ? Math.max(...tLow) : null;
    const high = tHigh.length ? Math.min(...tHigh) : null;
    add(lo, hi, BAND_GREEN, "green");
    add(lo, low ?? axis.min, BAND_YELLOW, "yellow");
    if (low !== null) add(low, axis.min, BAND_RED, "red");
    add(hi, high ?? axis.max, BAND_YELLOW, "yellow");
    if (high !== null) add(high, axis.max, BAND_RED, "red");
    return out;
  }
  if (!gs.length) return out;
  const worseEnd = axis.flip ? axis.max : axis.min;
  const betterEnd = axis.flip ? axis.min : axis.max;
  // The Goal nearest the worse end: for "lower" (flip) the highest value, for "higher" the lowest.
  const g = axis.flip ? Math.max(...gs) : Math.min(...gs);
  if (ts.length) {
    const t = axis.flip ? Math.min(...ts.filter((v) => v >= g)) : Math.max(...ts.filter((v) => v <= g));
    if (Number.isFinite(t)) {
      add(t, worseEnd, BAND_RED, "red");
      add(t, g, BAND_YELLOW, "yellow");
    }
  }
  add(g, betterEnd, BAND_GREEN, "green");
  return out;
}

/**
 * Of several levels of one kind in a row, the values of the latest-dated (the current plan); the earlier ones are markers only
 * An undated level is the earliest. Levels that share the latest date all count (a "target" scale has two Goals).
 */
export function currentValues(items: { value: number; when: string }[]): number[] {
  const t = (w: string) => parseDate(w) ?? -Infinity;
  const best = items.reduce((m, x) => Math.max(m, t(x.when)), -Infinity);
  return items.filter((x) => t(x.when) === best).map((x) => x.value);
}
