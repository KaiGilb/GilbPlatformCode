# online-card-link

Reading the link that joins a holder's record of a person to that person's own online card, from the record's served facts.

## What this is

Reading the link that joins a holder's record of a person to that person's own online card, from the record's served facts.

A pure function. The link is the existing `sameAs` fact on the holder's own record (a single-valued reference), written by the holder only. It grants nothing: the platform's one sameAs-to-access bridge reads `owl:sameAs`, a different term, which this unit never reads.

- `readLink(served)`: the link as a record's served facts carry it, as a `LinkReading`: `{ state: "none" }`, `{ state: "linked", target }`, `{ state: "ambiguous" }` or `{ state: "malformed" }`. Only a REFERENCE counts (`{ "@id": <address> }`): a plain string in the slot is `malformed`, never reinterpreted as a link. Two different references are `ambiguous` (the term is single-valued): no card is chosen, and the newest is never taken.
- Types: `LinkReading`.

## What this is not

- Not the write. `linkWrite`, `unlinkWrite`, `LinkWrite`, `LinkRefusedError` and `LINK_SLUG` of `gilb-stakeholders`' `onlineCard/link.ts` are not reached by the Plan card and are not here.
- Not the online-card resolver, controller or finder (`onlineCard/` of the package): it does not fetch a card or follow the link.

## How to take it

Package: `@kaigilb/gilbplatformcode-online-card-link`

From a clone of this repository, install the unit's folder; no peer comes first:

```sh
npm install <path-to-the-library>/units/online-card-link
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { readLink } from "@kaigilb/gilbplatformcode-online-card-link";

const reading = readLink({ sameAs: { "@id": "https://kari.platform.example.test/vault" } });
if (reading.state === "linked") console.log(`the online card is at ${reading.target}`);
```

## What the host must supply

Nothing. No setting, no start-up call, no credential. Give it the record's facts as the vault served them (bare keys, references kept as `{ "@id" }`).

## Module state

None. The unit holds one private constant.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so the file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not read `owl:sameAs` as the link; it grants access.
- Do not take the newest of two references. Two are `ambiguous`, and the caller must not choose.
- Do not reinterpret a plain string as a link.

## Wrong readings

- "A plain string `sameAs` is a link to that address." It is `malformed`: a text value must not be able to name a card.
- "The same target under `sameAs` and `a:sameAs` is ambiguous." It is one link; only two different targets are ambiguous.
- "A malformed value beside two references is ambiguous." Malformed is checked first.
- "An empty list is malformed." No facts at all (an empty list, `null`) is `none`.
- "A reference with a blank `@id` is a link." It is `malformed`.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `27fe0cef35857c070354c0439c6e4e4ebcc62815`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from the Plan card's host code in GilbApp at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which pins this package at that commit):

- `src/onlineCard/link.ts` to `src/link.ts`: lines 16-55 (`LINK_SPELLINGS`, `LinkReading`, `referenceOf`, `readLink`).

(`LINK_SPELLINGS`, `LinkReading`, `referenceOf`, `readLink`.) Not taken: `LINK_SLUG` (13-14), `LinkRefusedError`, `LinkWrite`, `isAbsoluteHttp`, `linkWrite`, `unlinkWrite` (57-100).

**Merged units compared and taken or not.** No merged unit holds `readLink`, `LinkReading` or `referenceOf` (searched by name over every `units/*/src`; `plan-links-model` holds other link functions): nothing to import.

Named changes, and only these:

1. the header comment of the file is a new, shorter one, and comments that name a host, a person, an agent or a ticket are reworded; no code changed. The file has no import to change.

`src/index.ts` is new. Tests (`src/*.test.ts`): ported from `gilb-stakeholders` `test/onlineCard/link.test.ts` at the same commit, by test block: 7 of 14 (the other 7 run `linkWrite` and `unlinkWrite`, not taken). New: `onlineCardLink.test.ts` (8: the export list and `readLink` beyond the ported blocks). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
