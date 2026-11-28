/**
 * The seven values of the Time line, what each means in milliseconds, the eight points of the bar they sit on, and the snapping of
 * any time to the nearest value. Pure: no React, no storage, no DOM, no clock.
 */

/** The seven values the agent may write, shortest first. */
export const TIME_VALUES = ["1 min", "5 min", "10 min", "30 min", "1 hour", "3 hours", "5 hours +"] as const;
export type TimeValue = (typeof TIME_VALUES)[number];

/** What each value means in milliseconds. */
export const TIME_VALUE_MS: Readonly<Record<TimeValue, number>> = {
  "1 min": 60_000,
  "5 min": 300_000,
  "10 min": 600_000,
  "30 min": 1_800_000,
  "1 hour": 3_600_000,
  "3 hours": 10_800_000,
  "5 hours +": 18_000_000,
};

/** One fixed mark: its label, the time it stands for, and its place on the bar (0 to 1). */
export interface TimeMark { label: string; ms: number; position: number }

/** The top of the scale: 5 hours. A time at or above it sits at the far left. */
const TIME_TOP_MS = 18_000_000;

/** The times of the marks and the end, from the far left to done. Eight points, seven segments. */
const POINT_MS: readonly number[] = [TIME_TOP_MS, 10_800_000, 3_600_000, 1_800_000, 600_000, 300_000, 60_000, 0];
const SEGMENTS = POINT_MS.length - 1;
const LABELS = ["5 hours +", "3 hours", "1 hour", "30 min", "10 min", "5 min", "1 min"] as const;

/** The seven marks, left to right: "5 hours +" at 0, "3 hours" at 1/7, "1 hour" at 2/7, "30 min" at 3/7, "10 min" at 4/7, "5 min" at 5/7, "1 min" at 6/7. */
export const TIME_MARKS: readonly TimeMark[] = LABELS.map((label, i) => ({ label, ms: POINT_MS[i] ?? 0, position: i / SEGMENTS }));

/**
 * Where a time left sits on the bar: 0 = far left (5 hours or more), 1 = done.
 * More than 5 hours gives 0. Zero or less gives 1. Not a number (NaN) gives 1, so a broken clock never shows a long wait. +Infinity gives 0.
 */
export function positionOf(msLeft: number): number {
  if (Number.isNaN(msLeft)) return 1;
  if (msLeft >= TIME_TOP_MS) return 0;
  if (msLeft <= 0) return 1;
  for (let i = 0; i < SEGMENTS; i++) {
    const hi = POINT_MS[i] ?? 0;
    const lo = POINT_MS[i + 1] ?? 0;
    if (msLeft > lo) return (i + (hi - msLeft) / (hi - lo)) / SEGMENTS;
  }
  return 1;
}

/** True only for a string that is exactly one of the seven values (same letters, same spaces). */
export function isTimeValue(v: unknown): v is TimeValue {
  return typeof v === "string" && (TIME_VALUES as readonly string[]).includes(v);
}

/**
 * The value whose place on the bar is nearest. Nearest by position (the bar has equal segments), not by milliseconds.
 * An exact tie takes the LONGER value. 5 hours or more, and a time without end (+Infinity), give "5 hours +".
 * NaN, -Infinity, zero and negatives give "1 min".
 */
export function snapToValue(ms: number): TimeValue {
  // A time without end is the longest value; the other things that are not a time are the shortest.
  if (ms === Infinity) return "5 hours +";
  if (!Number.isFinite(ms) || ms <= 0) return "1 min";
  if (ms >= TIME_VALUE_MS["5 hours +"]) return "5 hours +";
  // In segment units, so a tie is a difference of exactly 0.5 and a small tolerance absorbs rounding.
  const u = positionOf(ms) * (TIME_MARKS.length);
  let best = 0;
  let bestDist = Infinity;
  // Longest first: a tie keeps the earlier (longer) mark.
  TIME_MARKS.forEach((_, i) => {
    const d = Math.abs(u - i);
    if (d < bestDist - 1e-9) {
      best = i;
      bestDist = d;
    }
  });
  return (TIME_MARKS[best]?.label ?? "1 min") as TimeValue;
}
