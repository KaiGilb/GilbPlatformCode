# plan-impacts-model

Reads, parses and builds the impacts of a Solution on Values and Development Resources as plain functions: one `t:ImpactOn` relation per pair, with the numbers on the relation.

## What this is

Reads, parses and builds the impacts of a Solution on Values and Development Resources as plain functions: one `t:ImpactOn` relation per pair, with the numbers on the relation.

A Solution (or a Solution Constraint) has impacts on Values and on Development Resources. Each impact is one `t:ImpactOn` relation between the Solution and one Value, or between the Solution and one Resource. The numbers live on the relation; neither end stores them. This unit reads the relations, parses what a person types into the numbers, builds the facts stored on the relation, and gives the words shown for them. Pure: no React, no network.

- Reading the relations: `impactsOnSolution(rows)` (the rows of the platform's reverse lookup where the record is `role:solution`: one `ImpactLink { relation, targetUri, targetRole }` per Value or Resource member; roles are read with or without `role:`, the stored role is always the prefixed constant), `sortImpacts(links, tagOf)` (Values first, then Resources, each side by tag, then address).
- Showing: `valueEstimateShown(raw)` (`{ text, pinned }`: a pinned `"3 → 0.2"` or `"unmeasured → 5"` is itself and pinned; any other string is itself; a number or boolean is its string; an object or list is compact JSON in stored key order; nothing is empty), `resourceDrawShown(stored)` (a leading ASCII `-` becomes U+2212; a leading `+` stays), `impactNumbersText(stored)` (the numbers button's words without the basis; the unit is appended only for the pinned Value form and for a Resource).
- Parsing what is typed: `parseValueSide(raw)` (`unmeasured` only as itself; a number, a leading `+` dropped), `parseAmount(raw)` (a Resource amount; a sign is required), `parseImpactFields(role, fields)` (the commit: for a Value `status → expected` joined with the arrow, `expected` may not be `unmeasured`; for a Resource the signed amount; the unit trimmed), `splitPinned(text)` (the inverse of the Value commit), `sameImpact(prev, next)`.
- Both parsers turn U+2212 into `-` and every comma into a dot: `"1,5"` is `1.5`, and `"1,000"` is `1.000` (a decimal, not a thousand). `"1,000.5"` is not a number.
- The facts: `impactExtraFacts(stored, source)` (the relation's extra facts; the roles are not among them), `factsFromExtras(extras, role)` (read back, bare or `a:`-spelled), `sourceFromImpactFacts` / `sourceToImpactFacts` (who said it: `statedBy`, `derivedFrom`, the words), `scaleUnitOf(record)` (the target's Scale unit, for the Unit box of a new impact).
- Constants and types: `IMPACT_ON_TYPE`, `IMPACT_SOLUTION_ROLE`, `IMPACT_VALUE_ROLE`, `IMPACT_RESOURCE_ROLE`, `IMPACT_RELATION_TYPE`, `IMPACT_ARROW`; `ImpactLink`, `ImpactStored`, `ImpactCommit`, `ImpactTargetRole`, `ImpactBasis`.

Wire vocabulary, verbatim from the code:

- The relation: type `t:ImpactOn` (read by the local name `ImpactOn`); roles `role:solution`, `role:value`, `role:resource`.
- The relation's own facts (`impactExtraFacts`): `a:relationType` = `value-estimation` (`IMPACT_RELATION_TYPE`), `a:unit`, `a:impactBasis` (`estimate` or `measured`; anything else reads as `estimate`), then the source (`a:statedBy` and `a:derivedFrom`, each `{ "@id": <address> }`, and `a:source`, the words), then `a:valueEstimate` for a Value or `a:resourceDraw` for a Resource. Never `a:impactEstimates`.
- `a:valueEstimate`: the pinned string `<status> → <expected>` with the arrow ` → ` (space, U+2192, space; `IMPACT_ARROW`); a side is a number or, for the status only, `unmeasured`. A value stored in another form (a free string, a number, an object such as `{ level, unit, confidence }`) is read and shown, never rewritten by this unit.
- `a:resourceDraw`: a signed number as a string with an ASCII sign (`+200`, `-20`).
- The Scale, for `scaleUnitOf`: the served `scale` (also `a:scale`) object's `a:unit`, else `unit`; a JSON string of it is parsed; a `{ "@id" }` has no unit here; a unit on the Value or Resource itself is not read.

## What this is not

- Not the view. The numbers button, the editing form and the drawing are not here. A person's text is parsed here; the screen that asks for it is a later unit.
- Not a writer. The facts are returned; creating or ending the relation is the host's.
- Not a source of the tag. `sortImpacts` is given `tagOf`.
- Not a validator of the unit. `parseImpactFields` only trims it; any text is a unit.
- Not the Solution of relation; that is `plan-links-model`.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-impacts-model`

Take it together with its three peers: `plan-card-facts`, `type-curie` and `relation-role`. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links:

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/type-curie <path-to-the-library>/units/relation-role <path-to-the-library>/units/plan-impacts-model
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import {
  IMPACT_VALUE_ROLE, impactsOnSolution, sortImpacts, parseImpactFields,
  impactExtraFacts, factsFromExtras, impactNumbersText, sameImpact,
} from "@kaigilb/gilbplatformcode-plan-impacts-model";

// The impacts of the open Solution, Values first.
const links = sortImpacts(impactsOnSolution(relationRows), (uri) => tagOfRecord(uri));

// What the person typed for a Value: status 3, expected 0,2, unit " seconds ".
const commit = parseImpactFields(IMPACT_VALUE_ROLE, { status: "3", expected: "0,2", amount: "", unit: " seconds ", basis: "estimate" });
if (commit) {
  const extras = impactExtraFacts(commit, { text: "measured on site" }); // store these on the relation
  const stored = factsFromExtras(extras, IMPACT_VALUE_ROLE);
  impactNumbersText(stored); // "3 → 0.2 seconds"
  sameImpact(stored, commit); // true: nothing to write
}
```

## What the host must supply

- The relation rows (`RecordRelation` of the `relation-role` unit) from the platform's reverse lookup, and the tag of each target for `sortImpacts`.
- All reading of records and all writing: creating the `t:ImpactOn` relation with its two members and the extra facts, patching it, ending it.
- Nothing else: no React, no CSS, no environment.

## Do not

- Do not store the roles among the extra facts: `impactExtraFacts` leaves them out on purpose; they are the relation's members.
- Do not write `a:valueEstimate` for a Resource or `a:resourceDraw` for a Value: the function writes only the one for the role.
- Do not parse a pinned value by splitting on a plain hyphen or `->`: the separator is exactly space, U+2192, space.
- Do not show `resourceDraw` as stored where the minus matters to the eye: `resourceDrawShown` gives the proper minus sign; the stored value keeps the ASCII `-`.
- Do not expect `parseValueSide` to keep a thousands comma: a comma is always a decimal mark here.

## Wrong readings

- "`1,000` is one thousand." It is stored as `1.000`, which is read as 1: `parseValueSide("1,000")` is `1.000` and `parseAmount("+1,000")` is `+1.000`. Kept on purpose; the unit does not change behaviour while it is shared. (The source has this in the model itself; no view unit is involved.)
- "A Value may end at `unmeasured`." The commit is null: `expected` may not be `unmeasured`. It may start at it.
- "A Resource amount may be unsigned." It may not: `200` is null, `+200` and `-20` are accepted.
- "`+4` is stored as `+4`." For a Value side the plus is dropped (`4`); a Resource amount keeps its sign.
- "`+-3` is an error." For a Value side the leading plus is dropped and `-3` is left, so it is accepted as `-3`. A Resource amount `+-3` is null.
- "A free-text estimate is pinned." Only `<number or unmeasured> → <number>` is pinned; `3 → unmeasured`, `3 -> 0.2` and `3 → 0.2 seconds` are plain text and `splitPinned` gives null for them.
- "`sameImpact` compares numbers." It compares strings (`3 → 0.2` is not `3 → 0.20`), and a stored estimate that is not a string is never the same as a commit.
- "A top-level `a:unit` on the Value is the Scale's unit." Only the Scale object is read.
- "The unit is appended to every number." Only to a pinned Value and to a Resource; a free-text Value is shown as it is.
- "`source` is always a link." `sourceFromImpactFacts` takes a link only when the string starts with `http` or `urn:` (checked before trimming, so a leading space makes it no link).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: `src/lib/base/planImpacts.ts` (whole, 260 lines) to `src/planImpacts.ts`. Code verbatim. The only change is the four imports (lines 4-7): `./planCard` (`memberValue`, the type `PlanSourceValue`) is `@kaigilb/gilbplatformcode-plan-card-facts`; `./recordPlane` (`typeLocalName`) is `@kaigilb/gilbplatformcode-type-curie`; `./relationDoc` (`roleIs`) and `./relations` (the type `RecordRelation`) are `@kaigilb/gilbplatformcode-relation-role`. Comments are as in the source (they name no person, project or host).

`src/index.ts` is new. The tests are ported from `planImpacts.roles.vaultit.test.ts` (1 case), `planServedShapes.vaultit.test.ts` (the impact case) and `planQaTester.vaultit.test.ts` (the ImpactOn round-trip case), with a person name in one fixture string and the host names made generic; `planImpacts.test.ts` and `example.test.ts` are new and pin every export.
