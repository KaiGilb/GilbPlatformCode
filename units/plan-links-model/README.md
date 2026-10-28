# plan-links-model

Reads and builds the links on a Function, Solution, Value or Resource card as plain functions: which record a link points at, the tag drawn for it, the loop checks on the Part of chain, and the Solution of relations read back.

## What this is

The links of a Plan card: Part of, Sub-functions, Function of Value, Solution of, Part of System. A link is stored as one fact whose served value is `{ "@id": <address> }`; the name drawn for it is the target's live tag, never a copy stored on the link. Pure functions and constants over the stored wire shapes: no React, no network.

From `planLinks`:

- `PlanLinkFacts` (type): a record as the link readers need it: `facts` (the flat strings) and `served?.facts` (the served values).
- `linkAddress(record, slug)`: the address a link fact stores. The served `{ "@id" }` wins (also a list of them: the first usable one; the key may be `slug`, `a:slug` or a full-IRI key ending `/a/slug`); else the flat fact, as an entity address or as a JSON string holding `{ "@id" }`. A served bare string is not a served link. A flat fact that is not an entity address is no link.
- `pointsAt(record, slug, target)`: whether the link names `target` (`{ id, entityUri? }`) by id or by address; the host and the `base`/`vault` segment of an address do not matter, the id does.
- `partOfExcludedIds(self, pool)`: the record and every record that reaches it through `fvParent`, as ids and addresses. Offering one of these as Part of would loop.
- `wouldLoop(self, chosenParentUri, read)`: whether the chosen parent already sits under `self`. Walks up through `fvParent` with the host's `read(id, address)`, at most 50 reads. True only when the chain reaches `self`; a chain that ends is false; a 50th record whose parent is not `self` throws `PlanChainError` ("This chain is too deep to check."); a read that throws or returns nothing throws `PlanChainError` ("Could not check the chain — try again."). Nothing is written.
- `PlanChainError`: the error `wouldLoop` throws; its message is the notice.
- `recordTag(facts)`: the record's tag, `unitTag` then `tag`, trimmed; empty when it has neither.
- `tagMatches(tag, needle)`: an empty needle matches every tag; otherwise a case-insensitive contains on the tag alone.
- `alreadyMeasuresSentence(valueTag, otherTag)` and `duplicateTagSentence(tag)`: the two notices.
- `withLinkFact(facts, servedFacts, slug, uri)`: the next flat and served facts after setting (`uri`) or retracting (`null`) one link. The served value is only `{ "@id": uri }`.
- `taggedChildren(record, pool, slug, typeName)`: the records of `typeName` whose `slug` points at `record`, sorted by tag then id.
- `isTypeName`: re-exported from the `type-key` peer, so the export list is the source's.

From `planSolution`:

- `SOLUTION_OF_TYPE` (`t:SolutionOf`) and `SOLUTION_OF_ROLES` (`role:source`, `role:target`).
- `solutionOfFunctions(rows)`: the Functions a Solution names (`t:SolutionOf` rows where the record is `source`; members with role `target`). `solutionsTargeting(rows)`: the Solutions that name a Function (the other way round). Each gives `{ relation, uri }`. A role is read with or without its `role:` prefix.
- `solutionOfCacheRow({ relation, view, otherUri })`: the relation row the open card caches after it writes one `t:SolutionOf`.
- `relationMemberIds(uris)`: each address, its id and its canonical address, as a set.
- `readPartOf(raw)` and `readPartOfFact(record)`: a Part of System value as `{ kind: "link", uri }`, `{ kind: "label", label }` or `{ kind: "empty" }`. `{ "@id" }` is the link; an older `{ "a:label" }` is words, not a link. `PartOfReading` is the type.

Wire vocabulary, verbatim from the code: the fact names `fvParent`, `partOf`, `unitTag` and `tag` (a caller passes any link name as `slug`); the served link `{ "@id": <address> }`; `{ "a:label" }`; the relation type `t:SolutionOf`; the roles `role:source` and `role:target`; an entity address `http(s)://<host>/(base|vault)/e/<id>`.

## What this is not

- Not the tag-in-use check. The source file's `tagUsedInVault` (a network find of the tag at the vault's host) is left out. The host checks tag use in its own vault, and uses `duplicateTagSentence` for the notice.
- Not a reader or a writer of the vault. `wouldLoop` takes the reader as an argument; `withLinkFact` returns the next facts, it does not send them.
- Not a type registry. `isTypeName` is the `type-key` unit's function; see "What the host must supply".
- Not `refDisplayName` or `entityDisplayName`. The name drawn for a linked record is the host's.
- Not the older `entity-ref` behaviour by itself: that unit has no built-in skip list, and this one passes it the app's eleven (see "Where it came from").

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-links-model`

Take it together with its six peers: `plan-card-facts`, `type-key`, `entity-ref`, `id-tail`, `type-curie` and `relation-role`. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/type-key <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/type-curie <path-to-the-library>/units/relation-role <path-to-the-library>/units/plan-links-model
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { linkAddress, partOfExcludedIds, recordTag, tagMatches, taggedChildren, withLinkFact, wouldLoop, PlanChainError, duplicateTagSentence } from "@kaigilb/gilbplatformcode-plan-links-model";

// Candidates for Part of: not the record itself, not anything under it, matching what was typed.
const blocked = partOfExcludedIds(self, pool);
const offered = pool.filter((r) => !blocked.has(r.id) && tagMatches(recordTag(r.facts), typed));

// Before writing the chosen parent: would it loop? The host supplies the reader.
try {
  if (await wouldLoop(self, chosen.entityUri, (id, at) => readRecord(id, at))) return; // refuse
} catch (e) {
  if (e instanceof PlanChainError) return showNotice(e.message); // too deep, or could not read
  throw e;
}

// Set the link; store `facts` flat and `servedFacts` as served.
const next = withLinkFact(record.facts, record.served?.facts, "fvParent", chosen.entityUri);

// The Functions that sit under this one, in tag order.
const subFunctions = taggedChildren(record, pool, "fvParent", "Function");

// The tag check is the host's: it asks its own vault, and uses the unit's notice.
if (await tagUsedHere(tag)) notice(duplicateTagSentence(tag));
```

## What the host must supply

- The records as it holds them, in the shape `PlanLinkFacts` and the pool rows name: `id`, `entityUri?`, `typeUri` (for `taggedChildren`), `facts` (flat strings) and `served?.facts` (as served).
- `read(id, address)` for `wouldLoop`: it returns the record (or `null`) and may throw. The unit never fetches.
- The check that a tag is used in its vault (the source's `tagUsedInVault`).
- If the app has its own type registry: one call to `setTypeKey` of the `type-key` unit at start-up. Without it, types compare by their lower-cased name. The app's own key function was registry-aware; the default is not.
- The relation rows for the Solution of readers (`RecordRelation` of the `relation-role` unit), from the platform's reverse lookup.

## Do not

- Do not install a second copy of `type-key`: the type function is module state, and two copies compare types differently.
- Do not read a link from the flat fact when the served value is there: use `linkAddress`, which prefers the served `{ "@id" }`.
- Do not treat a `wouldLoop` throw as "no loop". A `PlanChainError` means the chain could not be checked; nothing may be written on it.
- Do not store the name of the linked record on the link. Only the address is stored; the name is the target's live tag.
- Do not pass `wouldLoop` a reader that fetches the same record twice per step: the walk reads once per record, up to 50.

## Wrong readings

- "`linkAddress` reads any flat string." Only an entity address (`/base/e/` or `/vault/e/`), or a JSON string holding `{ "@id" }`. A flat `urn:` string, a bare word, or a JSON list string gives null. A SERVED `{ "@id": "urn:..." }` that is not an entity address is kept as it is, trimmed.
- "A served bare string is a link." It is not; the flat fact is then read.
- "`pointsAt` compares hosts." It compares the id (and the exact address): an address on another host with the same id, or on the other of `/base/` and `/vault/`, points at the same target.
- "`pointsAt` and `taggedChildren` exclude the record itself." They do not: a record that names itself is returned.
- "`wouldLoop` stops at 50 with an answer." It reads at most 50 records. Reaching `self` on the 50th read is true; a 50th record with another parent throws "too deep"; a chain of 50 that ends is false. A cycle that never reaches `self` runs the 50 reads and then throws "too deep".
- "A missing record ends the chain." It throws the notice "Could not check the chain — try again."
- "The eleven skipped names change which children `taggedChildren` finds." Almost never: `taggedChildren` also checks every typed record with `pointsAt`, which reads the served facts first and then the flat ones. The skip set matters only when a record's flat fact names the record on a skipped name (`claimSubject`, `heldParty`, `profilePhoto`, `principalUri`, `directReader`, `directWriter`, `aliasUri`, `accountSubject`, `registeredVault`, `vaultAddress`, `anchorBoundEmail`) while its served fact names another: the record is then not counted for that name.
- "`withLinkFact(.., '')` retracts." Only `null` retracts; an empty string stores an empty link.
- "`readPartOf` canonicalises." The link is the string as given, trimmed; a query on it stays.
- "`solutionOfFunctions` reads any relation." It reads rows whose `type` has the local name `SolutionOf` (`t:SolutionOf`, `.../base/t/SolutionOf` or `SolutionOf`); a row with no type is skipped.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/lib/base/planLinks.ts` lines 1-27, 33-213 and 230-279 to `src/planLinks.ts`. Comments made generic (the two header lines, unchanged in sense). Code verbatim except:
  - the imports of `./config` (`vaultOriginOf`), `./planFind` (`pageAttributeIds`) and `./picture` (`vaultIdOfEntity`) are removed: they were used only by `tagUsedInVault`, which is cut (lines 214-228 with its doc comment). `typeFacetKey` of `./workingSetFacets` was used only by `isTypeName`;
  - `./entityRefFacts` (`childrenPointingAt`, `entityRefFromFact`) is `@kaigilb/gilbplatformcode-entity-ref`; `./search` (`idFromEntityUri`) is `@kaigilb/gilbplatformcode-id-tail`; `./planCard` (`memberValue`) is `@kaigilb/gilbplatformcode-plan-card-facts`;
  - `MASTER_TAG_SLUGS` of `./entityDisplayName` (line 28) is a non-exported `const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;` in the file, with the same value;
  - `isTypeName` (lines 28-31) is deleted and imported from `@kaigilb/gilbplatformcode-type-key`, then re-exported (`export { isTypeName };`), so the export list is the source's;
  - `childrenPointingAt(record, typed)` (line 269) is `childrenPointingAt(record, typed, SKIP_SLUGS)`. The app's version skips eleven identity names inside; the `entity-ref` unit takes them as an argument. `const SKIP_SLUGS = new Set([...])` is copied from `src/lib/base/entityRefFacts.ts` lines 21-33 (same eleven names) as a non-exported constant.
- `src/lib/base/planSolution.ts` (whole, 124 lines) to `src/planSolution.ts`. Code verbatim; the imports are re-pointed: `./entityRefFacts` to `entity-ref`, `./planCard` to `plan-card-facts`, `./recordPlane` (`typeLocalName`) to `type-curie`, `./relationDoc` (`roleIs`) and `./relations` (`RecordRelation`, a type) to `relation-role`.

The peers' bodies were compared with the app's (comments stripped):

- `entityRefFromFact`, `entityRefsOf` and `childrenPointingAt` of `entity-ref` are the same logic as the app's, with the skip set as the third argument. The unit's `entityRefFromFact` adds a check that three regex groups are not undefined (it cannot fail: all three groups are required by the pattern). One difference in output: the unit's `childrenPointingAt` leaves the key `entityUri` out of a row when the child has none, where the app's row holds `entityUri: undefined`. Nothing in this unit can see it: `taggedChildren` reads only `slug` and `id` of those rows.
- `idFromEntityUri` of `id-tail` (it is `slashTail`) is the same as the app's `search.ts` function (`lastIndexOf("/")`, then the rest, or the whole string).
- `typeLocalName` of `type-curie` is the same as the app's `recordPlane.ts` function.

`src/index.ts` is new. The tests are ported from `planSolution.roles.vaultit.test.ts` (3 cases), the `wouldLoop` cases of `planSearch.vaultit.test.ts` (4), the Part of loop case of `planQaTester2.vaultit.test.ts` (1), the Part of System case of `planQaTester.vaultit.test.ts` (1) and the link cases of `planServedShapes.vaultit.test.ts` (2), with host names in the fixtures made generic; the rest of those files need a search, a store or other units and are not ported, and `tagUsedInVault` has no test here. `planLinks.test.ts`, `planSolution.test.ts`, `wouldLoop.test.ts` (the extra cases) and `example.test.ts` are new and pin every export.
