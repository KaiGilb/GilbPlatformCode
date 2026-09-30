# predicate-heading

A heading made from a predicate's own spelling. Not a decision to show the field.

## What this is

`labelForPredicate(predicate)` returns a string.

The local part is everything after the first colon. `a:streetLine` gives `streetLine`. A value with no colon is used whole.

Then:

- each run of `_` or `-` becomes one space,
- a lower-case letter or a digit followed by an upper-case letter is split,
- the ends are trimmed,
- the rest is lowered with `toLowerCase()`, not a locale,
- the first character is made upper case.

Later words stay lower. `streetLine` becomes `Street line`, not `Street Line`.

## What this is not

- Not a list of predicates. A predicate minted tomorrow is headed from its spelling, with no edit here.
- Not the catalogue label. Base's own `a:label` is not read. It is not present for the fields this heading is for.
- Not an admission rule. Whether the field is shown was already decided. Do not hide a field because this heading looks odd.
- Not `label-hyphen`. That unit makes one lower-case hyphenated word. This unit makes a heading.
- Not `skill-uri-label`. A full address is the wrong input here.

## How to take it

Package: `@kaigilb/gilbplatformcode-predicate-heading`

```ts
import { labelForPredicate } from "@kaigilb/gilbplatformcode-predicate-heading";

const heading = labelForPredicate(predicate);
```

## What you pass

The stored predicate, such as `a:streetLine`.

## What you get

The heading, or the original predicate when the local part is empty after trim.

`a:` returns `a:`. A string of spaces returns that string of spaces. The original is not lowered in that case.

`URLValue` has no lower-then-upper pair, so it becomes `Urlvalue`. Do not special-case initials.

`a:b:c` is cut at the first colon only. The heading is `B:c`.

`I` stays `I`, because `toLowerCase` then the first-character upper case round-trips it. This is not `toLocaleLowerCase("tr")`.

A full address is cut at `https:`. The heading is made from `//host/...`, not from the last segment. Pass that address to `skill-uri-label` instead.

## Examples

```ts
labelForPredicate("a:streetLine") === "Street line";
labelForPredicate("a:given_name") === "Given name";
labelForPredicate("URLValue") === "Urlvalue";
labelForPredicate("a:") === "a:";
```

## The host must supply

The predicate string of a field that is already going to be shown.

## Do not

- Do not title-case every word.
- Do not use this result to decide admission.
- Do not pass a full address and expect the last segment.

## Wrong readings

- "`Street line` should be `Street Line`." The second word stays lower.
- "`URLValue` should stay `URL Value`." There is no lower-then-upper pair to split.
- "Empty local part should return an empty string." It returns the original predicate.

## Where it was taken from

MyNetBase `src/lib/card/entitledCard.ts`, `labelForPredicate` only.
