# plan-stakeholders-model

Reads the stakeholders, the Authority and (on a Development Resource) the Resource Owner of a Plan record from its relations and its text, and holds the rules that a Function Constraint or Solution Constraint names a person as its Authority.

## What this is

Reads the stakeholders, the Authority and (on a Development Resource) the Resource Owner of a Plan record from its relations and its text, and holds the rules that a Function Constraint or Solution Constraint names a person as its Authority.

Who is on a Plan record, as plain functions over what the vault stores. A linked stakeholder is one relation per (record, stakeholder). A name that is not a record yet stays text on the record's `a:stakeholders`. The Authority is a kind of stakeholder; on a Development Resource the Resource Owner is a third kind with the Authority's shape. A Function Constraint or Solution Constraint (`DesignConstraint`) must name the person who requires it as its Authority. Pure: no React, no network, no search.

From `planStakeholders`:

- `STAKEHOLDER_RELATION_TYPE` (`t:StakeholderOf`), `AUTHORITY_RELATION_TYPE` (`t:AuthorityOf`), `RESOURCE_OWNER_RELATION_TYPE` (`t:ResourceOwnerOf`): the three relation types. `STAKEHOLDER_ROLES`: `{ source: "role:referenced-by", target: "role:stakeholder" }`, the two roles in place of `role:source` / `role:target`. `STAKEHOLDER_RELATION_FACT` (`stakeholder`): the value of `a:relationType` on these relations.
- `stakeholdersOf(rows)`, `authoritiesOf(rows)`, `resourceOwnersOf(rows)`: from the record's relation rows (`RecordRelation` of the `relation-role` unit), the rows of that one type where the record is `role:referenced-by`, as `{ relation, uri }` of the member in `role:stakeholder`. The type is compared by its local name (`t:AuthorityOf` and `https://<host>/base/t/AuthorityOf` are the same; a row with no type is none of them). A person named twice in one list is listed once, at the first row. A row with no stakeholder member, or an empty one, is skipped. The three lists do not overlap: an Authority and a Resource Owner are not in `stakeholdersOf`. `null` or `undefined` rows give `[]`. `linkedStakeholders(rows)` is `stakeholdersOf(rows)`.
- `sameRecord(a, b)`: equal strings, or two strings that read as the same entity address (`http(s)://<host>/(base|vault)/e/<id>`; a query or text after the id does not matter, the host and the `base` or `vault` segment do). `alreadyLinked(rows, uri)`: whether `uri` (trimmed) is a plain stakeholder already.
- `stakeholderTagText(item)`: the words for one name that is not a record: a string trimmed, or an object's `unitTag`, else `label`, else `tag` (each by `a:` name, bare name or full-IRI key), else the part after the last `/` of its `@id`. `stakeholderTagTexts(raw)`: all of them from a list, one object, one string, or a JSON string of either; broken JSON gives `[]`. `stakeholdersWithoutTag(raw, tag)`: that list without the items whose text is exactly `tag`, or `null` when none remain.
- `legacyAuthorityOf(facts)`: the older record keys `a:authorityHolder` (and `a:authorityActsFor`) read as `{ holder, actsFor }`; `null` when the record has no usable holder.
- `actsForOnRelation(doc)`: `a:authorityActsFor` on a relation document (`RelationDoc`). A compacted `base:` value expands from the relation's own address.
- `AuthorityWrite` (type): what a write of one Authority relation takes: `recordId`, `recordUri`, `stakeholderUri`, `vaultId`, optional `actsFor`, optional `relationType` (omitted: `t:AuthorityOf`; a Resource Owner passes `RESOURCE_OWNER_RELATION_TYPE`). The writer is the host's.
- `LinkedStakeholder` (type): `{ relation, uri }`.

From `planConstraint`:

- `isConstraintType(typeUriOrName)`: `FunctionConstraint` or `DesignConstraint`, in any spelling, compared through `type-key` (`Function` is not one; no type is not one).
- `PERSON_TYPE_NAME` (`Person`): the one type name this rule fixes. `personTypeNames(set)`: `Person` plus every kind the set places under Person's term by is-a, each name once, depth first. A missing set, a set without Person, or a Person without a term gives only `["Person"]`: descendants are not invented. `isPersonStakeholderType(typeUri, set)`: whether the type's local name is one of those; no type is not a person. `personAuthorities(rows, typeOf, set)`: the Authorities whose stakeholder record is a person (`typeOf` is the host's lookup from an address to a type; text and an unknown type do not count). `removingLastPersonAuthority(people, uri)`: true when `uri` is the only person left.
- The sentences, verbatim: `CONSTRAINT_AVOID`, `CONSTRAINT_AUTHORITY_WHY`, `CONSTRAINT_UNLINKED`, `CONSTRAINT_LAST_PERSON`, `CONSTRAINT_WARNING`, and `NOT_A_PERSON` ("not a person", shown on a picker hit that cannot be a constraint's Authority).

From `kinds`: `kindDescendants(kinds, term)` (the walk down from one type by is-a: direct children first, each one's own children right after it, each once, with its depth) and the types `StakeholderKindType`, `KindDescendant` and `StakeholderTypeSet` (the set as the master served it: `names`, `complete`, and `types` of `{ term, name, label, parents? }`). `RelationDoc` (type) is the relation document.

Wire vocabulary, verbatim from the code: the relation types `t:StakeholderOf`, `t:AuthorityOf`, `t:ResourceOwnerOf`; the roles `role:referenced-by` and `role:stakeholder`; the record fact `a:stakeholders` (text names, or a list of objects with `unitTag`, `label`, `tag` or `@id`); on a relation `a:relationType` (value `stakeholder`) and `a:authorityActsFor` (`{ "@id": <address> }`, or compacted `base:e/<id>`); the older record keys `authorityHolder` and `authorityActsFor`; the `base:` prefix rule: a relation document's address `http(s)://<host>/(base|vault)/r/<id>` gives the prefix `http(s)://<host>/(base|vault)`, and `base:e/org` becomes `<prefix>/e/org`; the type names `FunctionConstraint`, `DesignConstraint`, `Person`.

## Changes in 0.2.0

BREAKING: `handleFromFacts` is removed, as the app removed it; a record's `@handle` is now its main tag, read by `main-tag`. A caller that imports `handleFromFacts` must stop.

## What this is not

- Not the picker. Finding stakeholder records by name across held vaults, and choosing one, is not here. The source's `findStakeholderRecords` and `findAnyRecords` are left out (see "Where it came from").
- Not the writer. Writing an Authority, a Resource Owner or a stakeholder relation, ending one, and the migration of the older holder keys into a relation are the host's, and a later unit's. `AuthorityWrite` is the type of what such a writer takes, nothing more.
- Not `spec-card-facts`. That unit reads the Specification card; this one reads the Plan record's stakeholders.
- Not the stakeholder kind reader. The unit takes a kind set (`StakeholderTypeSet`) that the host has read from the master; it does not read one, and it names no kind but Person.
- Not a type registry. Whether a type is a constraint is asked of `type-key`.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-stakeholders-model`

Take it together with its five peers: `plan-card-facts`, `entity-ref`, `type-curie`, `type-key` and `relation-role`. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/entity-ref <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/relation-role <path-to-the-library>/units/plan-stakeholders-model
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own. `base-record` is not a peer: nothing in this unit takes a record, only relation rows, facts and a kind set.

## Examples

```ts
import {
  authoritiesOf,
  isConstraintType,
  personAuthorities,
  removingLastPersonAuthority,
  resourceOwnersOf,
  stakeholderTagTexts,
  stakeholdersOf,
  CONSTRAINT_LAST_PERSON,
  CONSTRAINT_WARNING,
} from "@kaigilb/gilbplatformcode-plan-stakeholders-model";

// The relation rows of the open record come from the host's reverse lookup.
const stakeholders = stakeholdersOf(rows); // [{ relation, uri }]: plain stakeholders only
const authorities = authoritiesOf(rows); // the Authority, marked on the Stakeholder line
const owners = resourceOwnersOf(rows); // the Resource Owner line of a Development Resource
const names = stakeholderTagTexts(record.facts["stakeholders"]); // names that are not records yet

// A constraint needs a person as its Authority. `kindSet` is the host's read of the master's stakeholder kinds.
if (isConstraintType(record.typeUri)) {
  const people = personAuthorities(rows, (uri) => typeOfRecord(uri), kindSet);
  if (people.length === 0) showWarning(CONSTRAINT_WARNING);
  // Before ending an Authority:
  if (removingLastPersonAuthority(people, authority.uri)) return refuse(CONSTRAINT_LAST_PERSON);
}
```

## What the host must supply

- The relation rows of the record (`RecordRelation` of the `relation-role` unit: `relation`, `role`, optional `type`, optional `members`), from the platform's reverse lookup.
- For the constraint rule: the stakeholder kind set (`StakeholderTypeSet`) read from the master vocabulary, and `typeOf(address)`, the type of the record an address names (or `null`).
- If the app has its own type registry: one call to `setTypeKey` of the `type-key` unit at start-up. Without it, types compare by their lower-cased name.
- The search, the picker, and every write: this unit does none.

## Do not

- Do not list an Authority or a Resource Owner among the plain stakeholders: they are separate lists, and the card marks each one.
- Do not install a second copy of `type-key`: the type function is module state, and two copies compare types differently.
- Do not read a missing kind set as "no persons exist": `personTypeNames(undefined)` is `["Person"]` because the set was not read, not because Person has no kinds. The host should not apply the constraint rule from a set it has not read.
- Do not call `removingLastPersonAuthority` with the list of all Authorities: pass the person Authorities (`personAuthorities`), or an organization would count as a person.
- Do not store a text name as a relation: a name with no record stays in `a:stakeholders`.

## Wrong readings

- "`stakeholdersOf` lists everyone on the record." It lists the `t:StakeholderOf` rows. Authorities and Resource Owners are `authoritiesOf` and `resourceOwnersOf`.
- "`stakeholderTagTexts` drops an embedded `@id`." It reads it as a text tag: the part after the last `/`. A bare `@id` with no slash is the text itself; an `@id` that ends in `/` is the whole address; an `@id` of spaces gives an empty string in `stakeholderTagText` and nothing in the list.
- "`stakeholdersWithoutTag` compares loosely." It compares the trimmed stored text with `tag` exactly: case and surrounding spaces of `tag` count.
- "`sameRecord` ignores the host." It does not: the same id on another host, or on the other of `/base/` and `/vault/`, is another record. Only a query or text after the id is ignored.
- "`personTypeNames` lists a kind once for each parent." It lists each name once. A kind with two parents is listed where the walk first reaches it.
- "`isConstraintType` is case-sensitive." Under the default type key it is not (`t:functionconstraint` is a constraint). `isPersonStakeholderType` is: `t:person` is not Person.
- "`actsForOnRelation('base:')` is null." It is the vault prefix with nothing after it (`https://<host>/base/`): the check is that the text starts with `base:`.
- "`legacyAuthorityOf` falls back to a full-IRI key when the bare key is there but unusable." It does not: a full-IRI key is read only when neither `authorityHolder` nor `a:authorityHolder` is present.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`:

- `src/lib/base/planStakeholders.ts` lines 21-226 to `src/planStakeholders.ts`. Code verbatim; the header and three doc comments (a round number in front of a sentence) are made generic. Taken: the constants, `LinkedStakeholder`, the private helpers `asData`, `str`, `addressTail`, `itemsOf`, `isRole`, `sameType`, `linksOfType`, `refId`, `factRef`, and the exports `stakeholderTagText`, `stakeholderTagTexts`, `stakeholdersWithoutTag`, `stakeholdersOf`, `authoritiesOf`, `resourceOwnersOf`, `linkedStakeholders`, `sameRecord`, `alreadyLinked`, `legacyAuthorityOf`, `actsForOnRelation`, `AuthorityWrite` (with its `relationType?` field). The source's `handleFromFacts` (old lines 429-436) is not taken: the app removed it. The imports are re-pointed: `./entityRefFacts` (`entityRefFromFact`) is `@kaigilb/gilbplatformcode-entity-ref`; `./planCard` (`memberValue`) is `@kaigilb/gilbplatformcode-plan-card-facts`; `./recordPlane` (`typeLocalName`) is `@kaigilb/gilbplatformcode-type-curie`; `./relations` (`RecordRelation`) and `./relationDoc` (`roleIs`) are `@kaigilb/gilbplatformcode-relation-role`; the type `RelationDoc` is `./relationDoc` (below).
- Left out (they do I/O or search, or exist only for those): `authorityFacts` (lines 228-233, used only by the writer), `writeAuthorityRelation` (236, calls `writePairRelation` and `memberEntityUri`), `endThenWriteAuthority` (266, calls `endRelation`), `migratedAuthorityRelation` (275, calls `writeAuthorityRelation`), `ReadFn` and `StakeholderFind` (295-302), `orgHit` (305, calls `entityDisplayName`), `asOrgHits` (312), `findStakeholderRecords` (322, `searchEntities`, `readRecord`, `listVaultRecordsPage`, `searchVaults`), `findAnyRecords` (378, the same). With them go the imports of `./entityDisplayName`, `./planSearch`, `./relationWrite`, `./search`, `./records`, `./vaultSets` and `./orgCard/orgRecords`. The writers and the finders are a later unit's.
- `src/lib/base/relationDoc.ts` lines 11-24 (the interface `RelationDoc`) to `src/relationDoc.ts`, code verbatim, one comment made generic. Only the type is taken; its readers are not.
- `src/lib/base/planConstraint.ts` (whole, 88 lines) to `src/planConstraint.ts`. Code verbatim except the imports: `./recordPlane` (`typeLocalName`) is `@kaigilb/gilbplatformcode-type-curie`; `./relations` (`RecordRelation`) is `@kaigilb/gilbplatformcode-relation-role`; `import { typeFacetKey } from "./workingSetFacets"` is `import { typeKey as typeFacetKey } from "@kaigilb/gilbplatformcode-type-key"` (the call sites are unchanged; the app's `typeFacetKey` asks its type registry first, the unit's default key does not, and `setTypeKey` puts the registry back); `kindDescendants` and the type `StakeholderKindType` of the private package `gilb-stakeholders` are `./kinds`; `StakeholderTypeSet` of `./stakeholderKinds` is `./kinds`; `./planStakeholders` is unchanged.
- `src/kinds.ts` is copied: `StakeholderKindType`, `KindDescendant` and `kindDescendants` from the private package `gilb-stakeholders` at its commit `27fe0cef35857c070354c0439c6e4e4ebcc62815` (`src/kinds.ts` lines 24-40 and 262-290), and `StakeholderTypeSet` from GilbApp `src/lib/base/stakeholderKinds.ts` lines 41-57. One change: the parameter type of `kindDescendants` is `{ types: StakeholderKindType[] }` where the source says `Pick<StakeholderKinds, "types">`; it is the same type (`StakeholderKinds.types` is `StakeholderKindType[]`), written without the rest of `StakeholderKinds`, which pulls in the predicate and shortcut types of that package. Comments made generic. The package's other functions (`asKindTypes` is the app's, in `planConstraint.ts`) are not taken.

The peers' bodies were compared with the app's (comments stripped): `entityRefFromFact` of `entity-ref` is the same logic as the app's (the unit adds a check that three regex groups are not undefined, which cannot fail); `memberValue` of `plan-card-facts` and `typeLocalName` of `type-curie` are the same as the app's `planCard.ts` and `recordPlane.ts` functions; `roleIs` of `relation-role` is the app's `relationDoc.ts` function.

`src/index.ts` is new. The tests: `planStakeholders.relations.test.ts` (4 cases) is ported from the Authority tests of `planStakeholders.vaultit.test.ts` (the relation readers, the older holder keys, the acts-for expansion); `planConstraint.relations.test.ts` (4 cases) from `planConstraint.vaultit.test.ts`, all four. Same inputs and expectations; hosts are `example.test` and the people Ann and Ben. Not ported: the write cases of `planStakeholders.vaultit.test.ts` (`writeAuthorityRelation` twice, `endThenWriteAuthority`, `migratedAuthorityRelation`: they test the writers), and the cases of `planSearch.vaultit.test.ts` and `planQaTester2.vaultit.test.ts` that call `findStakeholderRecords` and `findAnyRecords`. The Development Resource tests of the app (`planResource.vaultit.test.ts`, `planResource.rqa1.test.ts`) call none of this unit's functions; the Resource Owner cases are in the app's component tests, which draw the card, and are not ported; `resourceOwnersOf` is pinned in `planStakeholders.test.ts`. `planStakeholders.test.ts`, `planConstraint.test.ts`, `kinds.test.ts`, `exports.test.ts` and `example.test.ts` are new and pin every export.
