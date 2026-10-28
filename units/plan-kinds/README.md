# plan-kinds

The Plan record types and what each one shows: the type names, the Development Resource and Value-card gates, each type's line order, its default level and the words of its lines.

## What this is

The Plan record types and what each one shows: the type names, the Development Resource and Value-card gates, each type's line order, its default level and the words of its lines.

The table of the Plan card's types, as plain functions and constants: no React, no network. It answers "which types does Plan hold", "does this type use the Value card", "which lines does this type show, in which order", "what level does it show before one is chosen" and "what is this line called". A type is compared through `type-key`, so a spelling as `t:Resource`, `Resource` or an address ending `/base/t/Resource` is one type.

- The types: `PLAN_CREATE_TYPES` (the create order, each with its dialog `label` and the stored `typeName`), `planTypeNames()`, `planSolutionTypeNames()` (Solution and `DesignConstraint`, the Solution Constraint), `planCardTypeNames()` (the four types of the managed card: Function, FunctionConstraint, Solution, DesignConstraint), `isPlanType` (the card edits it: those four, Value and Resource), `isPlanRecordType` (the Plan list holds it), `PLAN_ONLY_TYPE_IDS` (registry ids that the Records "+ New" list must not offer).
- The Value-card gates: `isResourceType(typeUri)` (a Development Resource, `t:Resource`) and `isValueCardType(typeUri)` (a Value or a Development Resource: the one gate for the Value card's behaviour).
- The lines: `planLinesFor(typeUri)` (the line keys of a type in the order the card draws them; an unknown type gets the Function lines), the type `PlanLineKey`, `PLAN_VALUE_LINE_LABELS` (the heading of each Value-card line), `PLAN_FIELD_ORDER`, `PLAN_FIELD_LABELS`, `PLAN_HIDDEN_FIELDS`, `PLAN_TYPE_FIELD_LABELS` and `planTypeFieldLabel(typeUri, slug)` (a line word that belongs to one type).
- Level and type switch: `planLevelDefault(typeUri)` (Solution for a Solution or Solution Constraint, Product for a Value, Business for a Development Resource, null otherwise), `planTypePair(typeUri)` and `planTypeChangeSentence(next)` (the pair a Type line switches between and the four exact confirm sentences).

A Development Resource is the Value card with four changes: Budget in the place of Goal, Business as its level, a Resource Owner line, and its Type word. Here that shows as its own list of lines (the Value lines without Value of Function, and Resource Owner just before Stakeholder) and as the level default; the other changes are in `value-card-model`.

The unit holds no state of its own. It reads types through `type-key`, which holds module state, so an app must have ONE copy of `type-key`.

## What this is not

- Not the card. It lists the lines; it draws none.
- Not a type registry or a fetcher. It knows these six names and nothing about their definitions.
- Not the Value card's data (`value-card-model`) or the Budget level kinds (`levelKindsFor` there).
- Not the place where a type is found to be unknown on a list row: see Wrong readings.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-kinds`

Take it together with its peer `type-key`. Put this line in your app's own `.npmrc` so both are installed as copies and not links (one copy of `type-key`, so one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { isValueCardType, planLinesFor, planLevelDefault, planTypeNames } from "@kaigilb/gilbplatformcode-plan-kinds";

planTypeNames(); // ["Function", "FunctionConstraint", "Value", "Solution", "DesignConstraint", "Resource"]
isValueCardType("t:Resource"); // true
planLinesFor("t:Resource"); // ["valueGraph", "scale", "endpoint", "scaleVariables", "valueLevels", "valueMeters", "resourceOwner", "stakeholder", "description", "authority", "gilbveda"]
planLevelDefault("t:Resource"); // "Business"

// The card draws its lines in this order, after the Type / Level / Version line that every type has first.
const lines = planLinesFor(record.typeUri).map((key) => byLine[key]);
```

## What the host must supply

- Nothing, if the default key of `type-key` is right for its types. A host with its own type registry calls `setTypeKey` of `type-key` once at start-up, and these functions follow it.
- The drawing: a component per `PlanLineKey`. The unit gives the keys and their order only.

## Do not

- Do not install a second copy of `type-key`: these functions would read a different key function than the one your app set.
- Do not compare types with `===` on raw strings; ask `isResourceType` or `isValueCardType`.
- Do not add a line key to a type and expect the card to draw it: the card needs a component for it.
- Do not read `planLinesFor` as the whole card: the Type / Level / Version line comes first on every type and is in no list.

## Wrong readings

- "`t:Resource` is any resource." It is the Development Resource type. In GilbApp the same word `Resource` is also used on list rows as a marker for an unknown type; this unit only answers what the type name is, and `isResourceType("t:Resource")` is true whatever a row shows.
- "An unknown type has no lines." It gets the Function lines (also the empty type and a Note).
- "A Value and a Resource are in `planCardTypeNames`." They are not: they are in `isPlanType` but not in the four names of the managed card.
- "`planTypePair` of a Value is a Value pair." It is the Function pair: only a Solution or a Solution Constraint gets the Solution pair.
- "`planTypeFieldLabel` is null for a slug that is not listed." It is, except for a name an object inherits: `planTypeFieldLabel("t:Value", "constructor")` returns the `Object` function. Kept as the source has it.
- "The group names of the card are the line keys." They are not: the card's groups are `plan-description`, `plan-type` and so on, and the line key `gilbveda` is the group `plan-type`. The tests pin the orders in the card's group names through a table.
- "A lower-case `t:resource` is another type." Under the default key it is the same (the key lower-cases the name). An app whose registry is case-sensitive differs; it calls `setTypeKey`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: `src/lib/base/planKinds.ts` (whole, 263 lines) to `src/planKinds.ts`. Comments made generic (a person's name and the names of internal tools removed from four doc comments). Code verbatim except:

- the one import, `import { typeFacetKey } from "./workingSetFacets"`, is now `import { typeKey as typeFacetKey } from "@kaigilb/gilbplatformcode-type-key"`, so every call site is as in the source. The source's `typeFacetKey` asks the app's type registry first; the `type-key` default answers as if the registry knew no type, and a host with a registry calls `setTypeKey`.

`src/index.ts` is new (`export * from "./planKinds"`). The tests are ported from `src/lib/base/planResource.vaultit.test.ts` (the cases of `isValueCardType`, `isResourceType`, `isPlanType`, `planLinesFor`, `PLAN_VALUE_LINE_LABELS` and `planLevelDefault`) and `src/lib/base/planResource.rqa1.test.ts` (the `planLinesFor("t:Value")` and `planLevelDefault("t:Value")` lines), with host names in the fixture strings made generic. The per-type line orders are those asserted in `src/components/records/RecordDetail.planCard.vaultit.test.tsx` (the Function and Constraint orders), `RecordDetail.planSolution.vaultit.test.tsx` (the Solution and Solution Constraint orders) and `RecordDetail.planResourceCard.vaultit.test.tsx` (the Resource order); they are written there in the card's group names, so the unit's tests map each line key to its group through a table. `src/planKinds.test.ts` pins every other export; `src/exports.test.ts` pins the export list.
