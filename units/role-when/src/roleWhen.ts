/**
 * The date line for a role.
 *
 * Present is shown only when `current` is exactly true AND the end is not a
 * month. A missing end is not Present. A role with a start and no end and
 * current not true shows the start month alone.
 *
 * Months are `YYYY-MM` only. Anything else, including a full date, is not a month.
 */

interface YearMonth {
  y: number;
  m: number;
}

function parseYm(value: string | undefined): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const monthText = match[2];
  const yearText = match[1];
  if (monthText === undefined || yearText === undefined) return null;
  const month = Number(monthText);
  if (month < 1 || month > 12) return null;
  return { y: Number(yearText), m: month };
}

function monthName(ym: YearMonth, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
    new Date(ym.y, ym.m - 1, 1),
  );
}

interface DurationParts {
  years?: number;
  months?: number;
}

function spanLabel(months: number, locale: string | undefined): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  try {
    const Ctor = (
      Intl as typeof Intl & {
        DurationFormat?: new (
          locales?: string,
          options?: { style?: "long" | "short" | "narrow" },
        ) => { format(duration: DurationParts): string };
      }
    ).DurationFormat;
    if (Ctor === undefined) throw new Error("DurationFormat is absent");
    const fmt = new Ctor(locale, { style: "narrow" });
    if (years) parts.push(fmt.format({ years }));
    if (rest) parts.push(fmt.format({ months: rest }));
  } catch {
    if (years) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
    if (rest) parts.push(`${rest} mo${rest === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

/**
 * @param start `YYYY-MM`. Missing or invalid returns `""`.
 * @param end `YYYY-MM`. Missing is not Present by itself.
 * @param current Present only when this is exactly `true` and `end` is not a month.
 * @param now Used only for an ongoing role. Only the year and the month are read. Default: the clock at the call.
 * @param locale Passed to the month name, and to the duration line when the runtime has one. Omit it to use the runtime's language. `""` is the same as omit. A bad tag is not caught.
 *
 * The ongoing word is exactly `Present`. It is not translated.
 * The dash between months is an en dash (`–`, U+2013). The span sits after ` · ` (space, U+00B7, space).
 * The span counts both the start month and the end month. January to January is one month.
 * A range that runs backwards is still shown in the order you passed, and the span is raised to one month. The dates are not swapped.
 */
export function formatRoleWhen(
  start?: string,
  end?: string,
  current?: boolean,
  now: Date = new Date(),
  locale?: string,
): string {
  const loc = locale === undefined || locale === "" ? undefined : locale;
  const from = parseYm(start);
  if (!from) return "";
  const closed = parseYm(end);
  const ongoing = current === true && !closed;
  if (!ongoing && !closed) return monthName(from, loc);
  const to = closed ?? { y: now.getFullYear(), m: now.getMonth() + 1 };
  let months = (to.y - from.y) * 12 + (to.m - from.m) + 1;
  if (months < 1) months = 1;
  const until = ongoing ? "Present" : monthName(to, loc);
  const span = spanLabel(months, loc);
  return span ? `${monthName(from, loc)} – ${until} · ${span}` : `${monthName(from, loc)} – ${until}`;
}
