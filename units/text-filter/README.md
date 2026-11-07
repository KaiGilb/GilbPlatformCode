# text-filter

Keeps a row when every word of the query appears in its fields, optionally ignoring accents, and keeps every row for an empty query.

## What this is

Keeps a row when every word of the query appears in its fields, optionally ignoring accents, and keeps every row for an empty query.

`textHits(query, fields, options?)` answers true or false for one row. The query is split on whitespace into words; the row's fields (null and undefined fields skipped) are joined by a line break; the row is kept when every word is found in that text, ignoring case. A blank query keeps every row, and so does a query that has no words.

- `textHits(query, fields, options = {})`: `fields` is a list of `string | null | undefined`. `options.foldAccents` (default off): when `true`, accents are ignored as well as case, so `cafe` finds `Café`. Any value other than `true` leaves it off.
- `TextHitsOptions`: the type of `options`, `{ foldAccents?: boolean }`.

Pure, synchronous, no state.

## What this is not

- Not a word-prefix match: a word is found anywhere in the text (`ed` is found in `a red boat`).
- Not a ranker or a highlighter: it answers true or false.
- Not the same as the search units `search-tokens` (word prefix, capped, false for an empty query) and `command-match`.
- Not a locale-aware collator: with the fold on it removes marks and lower-cases, nothing more.

## How to take it

Package: `@kaigilb/gilbplatformcode-text-filter`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/text-filter
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import { textHits } from "@kaigilb/gilbplatformcode-text-filter";

textHits("red boat", ["a red boat", null]); // true
textHits("red sail", ["a red boat"]); // false
textHits("", ["anything"]); // true: a blank query keeps every row

textHits("cafe", ["Café rose"]); // false: accents count by default
textHits("CAFE", ["Café rose"], { foldAccents: true }); // true
```

## What the host must supply

Nothing. There is no host, no setting and no state.

## Do not

- Do not turn `foldAccents` on for a query that may be only punctuation like `^` or a backtick: it keeps every row (see "Wrong readings").
- Do not pass a user's text as a regular expression: the unit does a plain substring search, and none is needed.

## Wrong readings

- "`foldAccents` only removes accents." It removes everything the Unicode property `Diacritic` covers, and that includes the plain ASCII `^` and the backtick (and `¨ ¯ ´ · ¸`). A query made only of them folds to nothing and keeps every row: `textHits("^", ["x"], { foldAccents: true })` is `true`. In the text `a^b` the `^` is dropped too, so `a^b` finds `ab`. Without the option they are ordinary characters (`textHits("^", ["x"])` is `false`).
- "The option changes the default." It does not. Without `foldAccents: true` the function is the 0.1.0 function, line for line, and `textHits("cafe", ["Café rose"])` is `false`.
- "An empty query keeps nothing." A blank query keeps every row, with or without the option.
- "The fold understands every script." It is `normalize("NFD")`, removal of marks, and `toLowerCase()`: `ß` stays `ß` and does not match `ss`; `İ` becomes `i` (its dot is a mark).

## Where it came from

The 0.1.0 unit is native to this repository. 0.2.0 adds the optional fold from TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`: `src/ui/match.ts` lines 4-11 (`fold`, and the body of its `textHits`) to `src/textFilter.ts`. The app's file said it was copied from this unit and added the fold; this change brings the fold back.

Changes in 0.2.0, and only these:

- T1. `src/textFilter.ts`: the `fold` const is copied from `match.ts` line 4 (not exported). `textHits` gains a third parameter `options: TextHitsOptions = {}`. When `options.foldAccents === true` it runs `match.ts` lines 7-10 verbatim (fold before trim; the joined text is folded); otherwise it runs the 0.1.0 body unchanged, line for line, after that block.
- `src/index.ts` also exports the type `TextHitsOptions`.
- `package.json`: version 0.2.0, description updated. `unit.json` is new. The README is rewritten to the eight parts.

The default behaviour is unchanged: nothing in this repository imports the unit, and a caller that does not pass `options` gets the 0.1.0 answer.

## Tests

`src/textFilter.test.ts` is the existing test, unchanged. `src/textFilter.fold.test.ts` is new: `screens/search.test.tsx:29-37` of TestFlowerPower ("ignores case and accents, needs every word", five asserts) with `{ foldAccents: true }`; the default still counts accents; composed and decomposed forms; null fields; the quirk (`^`, the backtick and `a^b`); only `true` turns the fold on; and 200 generated pairs, including `Ångström`, `İstanbul`, `ß`, `é` and combining marks, whose answers without the option equal a literal copy of the 0.1.0 function.
