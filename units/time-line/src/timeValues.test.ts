// The values, the scale and the snapping of a time to a value. Pure: every number below is worked by hand.
// Moved from GilbApp: the TIME_MARKS and positionOf tests of timeScale.test.ts (the TIME_DONE_POSITION line stays in the app) and the snapToValue tests of timeLine.test.ts.
import { describe, expect, test } from "vitest";
import { TIME_MARKS, TIME_VALUES, TIME_VALUE_MS, isTimeValue, positionOf, snapToValue } from "./timeValues";

const MIN = 60_000;
const D = 10; // toBeCloseTo digits

describe("timeValues", () => {
  describe("TIME_MARKS", () => {
    test("seven marks, left to right, equally spaced", () => {
      // Spec: Wait.Known — seven fixed marks with equal space between them, then done (meter: unit test)
      expect(TIME_MARKS.map((m) => m.label)).toEqual(["5 hours +", "3 hours", "1 hour", "30 min", "10 min", "5 min", "1 min"]);
      expect(TIME_MARKS.map((m) => m.ms)).toEqual([18_000_000, 10_800_000, 3_600_000, 1_800_000, 600_000, 300_000, 60_000]);
      TIME_MARKS.forEach((m, i) => expect(m.position).toBeCloseTo(i / 7, D));
    });
    test("the marks are the seven values, longest first, with the same milliseconds", () => {
      expect(TIME_MARKS.map((m) => m.label)).toEqual([...TIME_VALUES].reverse());
      TIME_MARKS.forEach((m) => expect(m.ms).toBe(TIME_VALUE_MS[m.label as keyof typeof TIME_VALUE_MS]));
    });
  });

  describe("positionOf", () => {
    test("is exact at the marks", () => {
      TIME_MARKS.forEach((m) => expect(positionOf(m.ms)).toBeCloseTo(m.position, D));
      expect(positionOf(0)).toBe(1);
    });
    test("moves in a straight line in time between two marks", () => {
      // 2 hours is half way in time between 3 hours (10.8e6) and 1 hour (3.6e6): (1 + 0.5) / 7.
      expect(positionOf(7_200_000)).toBeCloseTo(1.5 / 7, D);
      // 30 s is half way between 1 min and 0: (6 + 0.5) / 7.
      expect(positionOf(30_000)).toBeCloseTo(6.5 / 7, D);
      // 20 min is half way between 30 min and 10 min: (3 + 0.5) / 7.
      expect(positionOf(20 * MIN)).toBeCloseTo(3.5 / 7, D);
    });
    test("clamps: more than 5 hours is 0; zero, negative and NaN are 1; +Infinity is 0", () => {
      expect(positionOf(18_000_001)).toBe(0);
      expect(positionOf(1e12)).toBe(0);
      expect(positionOf(Infinity)).toBe(0);
      expect(positionOf(-1)).toBe(1);
      expect(positionOf(-Infinity)).toBe(1);
      expect(positionOf(NaN)).toBe(1);
    });
  });

  describe("snapToValue", () => {
    test("returns each value for its own time", () => {
      for (const v of TIME_VALUES) expect(snapToValue(TIME_VALUE_MS[v])).toBe(v);
    });
    test("takes the nearest by position, not by milliseconds", () => {
      // 3 min is at 5.5/7 (a tie with 5 min and 1 min): the longer. 2 min: 5.75/7... nearer 1 min.
      expect(snapToValue(180_000)).toBe("5 min");
      // 2 min: segment 5 to 6 (300000 to 60000): frac 0.75 -> u 5.75, nearer 6 (1 min).
      expect(snapToValue(120_000)).toBe("1 min");
      // The halfway point between 3 hours and 1 hour is 2 hours (7.2e6 ms). Just above it is nearer 3 hours, just below it nearer 1 hour.
      expect(snapToValue(7_300_000)).toBe("3 hours");
      expect(snapToValue(7_100_000)).toBe("1 hour");
    });
    test("NaN, -Infinity, zero and negatives are 1 min; 5 hours or more and +Infinity are 5 hours +", () => {
      for (const bad of [NaN, 0, -1, -Infinity]) expect(snapToValue(bad)).toBe("1 min");
      expect(snapToValue(Infinity)).toBe("5 hours +");
      expect(snapToValue(18_000_000)).toBe("5 hours +");
      expect(snapToValue(1e12)).toBe("5 hours +");
    });
  });

  describe("isTimeValue", () => {
    test("is true for each of the seven values", () => {
      for (const v of TIME_VALUES) expect(isTimeValue(v)).toBe(true);
    });
    test("is false for a name on the object prototype, another letter case, outer spaces and every other string", () => {
      for (const s of ["toString", "constructor", "__proto__", "hasOwnProperty", "5 MIN", "5 Min", " 5 min", "5 min ", "5  min", "5 mins", "5min", "5 hours+", "5 hours", "", "unreadable"]) {
        expect(isTimeValue(s), s).toBe(false);
      }
    });
    test("is false for a number, null, undefined, an object, an array and a String object", () => {
      for (const x of [5, 300_000, NaN, null, undefined, {}, ["5 min"], new String("5 min"), true]) expect(isTimeValue(x)).toBe(false);
    });
    test("narrows the type", () => {
      const v: unknown = "10 min";
      if (isTimeValue(v)) expect(TIME_VALUE_MS[v]).toBe(600_000);
      else throw new Error("not narrowed");
    });
  });
});
