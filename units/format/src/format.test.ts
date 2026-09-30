import { expect, test } from "vitest";
import { formatBytes, formatDateTime, formatShortDate } from "./format";

test("bytes", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(-1)).toBe("");
  expect(formatBytes(Number.NaN)).toBe("");
});

test("a missing date is blank, not an invented day", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  expect(formatShortDate(0, now)).toBe("");
  expect(formatShortDate(null, now)).toBe("");
  expect(formatShortDate(undefined, now)).toBe("");
});

test("this year omits the year; another year keeps two digits", () => {
  const now = new Date(2026, 5, 15);
  const same = formatShortDate(new Date(2026, 2, 12).getTime(), now);
  const other = formatShortDate(new Date(2024, 2, 12).getTime(), now);
  expect(same.includes("26")).toBe(false);
  expect(other.endsWith("24")).toBe(true);
});

test("a full stamp is blank when the record has no time", () => {
  expect(formatDateTime(0)).toBe("");
  expect(formatDateTime(null)).toBe("");
  const shown = formatDateTime(new Date(2024, 2, 12, 15, 4).getTime());
  expect(shown).toContain("2024");
  expect(shown.length).toBeGreaterThan(4);
});
