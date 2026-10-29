// Every export of the unit is pinned here: the names it offers, and the behaviour the ported tests do not reach.
import { describe, expect, it } from "vitest";
import * as unit from "./index";
import {
  birthdayMonthName,
  birthdayText,
  birthdayValue,
  birthdayVcardValue,
  daysInBirthdayMonth,
  isLawfulBirthday,
  isLawfulBirthdayParts,
  parseBirthday,
  type BirthdayParts,
} from "./index";

describe("the unit's exports", () => {
  it("offers exactly these functions", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["birthdayMonthName", "birthdayText", "birthdayValue", "birthdayVcardValue", "daysInBirthdayMonth", "isLawfulBirthday", "isLawfulBirthdayParts", "parseBirthday"].sort(),
    );
  });
  it("types a lawful birthday as day, month and a year that may be null", () => {
    const p: BirthdayParts = { day: 29, month: 2, year: null };
    expect(isLawfulBirthdayParts(p)).toBe(true);
  });
});

describe("isLawfulBirthdayParts", () => {
  it("accepts 29 February with no year and in a leap year, refuses it in a common year", () => {
    expect(isLawfulBirthdayParts({ day: 29, month: 2, year: null })).toBe(true);
    expect(isLawfulBirthdayParts({ day: 29, month: 2, year: 2024 })).toBe(true);
    expect(isLawfulBirthdayParts({ day: 29, month: 2, year: 2023 })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 29, month: 2, year: 1900 })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 29, month: 2, year: 2000 })).toBe(true);
  });
  it("refuses an unlawful day, month or year", () => {
    expect(isLawfulBirthdayParts({ day: 30, month: 2, year: null })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 31, month: 4, year: null })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 0, month: 4, year: null })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 1, month: 0, year: null })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 1, month: 13, year: null })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 1.5, month: 4, year: null })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 1, month: 4, year: 0 })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 1, month: 4, year: 10000 })).toBe(false);
    expect(isLawfulBirthdayParts({ day: 1, month: 4, year: 1980.5 })).toBe(false);
  });
  it("accepts the last day of every month", () => {
    const last = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    last.forEach((d, i) => {
      expect(isLawfulBirthdayParts({ day: d, month: i + 1, year: null }), `month ${i + 1}`).toBe(true);
      expect(isLawfulBirthdayParts({ day: d + 1, month: i + 1, year: null }), `month ${i + 1} day ${d + 1}`).toBe(false);
    });
  });
});

describe("isLawfulBirthday", () => {
  it("is true for the two lawful forms and false for an unlawful day or a non-string", () => {
    expect(isLawfulBirthday("1961-03-14")).toBe(true);
    expect(isLawfulBirthday("--02-29")).toBe(true);
    expect(isLawfulBirthday("1961-02-29")).toBe(false);
    expect(isLawfulBirthday("--02-30")).toBe(false);
    expect(isLawfulBirthday(undefined)).toBe(false);
  });
});

describe("daysInBirthdayMonth, every month", () => {
  it("counts all twelve months with no year, and 28 in a common year", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInBirthdayMonth(m, null))).toEqual([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(daysInBirthdayMonth(2, 1900)).toBe(28);
    expect(daysInBirthdayMonth(2, 2000)).toBe(29);
    expect(daysInBirthdayMonth(1.5, null)).toBe(0);
    expect(daysInBirthdayMonth(NaN, null)).toBe(0);
  });
});

describe("birthdayValue", () => {
  it("pads the month, the day and a short year", () => {
    expect(birthdayValue({ day: 5, month: 7, year: 987 })).toBe("0987-07-05");
    expect(birthdayValue({ day: 5, month: 7, year: null })).toBe("--07-05");
    expect(birthdayValue({ day: 1, month: 1, year: 9999 })).toBe("9999-01-01");
  });
  it("names the unlawful parts in the error", () => {
    expect(() => birthdayValue({ day: 31, month: 2, year: null })).toThrow("not a birthday: day 31, month 2, year not stated");
    expect(() => birthdayValue({ day: 29, month: 2, year: 2023 })).toThrow("not a birthday: day 29, month 2, year 2023");
  });
});

describe("birthdayMonthName", () => {
  it("names a month in a language", () => {
    expect(birthdayMonthName(3, "en")).toBe("March");
    expect(birthdayMonthName(1, "en")).toBe("January");
    expect(birthdayMonthName(12, "en")).toBe("December");
    expect(birthdayMonthName(3, ["en-GB"])).toBe("March");
  });
  it("answers the number when the month is outside 1 to 12 or not whole", () => {
    expect(birthdayMonthName(0, "en")).toBe("0");
    expect(birthdayMonthName(13, "en")).toBe("13");
    expect(birthdayMonthName(2.5, "en")).toBe("2.5");
  });
});

describe("birthdayText", () => {
  it("words 29 February with and without a year, and answers null for an unlawful day", () => {
    expect(birthdayText("--02-29", "en")).toBe("29 February");
    expect(birthdayText("2000-02-29", "en")).toBe("29 February 2000");
    expect(birthdayText("1999-02-29", "en")).toBeNull();
    expect(birthdayText("--04-31", "en")).toBeNull();
    expect(birthdayText(12, "en")).toBeNull();
  });
});

describe("birthdayVcardValue", () => {
  it("writes 29 February with and without a year, and pads a short year", () => {
    expect(birthdayVcardValue("--02-29")).toBe("--0229");
    expect(birthdayVcardValue("2000-02-29")).toBe("20000229");
    expect(birthdayVcardValue("0987-07-05")).toBe("09870705");
  });
  it("answers null for an unlawful day and for a non-string", () => {
    expect(birthdayVcardValue("--02-30")).toBeNull();
    expect(birthdayVcardValue(null)).toBeNull();
  });
});

describe("parseBirthday", () => {
  it("reads 29 February with and without a year and refuses an unlawful day", () => {
    expect(parseBirthday("--02-29")).toEqual({ day: 29, month: 2, year: null });
    expect(parseBirthday("2024-02-29")).toEqual({ day: 29, month: 2, year: 2024 });
    expect(parseBirthday("--02-30")).toBeNull();
    expect(parseBirthday("2023-02-29")).toBeNull();
  });
});
