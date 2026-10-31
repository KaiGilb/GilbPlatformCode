# related-children

Lists the records that point at this one as a member, read from the parent's own vault.

## What this is

Lists the records that point at this one as a member, read from the parent's own vault.

A record card can show a "Children" list: the records whose `a:memberOf` fact names the open record. Containment is a fact on the child, not a relation, so the open record does not hold the list; it is read backwards, from the platform's reverse index.

- `RelatedChildren({ record, vaultId, onOpen? })` (`onOpen(id, entityUri?)`: since 0.1.1 `entityUri` is the child's own address, when it has one): the list. Its pool is the vault's recency page (`useRecords(vaultId)`) UNION the hydrated reverse set, each record once (the two overlap, and a doubled row would be a duplicate key and would inflate the count). Each row is the record's name (the `entity-ref-value` rule: label, term label, title, name, the master tag, the file name, else the tail of its address, else "Untitled") and the slug of the fact that points here; with `onOpen` the name is a button that opens the child by id. Under the list, when the platform reports more children than are shown, the line "N of M member-of children". It draws nothing when no child is known and the total is 0. When the total is above 0 and no child is shown, it still discloses: "0 of M member-of children".
- `useMemberOfChildren(parentUri)`: the query behind it, key `["base", "memberOfChildren", parentUri]`, fresh for 30 seconds, off for a missing parent. `loadMemberOfChildren(parentUri, qc?)` is its function: the records of the page's cache that point at the parent (`cachedRecordsPointingAt(qc, parentUri)`), then the ids the platform's reverse index holds (`findAllMemberOfIds(parentUri)`), then at most `MEMBER_OF_HYDRATE_CAP` (80) records in all, the cached ones counting against it; `total` is the larger of the index's count and what was hydrated, never lower.
- `MEMBER_OF_ATTR` (`a:memberOf`), `MEMBER_OF_FIND_PAGE` (200, one find page), `MEMBER_OF_HYDRATE_CAP` (80). The walk of ids stops at 600 (private).

## What this is not

- Not a graph. A graph that reads `loadMemberOfChildren` can use the same exports; this unit draws only the list.
- Not for an organization card. An organization card has no generic Children list: its member-of people are its Employees group, a short list, and a second list of the same people was up to ~80 rows and ~80 record reads on every open. The host decides which cards draw `RelatedChildren`; it does not decide for itself.
- Not a finder of children kept in a DIFFERENT store than their parent: the find answers only from the store of the host asked. That needs the platform.
- Not a writer.

## How to take it

Package: `@kaigilb/gilbplatformcode-related-children`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/related-children` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/related-children
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/related-children/src";`. The page must define these variables (all three are read): `--ink` (the names), `--accent` (a name under the pointer), `--ink-ghost` (the heading, the slug and the disclosure line).

## Requests and their servers

Reads only.

- `GET /base/find-by-attribute?attr=a:memberOf&value={"@id":"<parent>"}&limit=200[&offset=..]` through `pageAllByAttribute` of `lws-vault-sets`, asked at `vaultOriginOf(parentUri)`: the PARENT'S OWN node. The route has no crossing: it answers only from the store of the process at the host asked, so a parent in a vault minted since 2026-08-20 asked at the base address answers "none" with no error. A system-vault parent is asked at its own host; a parent with no host to route by (a bare id) is asked at the base address. The proof is signed for the host fetched (`lws-session-bridge`). With the platform's apex set as the base origin every vault's subdomain resolves to its own node. One request per 200 ids, up to 600 ids.
- Then up to 80 `GET /lws/r/<id>` (`readRecord` of `lws-records`), one per child, each at the child's own entity address, all started together. A read that fails is dropped from the list (the total does not shrink).
- It signs through the `lws-records` and `lws-vault-sets` auth seam (no call of its own).

A card for a person reads this reverse index on EVERY open (up to 1 find per 200 ids plus up to 80 reads): the cost is the reason an organization card does not draw the list.

## Examples

```tsx
import { RelatedChildren } from "@kaigilb/gilbplatformcode-related-children";

function Card({ record, vaultId, isOrganization, onOpen }: Props) {
  return <>{isOrganization ? null : <RelatedChildren record={record} vaultId={vaultId} onOpen={onOpen} />}</>;
}
```

## What the host must supply

- One `QueryClientProvider` above the component (the unit makes no client).
- The platform settings the peers need, once at start-up: `setBaseOrigin(...)` (and `setSystemVaultHosts([...])`) from `base-origin`, and the auth seam `setLwsAuth(...)` from `lws-session-bridge`.
- Tailwind scanning this unit's `src` and the three CSS variables above.
- The vault's list in the page's cache (`useRecords(vaultId)`, `plan-record-hooks`), which `RelatedChildren` reads; with no list the pool is the reverse set alone.

## Module state

None of its own. The query client holds `["base", "memberOfChildren", parentUri]` (30 s).

## Do not

- Do not draw `RelatedChildren` on an organization card.
- Do not ask the find at the base address for a parent in another vault: it answers "none". The origin is the parent's own, taken from its address; `findAllMemberOfIds` takes no origin.
- Do not raise `MEMBER_OF_HYDRATE_CAP` without the cost in mind: with 100 seed records and the children, a graph stays within the platform's edge-assembly limit of 200.
- Do not use `entity-ref`'s `refDisplayName` for the name: it is the shorter rule. The card's name rule is `entity-ref-value`'s.
- Do not list a record that names the parent only through an identity slug (`claimSubject`, `heldParty`, `profilePhoto`, `principalUri`, `directReader`, `directWriter`, `aliasUri`, `accountSubject`, `registeredVault`, `vaultAddress`, `anchorBoundEmail`) as a child: they are `SKIP_SLUGS` of `plan-links-model`.

## Wrong readings

- "The list is every child." It is at most the records of the vault's recency page and 80 hydrated ones; the line "N of M member-of children" says how many exist.
- "A child that could not be read is not counted." It is counted in M and not shown.
- "A cached child costs a read." It does not: it is not read again, and it takes one of the 80 places.
- "`total` is the number shown." It is the platform's count (or the number hydrated, if larger).

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/entityRefChildren.ts` (whole) to `src/entityRefChildren.ts`: `MEMBER_OF_ATTR`, `MEMBER_OF_FIND_PAGE`, `MEMBER_OF_HYDRATE_CAP`, `MEMBER_OF_ID_CAP`, `MemberOfChildren`, `asRecord` (private), `cachedRecordsPointingAt`, `findAllMemberOfIds`, `loadMemberOfChildren`, `useMemberOfChildren`.
- `src/components/records/EntityRefValue.tsx` lines 93-163 (`RelatedChildren`) to `src/RelatedChildren.tsx`.

Named changes, and only these:

1. The skip set. The source's `entityRefsOf` and `childrenPointingAt` skip eleven identity slugs inside; the `entity-ref` unit takes the set as an argument. `entityRefsOf(rec)` is `entityRefsOf(rec, SKIP_SLUGS)` and `childrenPointingAt(record, pool)` is `childrenPointingAt(record, pool, SKIP_SLUGS)`, with `SKIP_SLUGS` from `plan-links-model` 0.2.1 (exported there for this; 0 diff against the source's `entityRefFacts.ts` lines 21-33).
2. The imports are imports of units: `entityRefFromFact`, `entityRefsOf`, `childrenPointingAt` from `entity-ref`; `refDisplayName` from `entity-ref-value` (NOT `entity-ref`'s, which is a different, shorter function); `readRecord`, `BaseRecord` from `lws-records`; `cacheRowsOf` from `record-detail-reads`; `vaultOriginOf` from `vault-origin-rule`; `idFromEntityUri`, `pageAllByAttribute` from `lws-vault-sets`; `useRecords` from `plan-record-hooks`.
3. The header comments are new, and the comments that name a cycle, a ticket, an agent, a date of a ruling or a host are reworded with the same facts. The comment that says an organization card draws no such list was at the call site in `RecordDetail.tsx` (lines 2013-2018); its fact is in the header of `RelatedChildren.tsx` and in this README.

The comment-stripped, import-free `entityRefChildren.ts` equals the source file but for the one `SKIP_SLUGS` argument (360 and 361 words). `RelatedChildren.tsx` equals the source function but for the one `SKIP_SLUGS` argument (the source range also holds the `export type { EntityRef }` line after the function, which is not taken). `src/index.ts` is new.

Peers' bodies compared with the source's (comments stripped): `pageAllByAttribute` 0 diff; `idFromEntityUri` of `lws-vault-sets` 0 diff (`id-tail`'s is the same logic); `cacheRowsOf` 0; `useRecords` 0; `refDisplayName` of `entity-ref-value` 0 (that of `entity-ref` 15 diff lines); `readRecord` 0; `vaultOriginOf` 12 lines, all `BASE_ORIGIN` read as `baseOrigin()` (that unit's change); `entityRefFromFact` 9 lines (guards against an undefined regex group), `entityRefsOf` 4 (the set as an argument), `childrenPointingAt` 25 (the set; a row leaves `entityUri` out when the child has none, where the source's row holds `entityUri: undefined`; nothing here reads the difference).

Not taken, because a unit holds it: `attributeFindPaging.ts` (whole, `lws-vault-sets`); in `entityRefFacts.ts`, `findEntityRefPairs`, `missingEntityRefTargets`, `EntityRef`, `EntityRefPair` (`entity-ref`; not reached).

## Tests

66 tests in 5 files (`npx vitest run`):

- `entityRefChildren.test.tsx` 16, ported: 2 of 3 from `entityRefChildren.test.ts` (the third tests `findByAttribute`, `lws-vault-sets`'), 7 of 10 from `entityRefChildren.c150qa.test.ts` (paging, the 600-id cap, the short page, the write-shaped value, the honest total, the unreadable child; the three older-platform fallback cases test `findByAttribute`), 7 of 7 from `entityRefChildren.twoHost.d9.test.ts` (the parent's own host, the second-store vault, the system parent, the bare id, the refused paging; the proof-signature assertions are `lws-session-bridge`'s). Re-based on the real `lws-vault-sets`, `lws-records`, `vault-origin-rule` over a fake platform in which every host is a store (`test/support.ts`), in place of the source's `vi.mock`.
- `RelatedChildren.test.tsx` 12: the 5 cases of `RelatedChildren.disclosure.test.tsx` ported (the source mocked `useRecords` and `useMemberOfChildren`; here the list is the seeded page cache and the reverse index is the real hook over the fake platform), and 7 new: the list, `onOpen`, the name rule, the parent never its own child, the eleven skipped slugs, another slug listed, the cached scan skipping them.
- `memberOf.test.tsx` 22 (new): the constants; the cap of 80 with 0, 3, 80 and 81 ids (reads capped at 80, total 81, the first 80 read), cached children counting against it, a cache past the cap leaving no room, a stale count, the reads at each child's node, a duplicate id; the parent's own node is asked (once per page, never the base address; a child in another store is not found); `useMemberOfChildren` (off, key, seed from cache, 30 s fresh, an error is not an empty list); `cachedRecordsPointingAt`.
- `exports.test.ts` 3, `hostAgnostic.test.ts` 13 (the same host-agnostic check test as the other units; it writes to the OS temp directory).

Mutation checks: 24 mutants of `entityRefChildren.ts` and `RelatedChildren.tsx`: 9 aimed at the caps (80 to 81 and to 79, the slice, the cached rows not counting, no clamp, the total hidden or lowered, the 600 walk), 2 at the skip set, 13 at the node asked, the page size, the hook, the de-dupe, the dropped read, the mirror of the detail reads' rebuild, the disclosure and the name rule. 24 killed (the no-clamp mutant survived the first run; a test with 85 cached children now kills it).
