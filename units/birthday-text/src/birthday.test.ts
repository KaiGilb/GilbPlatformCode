// The birthday shape (`a:birthday`, encoding inline-literal:date-or-month-day), its check, its words and its vCard form.
import { describe, expect, it } from "vitest";
import {
  birthdayMonthName,
  birthdayText,
  birthdayValue,
  birthdayVcardValue,
  daysInBirthdayMonth,
  isLawfulBirthday,
  parseBirthday,
} from "./index";

describe("parseBirthday: exactly the two lawful forms, and a real day", () => {
  it("reads a full date and a day+month with no year", () => {
    expect(parseBirthday("1961-03-14")).toEqual({ day: 14, month: 3, year: 1961 });
    expect(parseBirthday("--03-14")).toEqual({ day: 14, month: 3, year: null });
    expect(parseBirthday("  --12-31 ")).toEqual({ day: 31, month: 12, year: null });
  });

  it("29 February: lawful with no year and in a leap year, refused in a common year", () => {
    expect(parseBirthday("--02-29")).toEqual({ day: 29, month: 2, year: null });
    expect(parseBirthday("2000-02-29")).toEqual({ day: 29, month: 2, year: 2000 });
    expect(parseBirthday("1984-02-29")).toEqual({ day: 29, month: 2, year: 1984 });
    expect(parseBirthday("1961-02-29")).toBeNull();
    expect(parseBirthday("1900-02-29")).toBeNull(); // divisible by 100, not by 400
  });

  it("refuses days that do not exist", () => {
    for (const s of ["--02-30", "--02-31", "--04-31", "--06-31", "--09-31", "--11-31", "1980-04-31", "--01-32", "--01-00", "--00-10", "--13-01"]) {
      expect(parseBirthday(s), s).toBeNull();
    }
    for (const s of ["--01-31", "--03-31", "--05-31", "--07-31", "--08-31", "--10-31", "--12-31", "--04-30"]) {
      expect(parseBirthday(s), s).not.toBeNull();
    }
  });

  it("refuses every other shape (older or odd stored values)", () => {
    for (const v of [
      "1961",
      "1961-03",
      "--03",
      "---14",
      "14 March",
      "14.03.1961",
      "1961-3-14",
      "--3-14",
      "0000-03-14",
      "1961-03-14T00:00:00Z",
      "1961-03-14Z",
      "--03-14+01:00",
      "",
      " ",
      null,
      undefined,
      19610314,
      { "@value": "1961-03-14" },
      ["--03-14"],
    ]) {
      expect(parseBirthday(v), JSON.stringify(v)).toBeNull();
      expect(isLawfulBirthday(v)).toBe(false);
    }
  });
});

describe("birthdayValue: writes only the master's shapes", () => {
  it("writes --MM-DD with no year and YYYY-MM-DD with one", () => {
    expect(birthdayValue({ day: 14, month: 3, year: null })).toBe("--03-14");
    expect(birthdayValue({ day: 14, month: 3, year: 1961 })).toBe("1961-03-14");
    expect(birthdayValue({ day: 1, month: 1, year: 5 })).toBe("0005-01-01");
    expect(birthdayValue({ day: 29, month: 2, year: null })).toBe("--02-29");
    expect(birthdayValue({ day: 29, month: 2, year: 2024 })).toBe("2024-02-29");
  });

  it("refuses an impossible day, never writing it", () => {
    expect(() => birthdayValue({ day: 31, month: 2, year: null })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 29, month: 2, year: 2023 })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 31, month: 4, year: null })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 1, month: 13, year: null })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 0, month: 1, year: null })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 1, month: 1, year: 0 })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 1, month: 1, year: 10000 })).toThrow(RangeError);
    expect(() => birthdayValue({ day: 1.5, month: 1, year: null })).toThrow(RangeError);
  });

  it("round-trips: what it writes, parseBirthday reads back as the same parts", () => {
    for (const p of [
      { day: 14, month: 3, year: null },
      { day: 14, month: 3, year: 1961 },
      { day: 29, month: 2, year: null },
      { day: 31, month: 12, year: 1999 },
    ]) {
      expect(parseBirthday(birthdayValue(p))).toEqual(p);
    }
  });
});

describe("daysInBirthdayMonth", () => {
  it("counts February as 29 with no year, 28 or 29 by year", () => {
    expect(daysInBirthdayMonth(2, null)).toBe(29);
    expect(daysInBirthdayMonth(2, 2024)).toBe(29);
    expect(daysInBirthdayMonth(2, 2023)).toBe(28);
    expect(daysInBirthdayMonth(2, 2100)).toBe(28);
    expect(daysInBirthdayMonth(4, null)).toBe(30);
    expect(daysInBirthdayMonth(1, null)).toBe(31);
    expect(daysInBirthdayMonth(0, null)).toBe(0);
    expect(daysInBirthdayMonth(13, null)).toBe(0);
  });
});

describe("birthdayText: day, month name in the reader's language, year when stated", () => {
  it("words it in English", () => {
    expect(birthdayText("--03-14", "en-GB")).toBe("14 March");
    expect(birthdayText("1980-03-14", "en-GB")).toBe("14 March 1980");
    expect(birthdayText("1980-03-14", "en-US")).toBe("14 March 1980");
    expect(birthdayText("--02-29", "en")).toBe("29 February");
  });

  it("names the month in the reader's language", () => {
    expect(birthdayText("--03-14", "nb")).toBe("14 mars");
    expect(birthdayText("1961-05-17", "de")).toBe("17 Mai 1961");
    expect(birthdayMonthName(12, "fr")).toBe("décembre");
  });

  it("never moves the day by time zone (no Date.parse)", () => {
    expect(birthdayText("--01-01", "en-GB")).toBe("1 January");
    expect(birthdayText("2000-12-31", "en-GB")).toBe("31 December 2000");
  });

  it("answers null for an odd stored value, so the caller shows it as stored", () => {
    expect(birthdayText("14 March", "en")).toBeNull();
    expect(birthdayText("1961-02-29", "en")).toBeNull();
    expect(birthdayText(null, "en")).toBeNull();
  });
});

describe("birthdayVcardValue: RFC 6350 BDAY", () => {
  it("writes 19610314 and --0314", () => {
    expect(birthdayVcardValue("1961-03-14")).toBe("19610314");
    expect(birthdayVcardValue("--03-14")).toBe("--0314");
    expect(birthdayVcardValue("1961-02-29")).toBeNull();
    expect(birthdayVcardValue("odd")).toBeNull();
  });
});
