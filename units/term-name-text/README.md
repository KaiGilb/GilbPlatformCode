# term-name-text

Names a skill or an interest from its catalogue address, never by the address itself.

## What this is

Names a skill or an interest from its catalogue address, never by the address itself.

Two functions and two words.

`referentNameOf(iri)` returns the catalogue name of a term address of the form `<ontology origin>/base/t/<Name>` (the ontology origin is `termOrigin()`, read at each call): the last part, split into words by `skill-uri-label` (`.../base/t/StreetLine` is "Street Line"). It returns null for everything else: a storage address (`/base/e/<opaque id>`), another origin, another scheme, a look-alike host, a prefix or a suffix, free text, the empty string.

`termNameWord(noun)` returns the one word for a thing with no name: `SKILL_UNNAMED_TEXT` ("A skill") or `INTEREST_UNNAMED_TEXT` ("An interest").

The order a caller uses: the name the catalogue or the person gave, else `referentNameOf(address)`, else `termNameWord(noun)`. The address and the last part of an address that is not a term address are never shown.

## What this is not

- Not a catalogue read: it makes no request. If you have the term's own label, use it first.
- Not `skill-uri-label`, which splits any address; this unit allows only the ontology's term addresses and gives a word for the rest.
- Not a meaning: the last part of a term address is the term's name in the catalogue, not a definition.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-name-text`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/term-name-text` prints:

```sh
npm install <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing.

## Requests and their servers

None.

## Examples

```ts
import { referentNameOf, termNameWord } from "@kaigilb/gilbplatformcode-term-name-text";

const name = catalogueLabel ?? referentNameOf(skillAddress) ?? termNameWord("skill");
```

## What the host must supply

The ontology origin, set once at start-up with `setTermOrigin` of `term-origin`.

## Module state

None. The origin is read from `term-origin` at each call.

## Do not

- Do not show the address, or the part after the last slash of an address that is not a term address, when this returns null.
- Do not cache the result across a change of the term origin.

## Wrong readings

- "`/base/e/Photography` is a term address." It is a storage address; the answer is null.
- "An unknown origin is probably fine." Only the origin of `termOrigin()` is accepted.

## Where it came from

New code; no line of the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) is copied. It carries Kai's rule (2026-10-31): a skill or an interest is shown by its name, never by an address or an id tail.

## Tests

20 tests in 3 files (`npx vitest run`): `termNameText.test.ts` 6, `exports.test.ts` 1, `hostAgnostic.test.ts` 13, all new.

Mutation checks: 8 mutants of `src/termNameText.ts` (the origin fixed at load, either anchor dropped, a storage address accepted, a non-matching address giving its tail, no trim, no word split, the interest word replaced), 8 killed (the first by a failure at load).
