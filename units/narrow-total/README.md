# narrow-total

The number to show after this page threw some rows away.

The server said how many rows matched. This page received some of them and hid some. The figure on screen is the server figure minus the ones this page hid. It is not a second count of the rows you rendered, and it is not zero when the server forgot to send a total.

## What this is

```ts
narrowTotal(serverTotal, seen, kept);
```

- `serverTotal` — the count the server reported for the whole result, or `undefined` when it sent no number.
- `seen` — how many rows the server sent on this page, before you dropped any. Not how many you parsed successfully.
- `kept` — how many of those rows the screen will show.

## What this is not

- Not `result-total`. That unit chooses the words exact, lower bound, or guess, so a bound is never painted as a bare number. This unit is only the arithmetic.
- Not `page-window`. That unit decides whether to ask for another page. This unit does not.
- Not `record-plane`. That unit decides which rows to drop. Call it first, then pass the counts here.

## How to take it

Package: `@kaigilb/gilbplatformcode-narrow-total`

```ts
import { narrowTotal } from "@kaigilb/gilbplatformcode-narrow-total";
```

Path: `units/narrow-total/`.

## What you pass

Three numbers, except `serverTotal` may be `undefined`.

`seen` must be the server's page length, including rows you later failed to parse or chose to hide. If you pass the count after parsing, the hidden rows never enter the subtraction, and the total stays too high.

## What you get

When `serverTotal` is not a number — `undefined`, `null` if you pass it from a loose caller, a string — the answer is `kept`. The drop is not subtracted. A missing total must not become `0` beside rows that are on screen, and it must not become `2 * kept - seen`.

`NaN` is a number. It is not the missing-total branch. The result is `NaN`. Do not coerce `NaN` to `undefined` inside this function. Fix the caller that produced it.

When the server did send a number:

`serverTotal - (seen - kept)`, and never below 0.

`narrowTotal(100, 20, 15)` is `95`. Twenty arrived, five were hidden, so the whole-result figure drops by five. Rows on pages you never fetched are not in `seen`, so this is a lower bound, not the exact filtered total. Prefer it to the raw server total, which promises rows the screen will never show. Do not label it as exact.

`narrowTotal(42, 20, 20)` is `42`. Nothing dropped, so the server figure passes through.

`narrowTotal(0, 1, 0)` is `0`. It does not go negative.

`narrowTotal(1, 0, 5)` is `6`. `kept` larger than `seen` is not clamped back to the server total. That input means the counts disagree. Do not "fix" it by returning `min(serverTotal, kept)`.

## What the host must supply

The server's count, the page length the server sent, and how many rows survived the filter. This unit does not see the rows.

## Do not

- Do not write `(serverTotal ?? kept) - (seen - kept)`. That subtracts twice when the total is missing, and it is the bug this function's early return exists to prevent.
- Do not pass the post-parse length as `seen`.
- Do not show the result as "exactly N in the vault" on a paged list.

## Wrong readings

- "No total from the server means zero." It means you only know `kept`.
- "95 means the filter removed five in the whole vault." It means this page removed five. Other pages were not looked at.
- "The result is never larger than the server total." It is, when `kept` exceeds `seen`.

## Where it came from

GilbApp `src/lib/base/recordPlane.ts`, `narrowTotal`.
