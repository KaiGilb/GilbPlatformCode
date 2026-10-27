import { describe, expect, it } from "vitest";
import { MAX_YEAR, MIN_YEAR, YEAR_RANGE_SENTENCE, completeDate, levelDateWritable, yearOutOfRange } from "./index";

describe("the year range", () => {
  it("is 1900 to 2200", () => {
    expect(MIN_YEAR).toBe(1900);
    expect(MAX_YEAR).toBe(2200);
  });
  it("has a sentence with an en dash", () => {
    expect(YEAR_RANGE_SENTENCE).toBe("Year must be 1900–2200");
    expect(YEAR_RANGE_SENTENCE).toBe("Year must be 1900–2200");
  });
});

describe("yearOutOfRange", () => {
  it.each([
    ["1899-12-31", true],
    ["1900-01-01", false],
    ["2200-12-31", false],
    ["2201-01-01", true],
    ["0202-05-01", true],
    ["", false],
    ["abc", false],
    ["  2300", true],
    ["20261", false],
    ["2026-10-27", false],
  ])("%j -> %s", (text, out) => {
    expect(yearOutOfRange(text)).toBe(out);
  });
  it("reads only the first four digits (20261 reads as 2026)", () => {
    expect(yearOutOfRange("20261")).toBe(false);
    expect(yearOutOfRange("22011")).toBe(true);
  });
  it("lets null and undefined through as no year", () => {
    expect(yearOutOfRange(null as unknown as string)).toBe(false);
    expect(yearOutOfRange(undefined as unknown as string)).toBe(false);
  });
  it("does not look at the rest of the text, only the leading four digits", () => {
    expect(yearOutOfRange("2026-99-99")).toBe(false);
    expect(yearOutOfRange("x2026")).toBe(false);
  });
});

describe("completeDate", () => {
  it.each([
    ["2026-10-27", true],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["2026-1-01", false],
    ["", false],
    ["0000-01-01", false],
    ["2400-02-29", true],
    ["2026-10-27T00:00", false],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-00-10", false],
    ["2026-10-00", false],
  ])("%j -> %s", (text, ok) => {
    expect(completeDate(text)).toBe(ok);
  });
  it("is false for 0050-06-15: Date.UTC maps the years 0..99 to 1900..1999, so the year read back differs (the behaviour, pinned)", () => {
    expect(completeDate("0050-06-15")).toBe(false);
  });
  it("has no year range: 2400-02-29 is a real day, and 1000-01-01 passes", () => {
    expect(completeDate("2400-02-29")).toBe(true);
    expect(completeDate("1000-01-01")).toBe(true);
  });
});

describe("levelDateWritable", () => {
  it.each([
    ["", true],
    ["2026-10-27", true],
    ["0202-01-01", false],
    ["2201-01-01", false],
    ["2026-10", false],
    [" 2026-10-27", false],
    ["1900-01-01", true],
    ["2200-12-31", true],
    ["1899-12-31", false],
  ])("%j -> %s", (text, ok) => {
    expect(levelDateWritable(text)).toBe(ok);
  });
  it("checks the shape only, not the calendar: 2026-02-30 is writable", () => {
    expect(levelDateWritable("2026-02-30")).toBe(true);
    expect(completeDate("2026-02-30")).toBe(false);
  });
  it("is the exact negation of the do-not-write guard", () => {
    const guard = (when: string) => when !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(when) || yearOutOfRange(when));
    for (const w of ["", "2026-10-27", "2026-02-30", "0202-01-01", "2201-01-01", "2026-10", " 2026-10-27", "abc", "2026-10-27T00:00", "1900-01-01", "2200-12-31", "1899-12-31"]) {
      expect(levelDateWritable(w)).toBe(!guard(w));
    }
  });
});
