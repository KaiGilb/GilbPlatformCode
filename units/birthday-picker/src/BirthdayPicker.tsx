/**
 * The birthday picker, one for every app: the person's own card, and a contact's card.
 *
 * Day and month are required, the year is optional; a real picker, ⛔ no free text. The value is
 * PICKED from three lists (day, month, year or "No year"), so nothing typed is ever stored. Save hands back exactly the master's
 * shape (`a:birthday`, `inline-literal:date-or-month-day`): "1961-03-14", or "--03-14" with no year (`birthdayValue` of
 * `birthday-text`, the one writer of that shape). An impossible day (31 February; 29 February of a common year) is said in words and
 * cannot be saved.
 *
 * A stored value that is not a lawful birthday (an older or odd value) is shown as stored ("Now: …") and is ⛔ never replaced unless
 * the person picks a day and saves; the lists then start empty.
 *
 * ⛔ No read and no write here: the app saves through its own write path for the field (`onPick`), as the time-zone picker does.
 * Styling is inline with CSS variables, the host's token first, a second app's name next, then a plain value, as `AddYourOwn`.
 */
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { birthdayMonthName, birthdayText, birthdayValue, daysInBirthdayMonth, parseBirthday } from "@kaigilb/gilbplatformcode-birthday-text";

/** Every word the picker says. */
export const BIRTHDAY_WORDS = {
  day: "Day",
  month: "Month",
  year: "Year",
  noYear: "No year",
  pickDay: "Day…",
  pickMonth: "Month…",
  save: "Save",
  cancel: "Cancel",
  clear: "Clear",
  now: (text: string) => `Now: ${text}`,
  unreadable: (raw: string) => `Now: “${raw}”, which is not a date the card can read. Pick the day to replace it.`,
  needDayMonth: "Pick the day and the month. The year is optional.",
  noSuchDay: (day: number, month: string, year: number | null) => `There is no ${day} ${month}${year === null ? "" : ` ${year}`}.`,
} as const;

const T = {
  ink: "var(--ink, var(--color-ink, #2a2622))",
  soft: "var(--ink-soft, var(--color-ink-secondary, #67635e))",
  surface: "var(--surface, var(--color-card, #ffffff))",
  line: "var(--line, var(--color-line, #d9d4cb))",
  radius: "var(--r-sm, 7px)",
} as const;

/** The 44 px touch-target floor every card control keeps. */
const TARGET = 44;

/** The earliest year the year list offers. A stored year before it is still offered, so opening the picker never drops it. */
export const BIRTHDAY_FIRST_YEAR = 1900;

export interface BirthdayPickerProps {
  /** The field's name ("Birthday"): the group's accessible name. */
  label: string;
  /** The stored value ("1961-03-14", "--03-14"), or "" when none is stored. */
  value: string;
  /** Called with the value to store, in the master's shape. */
  onPick: (value: string) => void;
  onCancel: () => void;
  /** Offered only when something is stored: empties the field. */
  onClear?: () => void;
  /** The language the months are named in; the reader's own when left out. */
  locale?: string;
  /** The year the year list starts from (this year when left out); for tests. */
  thisYear?: number;
}

export function BirthdayPicker({ label, value, onPick, onCancel, onClear, locale, thisYear }: BirthdayPickerProps) {
  const id = useId();
  const stored = parseBirthday(value);
  const [day, setDay] = useState<number | null>(stored?.day ?? null);
  const [month, setMonth] = useState<number | null>(stored?.month ?? null);
  const [year, setYear] = useState<number | null>(stored?.year ?? null);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ n: i + 1, name: birthdayMonthName(i + 1, locale) })), [locale]);
  const years = useMemo(() => {
    const top = thisYear ?? new Date().getFullYear();
    const list: number[] = [];
    for (let y = top; y >= BIRTHDAY_FIRST_YEAR; y--) list.push(y);
    // A stored year outside the list is offered too, so opening the picker never drops it.
    if (stored?.year != null && !list.includes(stored.year)) list.push(stored.year);
    return list;
  }, [thisYear, stored?.year]);

  const chosen = day !== null && month !== null;
  const lawful = chosen && day <= daysInBirthdayMonth(month, year);
  const problem = !chosen
    ? BIRTHDAY_WORDS.needDayMonth
    : !lawful
      ? BIRTHDAY_WORDS.noSuchDay(day, months[month - 1]!.name, year)
      : null;
  const raw = value.trim();
  const current = raw ? (birthdayText(raw, locale) ?? null) : null;

  const save = () => {
    if (!lawful) return;
    onPick(birthdayValue({ day: day!, month: month!, year }));
  };
  // ⛔ Not a <form>: the picker is drawn inside an app's own form (the "+ Add your own" form), and forms do not nest. Enter
  // saves and Escape cancels, as a form would.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      e.stopPropagation();
      save();
    }
  };

  const selectStyle = {
    minHeight: TARGET,
    padding: "6px 8px",
    fontSize: 16,
    color: T.ink,
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: T.radius,
  } as const;
  const labelStyle = { display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: T.soft } as const;
  const textButton = { minHeight: TARGET, padding: "0 4px", background: "none", border: "none", fontSize: 13, fontWeight: 500, textDecoration: "underline", cursor: "pointer" } as const;

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="birthday-picker"
      onKeyDown={onKeyDown}
      style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
    >
      {raw ? (
        <p style={{ margin: 0, fontSize: 12, color: T.soft }} data-testid="birthday-picker-current">
          {current !== null ? BIRTHDAY_WORDS.now(current) : BIRTHDAY_WORDS.unreadable(raw)}
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <label style={labelStyle} htmlFor={`${id}-d`}>
          {BIRTHDAY_WORDS.day}
          <select
            id={`${id}-d`}
            data-testid="birthday-day"
            style={selectStyle}
            value={day ?? ""}
            onChange={(e) => setDay(e.target.value ? Number(e.target.value) : null)}
            autoFocus
          >
            <option value="">{BIRTHDAY_WORDS.pickDay}</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle} htmlFor={`${id}-m`}>
          {BIRTHDAY_WORDS.month}
          <select
            id={`${id}-m`}
            data-testid="birthday-month"
            style={selectStyle}
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{BIRTHDAY_WORDS.pickMonth}</option>
            {months.map((m) => (
              <option key={m.n} value={m.n}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle} htmlFor={`${id}-y`}>
          {BIRTHDAY_WORDS.year}
          <select
            id={`${id}-y`}
            data-testid="birthday-year"
            style={selectStyle}
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{BIRTHDAY_WORDS.noYear}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      {problem ? (
        <p
          style={{ margin: 0, fontSize: 12, color: chosen ? T.ink : T.soft, fontWeight: chosen ? 600 : undefined }}
          role={chosen ? "alert" : undefined}
          data-testid={chosen ? "birthday-no-such-day" : "birthday-need-day-month"}
        >
          {problem}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" onClick={save} disabled={!lawful} data-testid="birthday-save" style={{ ...textButton, color: lawful ? T.ink : T.soft, fontWeight: 700, opacity: lawful ? 1 : 0.6 }}>
          {BIRTHDAY_WORDS.save}
        </button>
        <button type="button" onClick={onCancel} data-testid="birthday-cancel" style={{ ...textButton, color: T.soft }}>
          {BIRTHDAY_WORDS.cancel}
        </button>
        {onClear && raw ? (
          <button type="button" onClick={onClear} data-testid="birthday-clear" style={{ ...textButton, color: T.ink }}>
            {BIRTHDAY_WORDS.clear}
          </button>
        ) : null}
      </div>
    </div>
  );
}
