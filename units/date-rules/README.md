# date-rules

The year range a level's date may take (1900 to 2200), the check for a real calendar day, and the check for whether a date field may be written.

## What this is

The year range a level's date may take (1900 to 2200), the check for a real calendar day, and the check for whether a date field may be written. Plain functions and constants, no React.

- `MIN_YEAR` (1900) and `MAX_YEAR` (2200).
- `YEAR_RANGE_SENTENCE`: the words for the year alert, `Year must be 1900–2200` (with an en dash).
- `yearOutOfRange(text)`: true when the text starts with four digits that name a year outside 1900..2200. It trims the text first and reads only the first four digits, so `"20261"` reads as 2026. Text that does not start with four digits is not out of range.
- `completeDate(value)`: true for a real calendar day written `YYYY-MM-DD`. Empty and half-typed values are false.
- `levelDateWritable(when)`: true when a level's date field may be written: `""` (no date), or the shape `YYYY-MM-DD` with a year in range.

`levelDateWritable` is the exact negation of the guard a host uses to refuse a write:
`when !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(when) || yearOutOfRange(when))`.

## What this is not

- Not a date parser or formatter. It returns booleans only.
- Not a calendar check in `levelDateWritable`. `"2026-02-30"` is writable there (shape only). Use `completeDate` when the day must be real.
- Not a year range in `completeDate`. `"2400-02-29"` is a real day there.
- Not the date input. The input field is the `level-date-input` unit, which takes this one as a peer.

## How to take it

Package: `@kaigilb/gilbplatformcode-date-rules`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/date-rules
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. It has no dependency.

## Examples

```ts
import { completeDate, levelDateWritable, yearOutOfRange, YEAR_RANGE_SENTENCE } from "@kaigilb/gilbplatformcode-date-rules";

yearOutOfRange("0202-05-01");     // true
yearOutOfRange("2031-10-27");     // false
YEAR_RANGE_SENTENCE;              // "Year must be 1900–2200"

completeDate("2026-10-27");       // true
completeDate("2026-02-30");       // false
completeDate("0050-06-15");       // false (see Wrong readings)

levelDateWritable("");            // true  (no date)
levelDateWritable("2026-02-30");  // true  (shape only)
levelDateWritable("0202-01-01");  // false (year out of range)
levelDateWritable("2026-10");     // false (half typed)
```

## What the host must supply

Nothing. The functions read only their argument.

## Do not

- Do not use `levelDateWritable` to decide that a day exists. It does not look at the calendar.
- Do not use `yearOutOfRange` on text that is not a date and expect "invalid": it answers false when no four digits lead.
- Do not change the range in a copy. Ranges are this unit's rule; a new range is its own change.

## Wrong readings

- "`completeDate` accepts any real year." It does not for years 0 to 99: `Date.UTC` maps those to 1900..1999, so `"0050-06-15"` reads back as a different year and is false. This is the behaviour, kept as it is.
- "`levelDateWritable` is `completeDate` plus the range." It is not: `"2026-02-30"` is writable and not complete.
- "`yearOutOfRange` trims nothing before the digits." It trims the whole text first, so `"  2300"` is out of range.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`:

- `src/components/records/PlanValueGraph.geometry.ts` lines 184-195: `MIN_YEAR`, `MAX_YEAR`, `YEAR_RANGE_SENTENCE`, `yearOutOfRange`. Comment scrubbed; no code change.
- `src/components/records/PlanFunctionForm.tsx` lines 308-316: `completeDate`. Code is verbatim; the one change is that the function is now exported (it was private there).
- `levelDateWritable` is new here: the negation of the write guard in `src/components/records/PlanValueGraph.tsx` line 600 (`commitWhen`).
