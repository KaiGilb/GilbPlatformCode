# time-line

## What this is

The one line an AI agent writes to say how long until it needs the person again, its seven values, and how a loosely written value is snapped to one of them.

Pure TypeScript: no React, no DOM, no Node API, no runtime dependency; it runs in a browser and in Node. The exact form, the seven values and the snapping live here and nowhere else, so the chat's time bar and the Claude Code bridge and client read the same line the same way.

The line, character for character:

```
[Time until I need you: <value>]
```

`<value>` is one of: `1 min`, `5 min`, `10 min`, `30 min`, `1 hour`, `3 hours`, `5 hours +`. The agent writes it alone on its own line. The reader is loose: the letter case of the head and the value, outer spaces, a missing space after the colon, and values such as `30 MIN`, `5hours+`, `1h30`, `about 45 minutes`, `1,5 hours` are read and snapped to the nearest of the seven (nearest by place on the bar, a tie takes the longer).

## Exports

All from `@kaigilb/gilbplatformcode-time-line`.

- `TIME_VALUES`: the seven values, shortest first. `TIME_VALUES[4]` is `"1 hour"`.
- `TimeValue`: the union of the seven strings.
- `TIME_VALUE_MS`: each value in milliseconds. `TIME_VALUE_MS["10 min"]` is `600000`.
- `isTimeValue(v: unknown): v is TimeValue`: true only for a string that is exactly one of the seven. `isTimeValue("5 min")` is true; `"toString"`, `"5 MIN"`, `" 5 min"`, a number and `null` are false.
- `TIME_MARKS` and the type `TimeMark`: the seven marks of the bar, `{ label, ms, position }`, from `"5 hours +"` at position 0 to `"1 min"` at 6/7.
- `positionOf(msLeft)`: where a time left sits on the bar, 0 (5 hours or more) to 1 (done). `positionOf(7_200_000)` is `1.5 / 7`.
- `snapToValue(ms)`: the value whose place on the bar is nearest. `snapToValue(7_300_000)` is `"3 hours"`; NaN, 0 and negatives give `"1 min"`; `Infinity` gives `"5 hours +"`.
- `TIME_LINE_HEAD`: `"[Time until I need you:"`.
- `timeLine(value)`: the exact line. `timeLine("30 min")` is `"[Time until I need you: 30 min]"`.
- `parseTimeLine(line)`: reads ONE line: `{ value }`, `"unreadable"` (a Time line whose value cannot be read) or `null` (not a Time line). Never throws. `parseTimeLine("[time until i need you: 1h30]")` is `{ value: "1 hour" }`.
- `extractTimeLines(text, { streaming? })`: takes the Time lines out of a text: `{ text, values, hidden }`. A line inside a fenced code block is never read or removed. `extractTimeLines("Hi\n[Time until I need you: 5 min]")` is `{ text: "Hi", values: ["5 min"], hidden: 1 }`.

## The fixture

`fixtures/time-lines.json` is the one file every consumer runs against its own reader: `{ "schema": 1, "cases": [ { "name", "text", "values", "outText", "note"? } ] }`. `values` and `outText` are what `extractTimeLines(text)` returns as `values` and `text`. Each was produced by running the code, then frozen. A consumer in TypeScript:

```ts
import fixture from "@kaigilb/gilbplatformcode-time-line/fixtures/time-lines.json";
import { extractTimeLines } from "@kaigilb/gilbplatformcode-time-line";

for (const c of fixture.cases) {
  const r = extractTimeLines(c.text);
  expect(r.values).toEqual(c.values);
  expect(r.text).toBe(c.outText);
}
```

A reader in another language runs the same cases and compares the same two fields. `src/fixtures.test.ts` is the unit's own run.

## Known limits

Both are kept as they behave today, marked with `"note": "known limit, accepted 2026-11-27"` in the fixture. A change to either is a decision, not a fix.

1. Inside a top-level fenced code block, a line such as `> ```` closes the block early (the reader takes the quote mark off before it looks for the closing fence), so a Time line after it is read.
2. `1. [Time until I need you: 5 min]**` leaves `1.**`: the list mark and the stray bold mark stay.

## What is not in it

- The bar's run: `startRun`, `reEstimate`, `TimeRun`, `viewRun`, `TimeLeftView`, `msAt`, `leftText`, `overText`, `TIME_TOP_MS` and `TIME_DONE_POSITION` of GilbApp's `timeScale.ts`. They stay in the app; the app will import `TIME_MARKS` and `positionOf` from this unit.
- No clock, no storage, no React, no rule text of the agent's prompt.

## How to take it

Package: `@kaigilb/gilbplatformcode-time-line`. It has no dependency on another unit. Install it from a clone of the library, or from a packed file (`npm pack` in the unit):

```sh
npm install <path-to-the-library>/units/time-line
```

The package ships TypeScript source (`src/`) and `fixtures/`; your bundler compiles the source. Tests (`src/*.test.ts`, node environment): `timeLine.test.ts` and `timeValues.test.ts` moved from the app's `timeLine.test.ts` and `timeScale.test.ts`; `qatimeLine.test.ts` and `qatime2Line.test.ts` are the tester's files with imports fixed; `fixtures.test.ts`, `linearTime.test.ts` and the `isTimeValue` tests are new; `hostAgnostic.test.ts` is the same check test as the other units.

## Where it came from

`KaiGilb/GilbApp` (private repo), commit `4d30c06ac28d0f9270ca7e0b29a1e3537bbfd859`, copied by script from `src/lib/timeLeft/`:

- `timeLine.ts` lines 1-9 and 28-34 and 61-451 to `src/timeLine.ts`;
- `timeLine.ts` lines 13-26 and 36-59 to `src/timeValues.ts`;
- `timeScale.ts` lines 10-12, 16-22 and 30-44 to `src/timeValues.ts`.

Named changes, and only these:

1. `snapToValue` moved from `timeLine.ts` to `src/timeValues.ts`, and the scale points (`TIME_MARKS`, `TimeMark`, the eight points, `positionOf`) moved there from `timeScale.ts`, so the unit owns the values and the scale in one file; names and behaviour are unchanged. `TIME_TOP_MS` is a private constant here (exported in the app);
2. `isTimeValue` is added;
3. the header comment of `src/timeLine.ts` is the app's, and `src/timeValues.ts` has its own; the comment above `TIME_MARKS` and `positionOf` is as in the app; the import of `snapToValue` and `TimeValue` reads from `./timeValues`;
4. what only the bar needs stays in the app (listed under "What is not in it").

`src/index.ts`, `fixtures/time-lines.json` and the tests named above are new.
