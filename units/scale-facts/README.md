# scale-facts

The scale fields on a relation the host already holds: unit, rate, endpoints, the from/until window, and the three dated levels.

Nothing is fetched. Dates use the machine's local calendar, not UTC. When and where a relation happened is `occurred-at`, not this unit. A scale document's list of level codes is `scale-doc`, not this unit.

## What this is

| Function | You pass | You get |
|---|---|---|
| `todayIsoDate` | A `Date`, or nothing for now. | `YYYY-MM-DD` in the local calendar. |
| `nowDateTimeLocal` | A `Date`, or nothing. | `YYYY-MM-DDTHH:mm` local. No seconds. No zone. |
| `emptyScale` / `emptyDatedLevel` | A `Date`, or nothing. | Blank fields, with today's local date on each level. |
| `isTimeUnit` | A unit string. | Whether the from/until window applies. |
| `parseContextWindow` | The stored context text. | `{ from, until, body }`. |
| `formatContextWindow` | Body, from, until. | The text to store. |
| `parseDatedLevel` | The level value, and an optional separate when. | `{ when, value }`. |
| `scaleFromExtras` | The relation's extra facts. | A `RelationScale`. |
| `extrasFromScale` | A `RelationScale`. | Facts to write. |
| `scaleHasContent` | A `RelationScale`. | Whether anything but endpoints has text. |

## What this is not

- Not `scale-doc`. That unit reads `a:valueSet` and `a:example` off a scale document. This unit reads the slots on a relation.
- Not `occurred-at`. Do not put time-and-place points in `a:paramSlot`.
- Not a new predicate. These are fields on the relation you already have.

## How to take it

Package: `@kaigilb/gilbplatformcode-scale-facts`

```ts
import { extrasFromScale, scaleFromExtras } from "@kaigilb/gilbplatformcode-scale-facts";
```

Path: `units/scale-facts/`.

`nowDateTimeLocal` must stay the same shape as the copy in `occurred-at`. A minute string with no seconds and no `Z`.

## What you pass

Facts the host already loaded. For each text field the first key that holds a string wins, including an empty string. An empty string does not fall through to the next spelling of that field. A finite number becomes text, and `0` is kept. An `{ "@value": string | number }` is read. An array is not.

Context is read from `a:paramSlot`, then `a:context`, then the bare names. It is written only as `a:paramSlot`.

Endpoints are read from `a:endpoint`, `a:endpoints`, `endpoint`, or `endpoints`. They are written only as `a:endpoint`.

Levels are `a:status`, `a:tolerable`, and `a:goal`, with matching `When` fields.

## What you get

`isTimeUnit` is true for second, minute, hour, day, week, month, year, the short forms `s`, `sec`, `min`, `h`, `hr`, `ms`, and the word `time`. It is false for blank, `%`, `percent`, `$`, and any text that contains `kilo` or `gram`. `kilosecond` is false. `kg` is false because it is not in the time list, not because of those letters. The check is on the trimmed, lowercased unit.

`parseContextWindow` is case-insensitive on `From:` and `Until:`. The last From line wins. The last Until line wins. Those lines are removed from the body. The body is joined with newlines and trimmed as a whole. A line `From:` with nothing after it sets from to `""` and is not body text.

`formatContextWindow` does not look inside the body. If the body already contains a From line, you will store two. Parse first if you need a clean round trip. Order is From, then Until, then body. Blank parts are omitted.

`parseDatedLevel("[2020-01-02]  hello")` is when `2020-01-02` and value `hello`. The date shape is four digits, a dash, two digits, a dash, two digits, inside brackets. It is not checked as a real calendar day. `2020-13-99` matches. When the value matches, the separate when is ignored.

When the value does not match, when is the first 10 characters of the separate when, even if they are not a date. `soonest!!!extra` becomes `soonest!!!` (that is 10 characters, not 9). A number is turned into text first, then cut to 10 characters.

`scaleHasContent` does not look at endpoints. A scale whose only text is endpoints is empty by this test. Do not add endpoints to the test to "fix" that. The app uses the result to decide whether there is a scale to keep, and endpoints alone did not count.

`extrasFromScale` trims what it writes. A level with no value writes nothing, even when it has a date. A level with a value and no date writes the value only. Status, tolerable, and goal are separate. An empty goal does not clear a status you set on the object. It simply omits the goal keys.

## Examples

```ts
parseContextWindow("From: first\nFrom: second\nKeep\nuntil: end");
// { from: "second", until: "end", body: "Keep" }

formatContextWindow("From: already", "2020", "2021");
// "From: 2020\nUntil: 2021\nFrom: already"

scaleFromExtras({ "a:tag": "", tag: "hidden", "a:unit": 0 });
// tag is "", unit is "0"

isTimeUnit(" Hours "); // true
isTimeUnit("kilogram"); // false
```

## What the host must supply

The relation extras. A clock, if you care which day "today" is in tests. The local zone is the machine's zone. Do not pass a UTC string and expect `todayIsoDate` to read it as UTC. It uses `getFullYear`, `getMonth`, and `getDate`.

## Do not

- Do not write `a:context` on the way out. Write `a:paramSlot`.
- Do not write `a:endpoints` on the way out. Write `a:endpoint`.
- Do not treat an empty `a:tag` as missing. It blocks `tag`.
- Do not move occurred-at points into this object.

## Wrong readings

- "Endpoints mean the scale has content." Not for `scaleHasContent`.
- "From: inside the body is updated." `formatContextWindow` prepends. It does not edit the body.
- "The bracket date is validated." Only the character shape is. The separate when is not validated at all.
- "This is the scale document." Level codes on a scale document are `scale-doc`.

## Where it came from

GilbApp `src/lib/base/relationPlanguage.ts`, the scale readers and writers. The time-and-place points in that file are `occurred-at`.
