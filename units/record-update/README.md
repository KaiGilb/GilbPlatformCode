# record-update

Saves a record card's edits as one PATCH against the version it read, and keeps every cache of that record in step.

## What this is

Saves a record card's edits as one PATCH against the version it read, and keeps every cache of that record in step.

`useUpdateRecord(vaultId)` is a React Query mutation (key `RECORD_UPDATE_KEY`, `["base", "record-update"]`). You call `mutateAsync({ record, facts, party?, keep?, skipEmpty? })`: `record` is the record as the card read it (with its `facts`, `opaqueFacts`, `etag`, `entityUri`, `typeUri`), `facts` is the facts map the editor holds after the person's edit. It sends ONE merge PATCH (`application/merge-patch+json`) to the record's own address and resolves with `{ etag }`. What it puts in that PATCH is the point of the unit, and it is decided by the sweep:

- **Carrier rename refusal.** Before anything is built, an in-place rename of an assigned tag carrier (`unitTag`, `ruleId`, either spelling) throws `CarrierRenameRefusedError` (`slug`, `served`, `attempted`) and sends nothing. Only served-to-a-different-non-empty value is refused (compared trimmed); setting a carrier that had none, and clearing one (the lawful release), go through.
- **The patch from the editor's facts** (a non-party record): each fact the editor holds is sent (an empty value as an explicit `null`), except a fact in `keep`, and except an OPAQUE fact (one `readRecord` could not express as a string, listed in `record.opaqueFacts`) whose value is still the stand-in the editor was handed: that one is left out, so the platform keeps the structure it holds. A typed value over an opaque fact is written. Before this, `withCanonicalLabel` copies the type's name field into `label` and `title`, except on a Plan record, whose name is its Tag.
- **The retraction sweep.** A merge PATCH keeps what it does not mention, so a fact the record held and the editor DROPPED goes out as an explicit `null`. But only what the editor could have shown: the sweep skips a fact that is in `keep`, an authorization grant (`directReader`, `directWriter`, `readerGroup`, `writerGroup`), a guarded tag attribute (`CARRIER_PRESERVE_SLUGS`: both spellings of `unitTag`, `ruleId`, `tagScope`), an opaque fact, and any key `isAppAddressableSlug` rejects (a foreign predicate such as `skos:exactMatch`, `owl:sameAs`, `role:source`, `filectl:byteSize`, or a colon-bearing key), because another app wrote those and they are preserved by omission. The party path applies the same rule to its drops (`sweepMayRetract`).
- **A party record** (`party` given, a `PartySaveRule` from `stakeholder-card-model`): `partySavePatch` builds the body: only changed facts; the name written under its one home; the legacy label retracted in the same write when the name changed (unless `retractLegacy` is `false`, for a record not known to be a party); `title` never written or retracted. The write is conditional (`If-Match` = the record's `etag`). With `skipEmpty` and an empty body, NO request is sent and the save resolves with the ETag read.
- **If-Match.** Sent for a party save and for a Plan record's save (the first Tag save is a patch like the rest); not for another record's save (a full-version precondition raced with the editor's own debounce and gave a false 412).
- **The caches**, kept in step: at once (`onMutate`) the vault's list row shows the new facts and KEEPS the pre-save ETag (a worse ETag mid-edit would give a false "changed elsewhere"); on success the list row and every cached read of that record (`["base", "record", id, ...]`, only entries that exist) carry the facts and the new ETag; on a 412 (`RecordConflictError`) the record is read again at its own address and both the list and the reads are reconciled to it, and the save rejects; on any other error the list row is put back as it was. The device's working-set replica is told (`rememberRecord`) after a write that landed.

Also exported: `factsAfterPatch(served, patch)` (the facts after a merge-patch body; pure), `recordSavesSettled(qc, id, timeoutMs = OWN_SAVE_WAIT_MS)` (resolves `true` once no card save of that record is out, `false` after the time, 30 s by default: a retype waits for the card's own save), `latestCachedRecord(qc, vaultId, id)` (the record as the card's panes render it: the list row when whole, else the record read), `rebaseOnStored(read, held, stored)` (the card's save rebased on the record as stored now, for a 412 retry: the person's changes kept, another session's values taken, a field changed both ways named in `conflicts`), the constants `RECORD_UPDATE_KEY`, `OWN_SAVE_WAIT_MS`, `TAG_CARRIER_SLUGS`, `TAG_QUALIFIER_SLUGS`, `CARRIER_PRESERVE_SLUGS`, `CARRIER_ONLY_SLUGS`, and the type `UpdateRecordVars`.

## What this is not

- Not the read. Reading a record, and finding the vault that holds it, is `record-detail-reads`; a retype and a delete are `plan-record-hooks`.
- Not the editor. It does not decide which facts a card shows or edits; it is handed the facts map and must not retract what that map never admitted.
- Not the sidecar save (`record-sidecar-save`), which writes a record's sidecar one section at a time.
- Not a merge. `rebaseOnStored` is a pure rebase of three fact maps; sending the rebased save is the card's.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-update`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/record-update` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/tag-carrier <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/record-update
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

It WRITES. Each save sends `PATCH /lws/r/<id>` (merge patch, JSON; `If-Match` for a party save and a Plan record) to the record's own address, through `patchRecord` of `lws-records`, and `GET /lws/r/<id>` once on a 412 to reconcile the caches. It writes only the keys of the patch the rules above produce, on the one record it is given; a refused carrier rename and a `skipEmpty` party save with nothing to send write nothing. It also writes the page's query caches (the vault's list row, the record reads) and the device's working-set replica (`rememberRecord`, in `working-set-store`). It never sends a PUT, a POST or a DELETE.

## Requests and their servers

- `PATCH /lws/r/<id>`: the record's OWN vault node, the authority of `record.entityUri` (the record's entity address), else the base address. The platform answers a record only from the vault that holds it, and the address is kept by `lws-records` (`patchRecord(id, body, entityUri, ...)`); every writer here passes `record.entityUri ?? null`. A record with no `entityUri` is written at the base address, which holds only the base vault's records: the card must pass records read WITH their address (as `readRecord` gives them).
- `GET /lws/r/<id>`, once, after a 412: the same node, to reconcile the caches.
- The credential is signed for the host the request names, through the auth seam of `lws-records` (`lws-session-bridge`), as for every unit.

## Examples

```ts
import { useUpdateRecord } from "@kaigilb/gilbplatformcode-record-update";

const update = useUpdateRecord(vaultId);
// A plain edit: the facts the editor holds, the title changed.
await update.mutateAsync({ record, facts: { ...editorFacts, title: "New title" } });
// A party record (a person): the rule names the name's home; `keep` is what the card does not edit.
await update.mutateAsync({ record, facts: editorFacts, party: { keys: nameKeys }, keep: ["memberOf"] });
```

## What the host must supply

- One `QueryClientProvider` above the hook.
- The platform settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (`base-origin`) and the auth seam `setLwsAuth(...)` (`lws-session-bridge`).
- The record WITH its `entityUri`, `etag` and `opaqueFacts` as `readRecord` returned them. A hand-built record without `opaqueFacts` is a record whose structured facts are not protected.
- For a party save, the `PartySaveRule` (from `partyNameKeys` of `stakeholder-card-model` and whether the kinds are known).

## Module state

None of its own: the mutation state is the query client's, the replica is `working-set-store`'s. (The fresh-create window is in `plan-record-hooks`.)

## Do not

- Do not trim the sweep, or add a key to what it may retract, without a named change: it decides which facts a save retracts.
- Do not hand `useUpdateRecord` a facts map that holds keys the editor never admitted (a foreign predicate): they would be treated as the person's.
- Do not rely on the sweep to release a tag: dropping a carrier is not clearing it; the person clears the field (an empty value is the release).
- Do not set `If-Match` yourself, or send the PATCH another way: the version, the 412 and the cache reconcile are here.
- Do not install a second copy of the `plan-record-hooks`, `record-cache-kit` or `working-set-store` peers beside the one this unit uses.

## Wrong readings

- "The save is a PUT of the whole record." It is a merge PATCH; what is not mentioned is kept by the platform.
- "A dropped fact is always retracted." Only if the editor could have shown it (the sweep's rules).
- "`If-Match` is always sent." Only for a party save and a Plan record.
- "A refused rename is a failed save." It is refused before any request: nothing was sent, nothing needs undoing; the cache is rolled back.
- "`skipEmpty` skips every empty save." Only a party save whose body is empty.
- "A 412 resolves the save." The save rejects with `RecordConflictError` after the caches are reconciled; the card decides whether to retry (`rebaseOnStored`).

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/recordHooks.ts` to `src/recordUpdate.ts`: lines 67-94 (the guarded tag attributes: `TAG_CARRIER_SLUGS`, `TAG_QUALIFIER_SLUGS`, `CARRIER_PRESERVE_SLUGS`, `CARRIER_ONLY_SLUGS`), 96-127 (`CarrierRenameRefusedError`), 2089-2357 (`UpdateRecordVars`, `sweepMayRetract`, `savedFacts`, `factsAfterPatch`, `RECORD_UPDATE_KEY`, `OWN_SAVE_WAIT_MS`, `recordSavesSettled`, `latestCachedRecord`, `useUpdateRecord`);
- `src/lib/base/savedElsewhere.ts` to `src/rebaseOnStored.ts`: lines 17 (`val`) and 40-74 (`rebaseOnStored`).

Imports: from `lws-records` 0.4.0 `patchRecord` (its one token difference is that unit's own named change, `authHeader(reqUrl, "PATCH")`), `readRecord`, `RecordConflictError`, `writeSource`, `BaseRecord`, `RecordFacts`; from `record-cache-kit` 0.3.0 `setList`, `upsert`, `setRecordReads`, `flattenRecordPages`, `recordsKey`, `RECORD_QUERY_HEAD`, `RecordsPage`, `withCanonicalLabel` (all token-equal to the source's); from `plan-kinds` 0.1.0 `isPlanRecordType` (equal); from `record-types` 0.1.0 `isAppAddressableSlug` (equal) and `resolveType` (its one difference is that unit's own named change, `recordTypeByUri()`); from `stakeholder-card-model` 0.1.0 `partySavePatch`, `PartySaveRule` (equal); from `tag-carrier` 0.1.0 `TAG_CARRIER_SLUGS_IN_PRECEDENCE` (equal); from `working-set-store` 0.1.0 `rememberRecord` (equal).

Named changes, and only these: the imports; the four guarded-set constants carry an `export` word (private in the source); `rebaseOnStored` with a named private copy of the one-line `val`; the comments that name a cycle, a ticket, an agent, a person, a ruling or a host are reworded with the same facts, and the doc comment of `UpdateRecordVars` says "merge PATCH" where the source's older text said "PUT" (the code sends a PATCH). No code changed. The comment-stripped file, imports excluded, equals the source ranges (0 diff; 826 words, the four added `export` words ignored); `rebaseOnStored` and `val` equal the source (0 diff; 120 words). `src/index.ts` is new.

Not taken: `useRetypeRecord`, `RetypeChangedElsewhereError` (`plan-record-hooks`), `putRecordInCaches`, `refreshRecordInCaches` (`record-cache-kit`) and `keysSavedElsewhere` (`plan-record-hooks`): the save does not call them. The seam map and the brief listed some of them as dependencies; the code does not reach them. What it does reach and the brief did not list: `rememberRecord` (`working-set-store`), `resolveType` and `isAppAddressableSlug` (`record-types`), `isPlanRecordType` (`plan-kinds`), `tag-carrier`.

## Tests

155 tests in 4 files (`npx vitest run`):

- `recordUpdate.test.tsx` 123, over the real `lws-records`, `record-cache-kit`, `record-types`, `stakeholder-card-model` and `working-set-store` and a fake platform (`test/support.ts`: a fake `fetch` and a fake auth host, no timers except fake ones where the wait is the subject). Ported, re-based at the hook (the source drives them through the whole record screen; here the hook is handed what the screen handed it, and every assertion stays on the transmitted document): `RecordDetail.carrier` 12 of 12 (P0 x2, P1 x2, P2, P3, P4 x2, P5 x2, P6, P7); `RecordDetail.crossAppFact` 9 of 10 tests (X0, X1 x4, X2a, X3, X4, X5); `RecordDetail.objectFact` 13 (O0, O1 x3, O2, O3, O4, O5, O6 first case, O7 x2, the save half of O10, O9); the party-save cases of `RecordDetail.stakeholderCard.c214` 15 (T1, T2, T5, D7 as `keep`, QG1, QG2, RB1 and its control, K1, K3, K4, K5, the fallback guard, RC1 and its control). New: every rule of the sweep one at a time (the grants x4 on both arms, the guarded tag attributes x6, a foreign predicate, an opaque fact, `keep`, a new field, a cleared field), the label copy and the Plan record, the version header, the address, the replica, the optimistic row and its ETag, the success writes, the 412 reconcile (and a record the platform no longer gives), the rollback, the other vaults' lists, `recordSavesSettled`, `latestCachedRecord`, `factsAfterPatch`, the constants.
- `rebaseOnStored.test.ts` 15: the 4 `rebaseOnStored` cases of the source's `savedElsewhere.test.ts`, as they were, and 11 new.
- `exports.test.ts` 4: the twelve exports and their arities, that the sweep's helpers stay private, and that this unit owns no fresh-create state and no record read.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units (it writes to the OS temp directory).

Left out, with reasons (they go through the `RecordDetail` screen or other units): `carrier` P6's second assertion (the screen draws the refusal and not the generic retry notice: the error's message, which the screen shows, is pinned); `crossAppFact` X2b (the pane renders no editable box for a foreign fact: display, not save); `objectFact` O6's second case (`isFactStringFaithful`, tested in `lws-records`), O8 (`asCachedBaseRecord`, ported to `record-detail-reads`), and the two O10 cases on the fan-out mapper and the search hook (other units' code); `stakeholderCard.c214` T6 x2, D7 on a person with a memberOf box, QG3, K2, K3b, the retype cases and every case that reads the card's own state or draws a box (the card, not the save).

Mutation checks: 85 mutants of `src/recordUpdate.ts` and `src/rebaseOnStored.ts`, 84 killed, 1 equivalent. 15 are aimed at the sweep (S01-S15: the grants, the guarded tags, the opaque and foreign arms of both the party rule and the loop, `keep`, the `k in facts` test, the retraction value), 5 at the opaque guard (O01-O05), 10 at the carrier refusal and the guarded sets (C01-C10), 10 at the party path, 9 at the wiring (the label copy, the Plan record, `If-Match`, the address, the write source), 15 at the caches (K), 6 at `recordSavesSettled`, 4 at `latestCachedRecord`, 2 at `factsAfterPatch`, 9 at `rebaseOnStored`. First run: 74 killed, 11 survived. Nine were real gaps and got tests (a dropped `writerGroup` and a dropped foreign predicate on the party arm, a served tag with a trailing space, a `tagScope` rename, the unknown-type name field in the wire and in the cache row, the write source, a second record's row in the list, the wait settled by an unrelated notification, the wait's timer left running, a person's value over an empty stored value in `rebaseOnStored`). The equivalent one is S07: dropping `a:writerGroup` from the loop's grant list changes nothing, because the next line, `isAppAddressableSlug`, already rejects every colon-bearing key.
