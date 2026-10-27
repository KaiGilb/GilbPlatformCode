/** The years a level's date may take (a mistyped year such as 0202 is "no date", not a Timeline that spans 1800 years). */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;
export const YEAR_RANGE_SENTENCE = `Year must be ${MIN_YEAR}–${MAX_YEAR}`;

/** True when a `YYYY...` text names a year outside {@link MIN_YEAR}..{@link MAX_YEAR}. */
export function yearOutOfRange(s: string): boolean {
  const m = /^(\d{4})/.exec((s ?? "").trim());
  if (!m) return false;
  const y = Number(m[1]);
  return y < MIN_YEAR || y > MAX_YEAR;
}

/** A real calendar day. Empty and half-typed values are not. */
export function completeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * True when a level's date field may be written: empty (no date), or a `YYYY-MM-DD` shape whose year is in range.
 * It is the exact negation of the host's "do not write" guard
 * `when !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(when) || yearOutOfRange(when))`. Shape only; it does not check the calendar (see {@link completeDate}).
 */
export function levelDateWritable(when: string): boolean {
  return when === "" || (/^\d{4}-\d{2}-\d{2}$/.test(when) && !yearOutOfRange(when));
}
