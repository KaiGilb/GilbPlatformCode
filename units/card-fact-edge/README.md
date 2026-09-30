# card-fact-edge

A graph edge derived from a fact already on a card. It is not a relation the vault stored, and it does not decide which rows are pairs.

## What this is

The graph walks stored relations. A phone that is about a person is not one of those relations. It is a fact on the phone pointing at the person. These three functions are how that fact becomes a line on the graph, once something else has decided the pair exists.

| Function | Job |
|---|---|
| `cardFactRelationUri` | `fact:<slug>:<sourceId>:<targetId>` |
| `cardFactEdgeLabel` | The word on that line, from the slug only. |
| `injectCardFactRelations` | Puts the line into the relation map the graph already uses. |

`cardFactEdgeLabel` renames three slugs, and only those, and only when they match exactly:

| Slug | Label |
|---|---|
| `claimSubject` | `about` |
| `heldParty` | `held-party` |
| `profilePhoto` | `profile-photo` |

Any other slug is returned unchanged. `hasPhoto` stays `hasPhoto`. `ClaimSubject` stays `ClaimSubject`. An empty slug returns an empty string, not undefined. Undefined means the URI does not start with `fact:`. The prefix is case-sensitive. `Fact:` is undefined.

Only the first segment after `fact:` is the slug. `fact:claimSubject:person:phone` is `about`. The later colons are ids.

## What this is not

- Not the search that finds pairs. That search reads the record set, including which photo spelling a row uses, and it stays in the app. Pass the pairs you already found.
- Not a stored relation, and not a type. The URI is synthetic so two reporters can name the same line. Do not write it back to the vault.
- Not a dedupe. Calling inject twice appends the same line twice.
- Not an escape. A colon inside a slug or an id cannot be told apart from the separator when you split the URI later. The label uses only the first segment, so a slug that itself contains a colon is labelled as the text before that colon.

## How to take it

Package: `@kaigilb/gilbplatformcode-card-fact-edge`

```ts
import {
  cardFactEdgeLabel,
  cardFactRelationUri,
  injectCardFactRelations,
} from "@kaigilb/gilbplatformcode-card-fact-edge";
```

Path: `units/card-fact-edge/`.

## What you pass

`cardFactRelationUri` and each pair:

| Field | Meaning |
|---|---|
| `slug` | The fact name, such as `claimSubject`. Not checked. |
| `sourceId` | The card field, the satellite. |
| `targetId` | The person, the hub. |

`cardFactEdgeLabel` takes the URI string, usually the one `cardFactRelationUri` built.

`injectCardFactRelations` takes the current map of record id to relations, and the pairs. A relation object may also carry `members` and `type`. Those are kept because the existing objects are reused, not rebuilt.

## What you get

`cardFactRelationUri` returns one string. Empty parts stay empty: slug, source, and target all empty is `fact:::`.

`cardFactEdgeLabel` returns a string, or undefined when the prefix is missing. Empty string is a real label for an empty slug.

`injectCardFactRelations` returns a new map. For each pair it appends `{ relation, role: "role:source" }` on the source id, then `{ relation, role: "role:target" }` on the target id. Existing relations stay in front, in their old order, as the same objects. The arrays are new. The input map and its arrays are not changed. If source and target are the same id, that id gets both roles, source first. An id that was not in the map is created.

## Examples

```ts
cardFactRelationUri({ slug: "claimSubject", sourceId: "phone", targetId: "person" });
// "fact:claimSubject:phone:person"

cardFactEdgeLabel("fact:claimSubject:phone:person"); // "about"
cardFactEdgeLabel("fact:hasPhoto:file:person"); // "hasPhoto"
cardFactEdgeLabel("relation:claimSubject"); // undefined

injectCardFactRelations(relationsByRecord, [
  { sourceId: "phone", targetId: "person", slug: "claimSubject" },
]);
```

## What the host must supply

The pairs. Both ends should already be in the record set. This unit will not look for a photo fact, will not decide which row is the person, and will not drop a non-image file. Wire the result into the same map the graph uses for stored relations, so hop count treats the pair as one hop.

## Do not

- Do not rename `hasPhoto` to `profile-photo` here. Only the exact slug `profilePhoto` gets that label.
- Do not write `fact:` URIs into the vault.
- Do not mutate the map you passed. Use the returned map.
- Do not split a slug on colon and expect to recover an id that itself contained a colon.

## Wrong readings

- "Undefined means an unknown slug." Unknown slugs are returned as themselves. Undefined means this is not a fact URI.
- "Inject replaces the relations for that record." It appends. Stored relations stay.
- "Source and target are interchangeable." The source is the satellite and is marked `role:source`. The target is the person and is marked `role:target`. Swapping them turns the line around.

## Where it came from

GilbApp `cardFactRelationUri`, `injectCardFactRelations`, and `cardFactEdgeLabel` in `src/lib/base/graphCardLinks.ts`. The pair search in that file is not included.
