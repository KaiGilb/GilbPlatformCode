# employment-store

Reads, creates and patches the employment entities of a person's record, one t:Employment per employment.

## What this is

Reads, creates and patches the employment entities of a person's record, one t:Employment per employment.

Seven functions over the `t:Employment` entities that a person's `a:employment` edges point to. An employment is its own entity (`a:org` the company name, `a:jobTitle` a scalar for one title and an array for several, `a:claimSlotKey` a minted handle `empx-...`, `a:startDate`, `a:endDate`, `a:ongoing`, `a:workLocation` a place, and optionally `a:employer` and `a:employee`). It is created in the vault that holds the person's record.

`resolveEmployments(doc, vocab, vaultId, linkVocab?, catalogueOrigin?)` dereferences each edge of `doc` in order and answers `{ resolved, unresolved, complete }`. An edge that does not read is **unresolved**, never absent: a 404 merges "absent" with "unreadable", so the caller carries it. `createEmploymentEntity(vaultId, facts, vocab, linkVocab?)` mints one entity and throws, before any request, without a vault. `updateEmploymentEntity(id, facts, vocab, vaultId, entityUri, linkVocab?)` is a MERGE patch of the keys named.

**A null goes on the wire only for a value the person removed.** `facts.titlesStored` is the titles as last read: `a:jobTitle` is nulled only when one of them was non-blank and the edit left none. `facts.roleBefore` is the role as last read: the role keys named are those `roleChangeWire` of `employment-role` names, only what the edit changed. Without either, nothing is nulled. `facts.unlink` (the person retyped the company as plain text) nulls `a:employer` and `a:employee`.

`employmentFactsToWire`, `employmentFromDoc`, `employerOf` and `employmentEdgesFromDoc` are the pure parts. `catalogueOrigin` makes a compact `base:e/<id>` place a full address; without it such a place reads as none, and a full address reads as it is.

Nothing here deletes an entity.

## What this is not

- Not the edges on the record: that is `employment-edges`.
- Not the vocabulary: that is `employment-vocab`, handed in as `vocab`.
- Not a role's rules: those are `employment-role`.
- Not an audience rung: nothing names a visibility tier, and a rung another app stored is left where it is.
- Not a delete: removing an employment drops the edge and leaves the entity.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-store`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-store` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/claim-handle <path-to-the-library>/units/employment-role <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/employment-link <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/employment-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/employment-store
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

`POST /lws/vault/<vault id>/c` (a create, type `t:Employment` as the master spells it, facts as above) and `PATCH /lws/r/<id>` at the entity's own host (a merge patch). No DELETE.

## Requests and their servers

`GET /lws/r/<id>` at the entity's own host, once per edge, one after another, for `resolveEmployments`. Under 1 KB each.

## Examples

```ts
import { resolveEmployments, updateEmploymentEntity } from "@kaigilb/gilbplatformcode-employment-store";

const got = await resolveEmployments({ employment: edges }, vocab, vaultId, linkVocab);
await updateEmploymentEntity(id, { key: "", company: "Acme AS", titles: [], titlesStored: ["CEO"] }, vocab, vaultId, entityUri);
```

## What the host must supply

The session and origins of `lws-records` (set once at start-up); the vocabulary from `employment-vocab`; for places, the catalogue origin as an argument.

## Module state

None.

## Do not

- Do not treat an unresolved edge as a deleted employment: carry it.
- Do not pass a positional handle (`emp1`) as the identity: only a minted handle is written, and an update writes none.
- Do not send `titlesStored` or `roleBefore` that you did not read: they license a null.
- Do not call `createEmploymentEntity` without the vault that holds the record.

## Wrong readings

- "An edit of the company may reset the dates." No role key is named unless the edit changed it.
- "No title means a:jobTitle should be cleared." Only the removal of a stored title clears it.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/lib/mynet/employment/employmentStore.ts` lines 114-422 and 453-560, without `readEmploymentEntity` and `employmentEdgesToWire` (no caller but tests).

## Tests

53 tests in 5 files (`npx vitest run`): `employmentStore.test.ts` 7 and `employmentStore.links.test.ts` 9 (ported from `employmentStore.c214e7.test.ts` and `employmentStore.s8org.test.ts`, re-based on the real peers over an in-memory vault), `employmentStore.wire.test.ts` 23, `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 18 mutants of `src/employmentStore.ts` (a:jobTitle nulled for no stored title, the role before ignored or the whole role written, unlink faults, a positional identity, a create with no vault, an unread edge dropped or deleted, a compact place expanded with no origin, the title and company wire rules, a 404 counted as a read), 18 killed.
