# text-find-words

The two sentences under an inside-text find. One says what that find reaches. The other says what the answer was.

## What this is

- `textFindReachClause` — the sentence that replaces "it does not search inside the text", once a surface actually does.
- `textFindResultSentence` — the sentence under the hits.

Both take the family's own nouns. There is no switch on a type name inside this unit.

## What this is not

- Not the search. Nothing here calls the vault.
- Not `units/result-total`. That unit reads a response body and turns a total into words. This unit only speaks the find sentences. It contains a private copy of `provesEmpty` and `formatResultTotal` so the sentences stay the same. Those two copies must stay in agreement with `units/result-total`.
- Not a claim that a record of this family does not exist. Neither sentence says that.
- Not the 300 millisecond wait. The reach sentence says "stopped for a moment". The number 300 is not in the sentence. Do not add it.

## How to take it

Package: `@kaigilb/gilbplatformcode-text-find-words`

```ts
import {
  textFindReachClause,
  textFindResultSentence,
} from "@kaigilb/gilbplatformcode-text-find-words";
```

Path: `units/text-find-words/`.

Build the total with `readResultTotal` from `units/result-total`, and pass that object here. Pass `null` when that reader returns `null`. Do not pass `body.count` as a bare number. A number has no kind, and this function will not take one.

## What you pass

`textFindReachClause` reads four fields. You may pass the family's object if it has them. Extra fields on that variable are ignored.

| Field | Role |
|---|---|
| `unitLabelLower` | Singular noun, already lower case. Example: `rule`. |
| `unitPlural` | Plural. Example: `rules`. |
| `unitPluralCapitalised` | The same plural with a capital. Example: `Rules`. |
| `bodyAttr` | The attribute name without `a:`. Example: `ruleStatement`. The sentence writes `a:` in front of it. |

`textFindResultSentence` reads `unitLabelLower`, `unitPlural`, and `unitPluralCapitalised`. It does not read `bodyAttr`.

| Argument | Role |
|---|---|
| `hits` | How many of the returned rows belong to this family. |
| `returned` | How many ids the vault returned, of every kind. |
| `query` | The query as typed. This function does not trim it. |
| `totalMatches` | `{ kind, value }`, or `null`, or `undefined`. `kind` is `exact`, `atLeast`, or `approximate`. |

`SEARCH_PAGE_SIZE_DISCLOSED` is 20. `TEXT_FIND_MIN_QUERY` is 2. They are written into the reach sentence. They are not arguments. If the server page is no longer 20, this sentence is the one that is wrong. Do not pass a different number.

## What you get

A string. The quotes around the query and around the examples `qualit`, `qualities`, and `ities` are curly quotes. The breaks in the reach sentence are em dashes. The no-entry sign in the reach sentence is part of the sentence. Do not straighten any of these.

### When the absence sentence is allowed

The absence sentence starts `The vault found nothing matching`.

It is used only when:

1. the total is `exact` and the value is `0`, or
2. there is no total (`null` or `undefined`) and `returned` is `0`.

An exact zero wins even if `hits` and `returned` are not zero.

These do **not** license it:

- `atLeast` with value `0` (the words are `more than 0`)
- `approximate` with value `0` (the words are `about 0`)
- a missing total when `returned` is greater than 0

A bound or an estimate means the vault did not establish that the set is empty. Saying "found nothing" on those would assert an absence nobody measured.

### When there is no total, and something was returned

`hits === 0`: the vault returned the top `returned` matches and none of them is this family's noun. It says `none of those N is a rule`, including when N is not 1. It does not say the family has no match.

`hits === 1`: `Showing 1 rule from the top N matches`. The capitalised plural is lower-cased in the second sentence (`Rules` becomes `rules`).

`hits` anything else: `Showing N rules`, using `unitPlural`, and the lower-cased `unitPluralCapitalised` in the warning.

### When there is a total

`hits === 0`: `ranked <phrase> match` or `matches`. The singular `match` is used only when the total is `exact` and the value is `1`. A bound of 1 still says `matches`, so the words are `more than 1 matches`. That is the shipped grammar. Do not correct it.

`hits > 0` and nothing is hidden: `Showing … from the <phrase> match` or `matches`. Singular only when the exact value is `1`.

Something is hidden when the total is **not** `exact`, or when the exact value is **greater than** `returned`. A bound always says more is not shown, even when the bound's value equals `returned`. An exact value that is smaller than `returned` does **not** say more is hidden. Do not treat that odd case as a bug.

The hidden-rows sentence always says `matches` after the phrase. It does not switch to `match` for one. It uses `unitPluralCapitalised` as you passed it. It does **not** lower-case it. Only the no-total sentence lower-cases that word.

The numeral inside the phrase follows the runtime's `toLocaleString`, the same way `units/result-total` does. Do not pre-format the number and pass a string.

## Examples

```ts
const family = {
  unitLabelLower: "rule",
  unitPlural: "rules",
  unitPluralCapitalised: "Rules",
  bodyAttr: "ruleStatement",
};

textFindReachClause(family);
// names a:ruleStatement, one page of 20, and 2 letters

textFindResultSentence({
  family,
  hits: 3,
  totalMatches: { kind: "exact", value: 0 },
  returned: 3,
  query: "qual",
});
// absence sentence, because the total is an exact zero

textFindResultSentence({
  family,
  hits: 0,
  totalMatches: { kind: "atLeast", value: 0 },
  returned: 0,
  query: "qual",
});
// NOT the absence sentence. It says "more than 0 matches".

textFindResultSentence({
  family,
  hits: 2,
  totalMatches: { kind: "atLeast", value: 5 },
  returned: 5,
  query: "qual",
});
// warns that Rules ranked below the top 5 are not shown, even though 5 were returned
```

## What the host must supply

The nouns for this family, the hit count, the returned count, the query, and the disclosed total. The page size and the minimum letters stay the constants in this unit.

## Do not

- Do not say "no such rule exists" in a replacement sentence. These sentences refuse that.
- Do not treat `total.value === 0` as empty without reading `kind`.
- Do not trim the query here. Trim before you call, if the screen trims.
- Do not escape a curly quote inside the query. It is inserted as given.
- Do not lower-case `unitPluralCapitalised` yourself before the truncation sentence. That sentence keeps your capital. The no-total sentence lowers it itself.

## Wrong readings

- "Zero means nothing matched." Only an exact zero, or no total together with zero ids returned.
- "The sentence says the family is absent." It says nothing matched what was searched.
- "A full page of a bound means the list is complete." A bound always says more is not shown.
- "The capital plural is always lowered." Only in the branch where the vault reported no total and there is at least one hit.

## Where it came from

GilbApp `src/lib/base/standardsTextFind.ts`, `textFindReachClause` and `textFindResultSentence`. The number helpers match GilbApp `src/lib/base/resultTotal.ts`.
