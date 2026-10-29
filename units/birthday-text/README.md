# birthday-text

Reads, checks and prints a birthday given as day and month, with an optional year.

## What this is

Reads, checks and prints a birthday given as day and month, with an optional year.

Plain functions and one type, no React, no imports. A stored birthday is ONE string in exactly one of two forms: `"1961-03-14"` (the year is stated; ISO 8601 calendar date) or `"--03-14"` (day and month only; the XML Schema gMonthDay form, which vCard `BDAY` also uses). Day and month are always there, and the day must exist in that month: `"--02-29"` is a birthday, `"1961-02-29"` is not. Nothing else is lawful: no `"1961"`, no `"1961-03"`, no time, no zone, no placeholder year `0000`.

- `parseBirthday(raw)`: the parts `{ day, month, year }` (`year` null when not stated), or `null` when `raw` is not exactly one of the two forms (surrounding spaces are trimmed), is not a string, or names a day that does not exist.
- `isLawfulBirthday(raw)`: `parseBirthday(raw) !== null`.
- `isLawfulBirthdayParts(parts)`: true when the month is 1 to 12, the day exists in that month (and year), and a stated year is a whole number from 1 to 9999.
- `daysInBirthdayMonth(month, year)`: 28 to 31; 29 for February with no year (a person born on 29 February has that birthday); 0 for a month outside 1 to 12.
- `birthdayValue(parts)`: the string to store, `"YYYY-MM-DD"` or `"--MM-DD"`. It THROWS a `RangeError` for parts that are not lawful: an unlawful value is never written.
- `birthdayMonthName(month, locale?)`: the month's name in a language (`"March"`, `"mars"`), or the number as text when the month is outside 1 to 12.
- `birthdayText(raw, locale?)`: the words a reader sees, `"14 March"` or `"14 March 1980"` (day, month, year; the month in the reader's language), or `null` when `raw` is not a lawful birthday.
- `birthdayVcardValue(raw)`: the vCard 4 `BDAY` value (RFC 6350 6.2.5), `"19610314"` or `"--0314"`, or `null`.
- Type: `BirthdayParts`.

## What this is not

- Not a date picker or any markup. It draws nothing.
- Not a repair. A value that is not one of the two forms is never fixed here: `parseBirthday` and `birthdayText` answer `null`, and the caller shows the stored text as it is.
- Not a general date library. It knows only day, month and an optional year; no time, no zone.
- Not a reader or writer of a vault. It takes a value and answers a value.

## How to take it

Package: `@kaigilb/gilbplatformcode-birthday-text`

From a clone of this repository, install the unit's folder; no peer comes first:

```sh
npm install <path-to-the-library>/units/birthday-text
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { parseBirthday, birthdayValue, birthdayText, birthdayVcardValue } from "@kaigilb/gilbplatformcode-birthday-text";

parseBirthday("--02-29");                          // { day: 29, month: 2, year: null }
parseBirthday("1961-02-29");                       // null: 1961 was not a leap year
birthdayValue({ day: 14, month: 3, year: null });  // "--03-14"
birthdayText("1980-03-14", "en-GB");               // "14 March 1980"
birthdayText("--03-14", "nb");                     // "14 mars"
birthdayVcardValue("--03-14");                     // "--0314"

const shown = birthdayText(stored) ?? stored;      // an odd stored value is shown as it is
```

## What the host must supply

Nothing. `birthdayMonthName` and `birthdayText` use the runtime's own `Intl.DateTimeFormat`; the month names come from the runtime's calendar data, so a runtime without full ICU data words some languages in English.

## Do not

- Do not read a stored birthday with `Date.parse` or `new Date(...)`. `Date.parse` reads `"--03-14"` as nothing and a full date as midnight UTC, a day off in half the world. Branch on the leading `--`, which is what `parseBirthday` does.
- Do not store a value that did not come from `birthdayValue`. It throws on an unlawful day so that none is written.
- Do not "fix" an odd stored value (`"1961"`, `"14 March"`) by guessing. Show it as stored.

## Wrong readings

- "29 February needs a leap year." Not when no year is stated: `"--02-29"` is lawful. With a year it must be a leap year (`1900` is not, `2000` is).
- "A year is required." It is not. Day and month are required, the year is optional.
- "`birthdayText` throws on a bad value." It answers `null`; only `birthdayValue` throws.
- "The month name is always English." It follows `locale`, or the reader's own language when `locale` is left out.
- "A time zone can move the day." The month name is worded in UTC from a fixed day, so no zone changes it.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`: `src/birthday.ts` lines 1-147 (whole file) to `src/birthday.ts`, copied by script. Comments made generic (a cycle tag, an agent name and a person's name removed); no code change.

`src/index.ts` is new: it re-exports the file. The tests are the source's birthday test (`test/birthday-*.test.ts`), ported (its import path changed), and a second file that pins every export.
