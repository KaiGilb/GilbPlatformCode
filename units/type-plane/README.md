# type-plane

Which plane a term sits on, from facts the host already holds. First match wins.

## What this is

`classifyPlane(term, ancestors)` returns one of `entity`, `function`, `relation`, `attribute`, `value`.

`isCreatePlane(plane)` is true for entity, function, and value. Those are the planes a create surface may offer.

`isIssuedOnTypeFind(plane)` is true for those three and for the word `uncatalogued`. It is false for `undefined`, `relation`, and `attribute`.

## What this is not

- Not a fetch, and not a walk of parents. `ancestors` is a list the host already built. An empty list means nothing was handed in. It does not mean the term has no parents.
- Not a list of type names. The registry of which types exist stays in the app.
- Not a reason to hide a record. `uncatalogued` is issued on a type find on purpose. The name still shows. Only the plane is missing.
- Not a reading of `a:providesFunction`. That fact is on a complete type. Keying on it would call a rule a function. Do not add it.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-plane`

```ts
import { classifyPlane, isCreatePlane, isIssuedOnTypeFind } from "@kaigilb/gilbplatformcode-type-plane";

const plane = classifyPlane(termFacts, parentAddresses);
if (isIssuedOnTypeFind(plane)) showOnTypeFind(plane);
```

## What you pass

`term` is the term's own fact map. Keys are the served spellings, such as `a:nodeKind`.

`ancestors` is optional. Each item is an address string. The function looks for an address that ends with `/base/t/Relation`, `/base/t/Identity`, or `/base/t/Function`. It also looks at `term["@id"]` the same way.

## What you get

The checks run in this order. The first hit is the plane.

1. Relation, when `a:nodeKind` is exactly `relation`, or `a:isRelationPredicate` is boolean `true`, or an address ends in `/base/t/Relation`.
2. Attribute, when the kind is exactly `attribute`, or `a:predicateAttribute` names an `a:` or `skos:` predicate, or an address ends in `/base/t/Identity`.
3. Value, when the kind is exactly `value`, or any of these keys is present: `a:measures`, `a:valuedBy`, `a:scale`, `a:unit`, `a:scaleAnchors`, `a:meter`, `a:hasMeter`, `a:endpointSubject`, `a:endpointReference`. Present includes a value of `null`. The value is not read.
4. Function, when the kind is exactly `function`, or `a:verb` is present (including `null`), or an address ends in `/base/t/Function`.
5. Entity. Everything else, including an empty map.

`a:predicateAttribute` is an attribute only when the value starts with `a:` or `skos:`. A string `t:NoteDocument` is not an attribute. An object `{"@id":"t:Task"}` is not an attribute. The key being present is not enough. A thing you can make a record of carries this fact with a `t:` value.

`a:isRelationPredicate` must be boolean `true`. The string `"true"` is not a relation.

Kind words are case-sensitive. `"Function"` is not `"function"`. Address tails are case-sensitive. A trailing slash means the address does not match. `https://h.example/base/t/Relation/` is not a relation by that rule.

## Do not

- Do not reorder the five checks. A relation that also has `a:verb` is a relation.
- Do not treat `a:providesFunction` as a function.
- Do not treat "the predicate attribute key exists" as "this is an attribute".
- Do not fetch inside this call. Pass the document you already have.
- Do not use `isCreatePlane` on the word `uncatalogued`. That word is only for `isIssuedOnTypeFind`.

## Wrong readings

- "No ancestors were passed, so this term is an entity." No. Entity is the last resort after the term's own facts. A kind of `relation` is a relation with or without parents.
- "Null on `a:scale` means there is no scale." No. The key is present. The plane is value.
- "A suggested term that did not dereference should be dropped from the find." No. Pass `uncatalogued`. `isIssuedOnTypeFind` returns true.

## Where it came from

GilbApp `src/lib/base/vocabCatalog.ts` — `classifyPlane`, `bindsAttributePredicate`, `isCreatePlane`. GilbApp `src/lib/base/heldTypes.ts` — `isIssuedOnTypeFind`. The fetch and the parent walk stayed in the app.
