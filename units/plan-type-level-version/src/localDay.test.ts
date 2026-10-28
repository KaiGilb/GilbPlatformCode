import { describe, expect, it } from "vitest";
import { localDay } from "./localDay";

describe("localDay", () => {
  it("is YYYY-MM-DD with the month and day padded to two digits, from the local clock", () => {
    expect(localDay(new Date(2026, 0, 5, 9, 30))).toBe("2026-01-05");
    expect(localDay(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
    expect(localDay(new Date(2026, 9, 28))).toBe("2026-10-28");
  });
  it("reads the local zone, not UTC: the same local midnight gives the same day wherever the machine is", () => {
    expect(localDay(new Date(2026, 2, 1, 0, 0, 0))).toBe("2026-03-01");
    expect(localDay(new Date(2026, 2, 1, 23, 59, 59, 999))).toBe("2026-03-01");
  });
  it("a leap day is a day", () => {
    expect(localDay(new Date(2028, 1, 29))).toBe("2028-02-29");
  });
  it("the year is not padded (a year before 1000 has fewer than four digits)", () => {
    const d = new Date(2000, 0, 1);
    d.setFullYear(999);
    expect(localDay(d)).toBe("999-01-01");
  });
  it("an invalid date reads NaN in every part", () => {
    expect(localDay(new Date(NaN))).toBe("NaN-NaN-NaN");
  });
});
