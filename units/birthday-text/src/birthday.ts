/**
 * A birthday value: read it, check it, write it, and word it for a reader. One copy for every app.
 *
 * The shape is the master's, ⛔ not this file's. `a:birthday` (encoding `inline-literal:date-or-month-day`)
 * is ONE string in exactly one of two forms:
 *   - `"1961-03-14"`: the year is stated (ISO 8601 calendar date);
 *   - `"--03-14"`: day and month only (the XML Schema gMonthDay form, which vCard `BDAY` also uses).
 * Day and month are always there, and the day must exist in that month: `"--02-29"` is a birthday, `"1961-02-29"` is not.
 * ⛔ Nothing else: no `"1961"`, no `"1961-03"`, no time, no zone, no placeholder year (`0000`).
 *
 * A reader branches on the leading `--` (the master's own instruction), ⛔ never on `Date.parse`, which reads `"--03-14"` as
 * nothing and a full date as midnight UTC, a day off in half the world.
 *
 * A value that is not one of the two forms (an older or odd stored value) is never "fixed" here: {@link parseBirthday} answers
 * null, {@link birthdayText} answers null, and the caller shows the stored text as it is, so nothing is lost and nothing reads as
 * a date it is not.
 */

/** The parts of a lawful birthday. `year` is null when the person did not state it. */
export interface BirthdayParts {
  /** 1 to 31, and a day that exists in `month` (of `year`, when stated). */
  day: number;
  /** 1 to 12. */
  month: number;
  /** 1 to 9999, or null for "not stated". */
  year: number | null;
}

const WITH_YEAR = /^(\d{4})-(\d{2})-(\d{2})$/;
const NO_YEAR = /^--(\d{2})-(\d{2})$/;

/** True for a Gregorian leap year. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * How many days a month has: 29 for February with no year (a person born on 29 February has that birthday), else the
 * calendar's count for that year.
 *
 * @param month 1 to 12
 * @param year the year, or null when not stated
 * @returns 28 to 31, or 0 for a month outside 1 to 12
 */
export function daysInBirthdayMonth(month: number, year: number | null): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month === 2) return year === null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Are these parts a lawful birthday?
 *
 * @param parts a day, a month and an optional year
 * @returns true when the day exists in that month (and year), the month is 1 to 12, and a stated year is 1 to 9999
 */
export function isLawfulBirthdayParts(parts: BirthdayParts): boolean {
  const { day, month, year } = parts;
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9999)) return false;
  const days = daysInBirthdayMonth(month, year);
  return days > 0 && Number.isInteger(day) && day >= 1 && day <= days;
}

/**
 * Read a stored birthday.
 *
 * @param raw the stored value (any JSON value; only a string can be a birthday)
 * @returns the parts, or null when the value is not exactly one of the two lawful forms or names a day that does not exist
 */
export function parseBirthday(raw: unknown): BirthdayParts | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const noYear = NO_YEAR.exec(s);
  const withYear = noYear ? null : WITH_YEAR.exec(s);
  if (!noYear && !withYear) return null;
  const parts: BirthdayParts = noYear
    ? { day: Number(noYear[2]), month: Number(noYear[1]), year: null }
    : { day: Number(withYear![3]), month: Number(withYear![2]), year: Number(withYear![1]) };
  return isLawfulBirthdayParts(parts) ? parts : null;
}

/** True when `raw` is a lawful stored birthday. */
export function isLawfulBirthday(raw: unknown): boolean {
  return parseBirthday(raw) !== null;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/**
 * The string to store for these parts: `"YYYY-MM-DD"` with a year, `"--MM-DD"` without.
 *
 * @param parts a day, a month and an optional year
 * @returns the stored form
 * @throws RangeError when the parts are not a lawful birthday (31 February, 29 February of a common year, month 13, year 0):
 *   ⛔ an unlawful value is never written
 */
export function birthdayValue(parts: BirthdayParts): string {
  if (!isLawfulBirthdayParts(parts)) {
    throw new RangeError(`not a birthday: day ${parts.day}, month ${parts.month}, year ${parts.year ?? "not stated"}`);
  }
  const md = `${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
  return parts.year === null ? `--${md}` : `${pad(parts.year, 4)}-${md}`;
}

/**
 * The name of a month in a language ("March", "mars"), as the browser's own calendar data words it.
 *
 * @param month 1 to 12
 * @param locale a BCP-47 tag or list; undefined for the reader's own language
 * @returns the month's name, in the form used inside a date ("14 March"), or the number when the month is outside 1 to 12
 */
export function birthdayMonthName(month: number, locale?: string | readonly string[]): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return String(month);
  // Day 14 of a 2000 month at noon UTC, worded in UTC: no zone can move it into another month.
  const parts = new Intl.DateTimeFormat(locale as string | string[] | undefined, { day: "numeric", month: "long", timeZone: "UTC" }).formatToParts(
    new Date(Date.UTC(2000, month - 1, 14, 12)),
  );
  return parts.find((p) => p.type === "month")?.value ?? String(month);
}

/**
 * A birthday as a reader sees it: "14 March", or "14 March 1980" when the year is stated. The month is named in the reader's
 * language; the order is day, month, year, as requested ("14 March 1980").
 *
 * @param raw the stored value
 * @param locale a BCP-47 tag or list; undefined for the reader's own language
 * @returns the words, or null when the stored value is not a lawful birthday (the caller shows it as stored, ⛔ never a guess)
 */
export function birthdayText(raw: unknown, locale?: string | readonly string[]): string | null {
  const parts = parseBirthday(raw);
  if (!parts) return null;
  const dm = `${parts.day} ${birthdayMonthName(parts.month, locale)}`;
  return parts.year === null ? dm : `${dm} ${parts.year}`;
}

/**
 * The vCard 4 `BDAY` value (RFC 6350 6.2.5): `19610314`, or `--0314` with no year (the form named for `.vcf`).
 *
 * @param raw the stored value
 * @returns the vCard value, or null when the stored value is not a lawful birthday (then no `BDAY` line is written)
 */
export function birthdayVcardValue(raw: unknown): string | null {
  const parts = parseBirthday(raw);
  if (!parts) return null;
  const md = `${pad(parts.month, 2)}${pad(parts.day, 2)}`;
  return parts.year === null ? `--${md}` : `${pad(parts.year, 4)}${md}`;
}
