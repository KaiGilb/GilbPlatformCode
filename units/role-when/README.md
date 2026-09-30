# role-when

The date line for one role. A missing end date is not the word Present.

## What this is

`formatRoleWhen(start, end, current, now, locale)` turns two month strings into one line.

- No usable start month → `""`. Draw nothing. Do not write "Unknown".
- Start month, no end month, and `current` is not exactly `true` → the start month only. Example: `Jan 2011`.
- Start month, no end month, and `current` is exactly `true` → start, then Present, then how long it has run. Example: `Aug 2025 – Present · 1 yr 2 mos`.
- Start month and end month → both months and the length, whether or not `current` is true. The end wins. The line does not say Present.

A month is exactly `YYYY-MM`. `2020-01` is a month. `2020-1`, `2020-01-15`, `Jan 2020`, and `2020-13` are not.

## What this is not

- Not a store for the job title, the organisation, or a private bag of extra fields. Those stay on the employment record. The old key `employmentExperience` is not in this package. Do not revive it.
- Not a translator of the word Present. That word is always the English `Present`. Month names follow `locale`. The duration line uses the runtime's narrow duration format when it has one, and otherwise `1 yr` / `2 yrs` / `1 mo` / `2 mos`.
- Not a sorter. If the end month is before the start month, the line still shows start then end, in the order you passed. The length is raised to one month. The dates are not swapped, and this is not reported as an error.

## How to take it

Package: `@kaigilb/gilbplatformcode-role-when`

```ts
import { formatRoleWhen } from "@kaigilb/gilbplatformcode-role-when";

const line = formatRoleWhen(start, end, current);
```

Path: `units/role-when/`.

The app calls it with four arguments or fewer. The fifth, `locale`, is optional. Omit it and the month names follow the runtime language, which is what the app does today.

## What you pass

| Argument | Meaning |
|---|---|
| `start` | `YYYY-MM`, or anything else (treated as missing). Trimmed. |
| `end` | `YYYY-MM`, or missing. An end that does not parse is treated as no end. The junk text is not shown. |
| `current` | Present only when this is exactly `true`. `false`, `undefined`, and any other value are not Present. The string `"true"` is not `true`. |
| `now` | A `Date`, used only when the role is ongoing. Only `getFullYear()` and `getMonth()` are read. The day is ignored. Default: `new Date()` at the moment of the call. Pass a fixed date in a test, or two calls a month apart will differ. |
| `locale` | A locale tag such as `"en-US"`, or omit it. `""` means omit. A tag the runtime rejects is not caught. Do not pass a language name like `"English"`. |

## What you get

A string. Either `""` or one line.

Characters, so a test can match them:

- The separator between the two months is an en dash, U+2013, with spaces: ` – `. It is not a hyphen-minus.
- The length sits after space, middle dot U+00B7, space: ` · `.
- Ongoing word: `Present`.

The length counts both the start month and the end month. January 2020 through January 2020 is `1 mo`, not zero. January through March 2021 is 15 months: `1 yr 3 mos` on the fallback. January through December of the same year is `1 yr`.

When the runtime has `Intl.DurationFormat`, the length uses that, style `narrow`, in `locale`. The words then depend on the engine (`1y` and `1 yr` are both possible). Do not snapshot the length words unless you know the engine. Snapshot the months and the word Present. The tests in this package assert the fallback words only when `DurationFormat` is absent.

A range always includes a length today, because a computed length below 1 is raised to 1, and 1 month always produces a span word. The branch that omits the span is kept so the line still matches the app if a formatter ever returns an empty span.

## Examples

```ts
const now = new Date(2026, 8, 27); // 27 Sep 2026. The day is not read.

formatRoleWhen("2011-01", "", false, now, "en-US");
// "Jan 2011"

formatRoleWhen("2025-08", "", undefined, now, "en-US");
// "Aug 2025"

formatRoleWhen("2025-08", "", true, now, "en-US");
// "Aug 2025 – Present · …"   length runs to September 2026

formatRoleWhen("2024-07", "2025-09", true, now, "en-US");
// "Jul 2024 – Sep 2025 · …"  current true does not say Present, because the end parsed

formatRoleWhen("2020-01-15", undefined, true, now, "en-US");
// ""   a full date is not a month

formatRoleWhen("2021-06", "2020-01", false, now, "en-US");
// "Jun 2021 – Jan 2020 · 1 mo" on the fallback. Not swapped.
```

## What the host must supply

The start month, the end month, and whether the record says the role is current. Those three facts live on the employment entity. This function does not read a record.

If you omit `now`, you are choosing the clock. A list rendered on the server and again in the browser can differ at a month boundary. Pass the same `now` if the two renders must match.

## Do not

- Do not treat a blank end as Present. That is the mistake this function exists to prevent. Present requires `current === true`.
- Do not show Present beside a parsed end. The end is a closed month. `current: true` does not override it.
- Do not pass a day (`YYYY-MM-DD`) and expect the day to appear. It will not parse, and the line will be blank if that was the start.
- Do not copy a private metadata key into the profile to store this line. Store the months. Format them when you draw.

## Wrong readings

- "The line is blank, so the role has no dates." It is blank when the start is missing or not `YYYY-MM`. An end can be missing and the line can still show the start.
- "`current: true` always means Present." Only when the end is not a month. A typo in the end (`"soon"`) does not parse, so it behaves as no end, and Present shows. A real `YYYY-MM` hides Present.
- "The length is the difference in months." It includes both ends. One month of work is `1 mo`, not `0`.

## Where it came from

MyNetBase `src/model/experience.ts`, function `formatRoleWhen`. The month rules are unchanged. `locale` was added as an optional fifth argument so a test, or a screen with a chosen language, can pin the month names. The app's four-argument call still means "use the runtime language".
