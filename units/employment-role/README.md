# employment-role

The dates and place on one employment, with three states of current (true, false, never said).

## What this is

The dates and place on one employment, with three states of current (true, false, never said).

Five functions.

`roleMonth(raw)` is `YYYY` or `YYYY-MM`, else `""`. `fullPlaceIri(raw, catalogueOrigin)` is a full http(s) address, a compact `base:e/<id>` made full against the origin, else `""`. `readRole({start, end, ongoing, place}, origin)` gives `{start, end, current, placeId}` where **`current` has three states**: `true` (stored ongoing true and no readable end), `false` (an end month, or stored ongoing false), `null` (never said). `roleWire(role, attrs)` is the whole role as a form holds it: `{set, clear}`; an end month is written and ongoing cleared, `true` writes ongoing true, `false` writes ongoing false, **`null` leaves ongoing untouched**; every other attribute is set or named in `clear`.

`roleChangeWire(before, after, attrs)` is the wire of an EDIT. `before` is the role as it was last read (none: no role yet), `after` the role as the form holds it. It names an attribute only when what the person sees of it changed: the start when the start month changed, the end when the end month changed, ongoing when the end or the current state changed, the place when the place changed. A stored value that did not read (a full date, a place that is not an address) reads as `""` before and after, so an edit of another attribute does not delete it. A null is sent only for a value the person cleared.

## What this is not

- Not the date line on a card: that is `role-when`.
- Not a place search: a bare name such as `Oslo` is `""`.
- Not a request: nothing is loaded or saved.
- Not the earlier 0.1.0 of this unit, which had two states of current and wrote ongoing false for a role never said.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-role`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-role` prints:

```sh
npm install <path-to-the-library>/units/employment-role
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. It returns the `{set, clear}` an employment write puts in a patch.

## Requests and their servers

None.

## Examples

```ts
import { readRole, roleChangeWire } from "@kaigilb/gilbplatformcode-employment-role";

const before = readRole(stored, catalogueOrigin);
const wire = roleChangeWire(before, { ...before, start: "2020-01" }, attrs); // only a:startDate
```

## What the host must supply

The four attribute names (`RoleAttrs`), which the caller asks of the ontology, and the catalogue origin for `readRole`.

## Module state

None.

## Do not

- Do not write ongoing true in the same patch as an end month: `roleWire` will not, and a call site must not add it back.
- Do not save a compact place id: expand it with `fullPlaceIri` or clear it.
- Do not use `roleWire` for an edit: it names every attribute the form holds empty as a null. Use `roleChangeWire`.
- Do not read `""` from `fullPlaceIri` as an empty address: it means the value was not an address this function knows.

## Wrong readings

- "A role never said current is ended." It is `null`, and nothing is written for ongoing.
- "A year-month-day is a better month." It is rejected; the stored shape is `YYYY` or `YYYY-MM`.
- "An edit of the end may clear the place." `roleChangeWire` does not name the place unless it changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/lib/mynet/employment/employmentRole.ts` (all but its import), re-versioned from 0.1.0. `roleChangeWire` is new code. 0.1.0 came from another copy of the MyNet file and had two states of current; nothing depended on it.

## Tests

35 tests in 5 files (`npx vitest run`): `employmentRole.test.ts` 6 and `employmentRole.ongoing.test.ts` 3 (ported from GilbApp, unchanged), `roleChangeWire.test.ts` 12, `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 12 mutants of `src/employmentRole.ts` (a role never said read as ended or written ongoing false, the end not winning, a full date as a month, a bare name as a place, and each of the five "always names" / compare faults of `roleChangeWire`), 12 killed.
