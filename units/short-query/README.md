# short-query

The sentence that says how many more letters a type search still needs. The minimum is an argument. The query text is not in the sentence.

## What this is

`vaultPurposeShortQueryReach(query, minLetters)` builds one sentence:

`Type N more letter(s) to search types that currently resolve.`

`N` is `minLetters - query.length`. Nothing else is computed. The function does not decide that the search must not run. The host decides that, then calls this for the sentence.

## What this is not

- Not the search. No catalogue is read. No request is made.
- Not the empty-box sentence. The app uses a different sentence when the box is empty after trim: it tells the person to type at least the minimum, and it says the sign-in seat is not a pickable type. That sentence was not copied. Do not call this function for a blank box and expect that sentence.
- Not the "no type matched" sentence, and not the "the type vault could not be reached" sentence. Those stayed in the app.
- Not a trim. The app trims the query **before** it calls the original one-argument function. This function does not trim. A space counts as a letter.
- Not a clamp. Zero and a negative number are printed. They are not turned into `1` or hidden.

## How to take it

Package: `@kaigilb/gilbplatformcode-short-query`

```ts
import { vaultPurposeShortQueryReach } from "@kaigilb/gilbplatformcode-short-query";

const sentence = vaultPurposeShortQueryReach(trimmedQuery, minimum);
```

The app's function takes only the query and reads the minimum from its own setting. This function takes the minimum as the second argument so the setting stays in the host. The default in that app is `3`, and an environment value can replace it. Pass the number the host actually uses. Do not bake `3` into the call when the host's minimum is something else.

## What you pass

`query`: the string whose length is counted. Pass the same string the host used when it decided the query was too short. If the host trims first, pass the trimmed string. If the host does not trim, the spaces count, and the sentence will not match a host that trimmed.

`minLetters`: a number. It is not checked. It is not read from the environment.

## What you get

One string. The query itself never appears in it.

| Call | Sentence |
|---|---|
| `("ab", 3)` | `Type 1 more letter to search types that currently resolve.` |
| `("a", 3)` | `Type 2 more letters to search types that currently resolve.` |
| `("a ", 3)` | `Type 1 more letter to search types that currently resolve.` — the space counts |
| `("abcd", 3)` | `Type -1 more letters to search types that currently resolve.` |
| `("", 0)` | `Type 0 more letters to search types that currently resolve.` |

The singular `letter` is used only when `N` is exactly `1`. Every other number, including `0` and `-1`, uses `letters`.

`1.0` is exactly `1` in this language, so it uses `letter`. A value that is not an integer is still printed as that value. `NaN` is printed as `NaN`. This function does not reject those. The host should pass the integer it already validated.

## Examples

```ts
vaultPurposeShortQueryReach("ab", 3);
// "Type 1 more letter to search types that currently resolve."

vaultPurposeShortQueryReach("a ", 3);
// "Type 1 more letter to search types that currently resolve."
```

## Host must supply

The query and the minimum. The host also supplies the other sentences (blank box, nothing matched, vault unreachable). This unit is only the short-query sentence.

The app's order, for a coder who is matching that screen:

1. Trim the query.
2. If the trim is empty, use the blank-box sentence. Do not call this.
3. If the trimmed length is still below the minimum, call this with the trimmed query and that minimum.
4. Otherwise search. This function is not involved.

## Do not

- Do not put the query text into the sentence. A different function in the app does that for the "nothing matched" line. This one must not.
- Do not special-case a negative `N` in the host by rewriting the sentence to "0 more letters". A negative result means the host called this when the query was already long enough. Fix the call. Do not paper over it.
- Do not trim inside a wrapper and also document that as this function's behaviour. Callers that skip the trim will disagree with callers that do not, and both will be calling the same function correctly.
- Do not use this sentence as the reason the sign-in seat was excluded. Seat exclusion is a different sentence, on the blank box.

## Wrong readings

- "It refused the search." It built a sentence. The refusal is the host's `if`.
- "An empty string asks for the blank-box copy." It does not. `("", 3)` is `Type 3 more letters to search types that currently resolve.`
- "The minimum is always 3." It is whatever number the host passed.
- "Spaces are ignored, as in the search." They are ignored only if the host trimmed before the call.

## Source

GilbApp `src/lib/base/vaultPurposeType.ts`, `vaultPurposeShortQueryReach`. The minimum was `MIN_ONTOLOGY_QUERY` there. Here it is the second argument. `VAULT_PURPOSE_BLANK_REACH`, `VAULT_PURPOSE_DEGRADED_REACH`, and `liveReach` were not copied.
