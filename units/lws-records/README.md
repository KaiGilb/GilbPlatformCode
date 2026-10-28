# lws-records

Reading, creating and changing one record in a vault over the platform's record interface, with the typed errors a refused write throws.

## What this is

Reading, creating and changing one record in a vault over the platform's record interface, with the typed errors a refused write throws.

The typed client for one record: read it with its version, create one in a named vault, change facts of it with a merge patch. Each call is addressed at the vault the record lives in, signs through the auth seam (`lws-session-bridge`) and turns a refusal into a typed error. It also holds what a write needs to spell a fact the way the vault stores it: it reads the vault's own `@context` and its datom log, and so does not invent a key that names no term. Plain functions and types, no React.

- `readRecord(id, at)`: `GET /lws/r/<id>` at the origin `at` names (the record's own entity URI; `null` only where no URI exists). A `BaseRecord`, or `null` on 404. Every read is its own request: there is no join of reads.
- `createRecord(vaultNamespace, typeUri, facts, nameHint?, source?)`: `POST /lws/vault/<vaultNamespace>/c`, the new record lands in THAT vault. Answers `{ id, etag }`. Signed with the sender-constrained credential (`dpopWriteAuth`).
- `patchRecord(id, patch, at, source?, precondition?)`: `PATCH /lws/r/<id>`, JSON merge patch; a `null` member deletes the fact. `precondition.ifMatch` makes it conditional. Answers `{ etag }`.
- `retypeRecord(id, typeBare, ifMatch, at, facts?, source?, keepEmpty?)`: `PUT /lws/r/<id>` with `If-Match`, the same id and a new type (the type goes on the wire as the CURIE `t:<Type>`); `facts` are the whole fact set, built with `factsAsServed`. An empty type is refused before anything is sent. Answers `{ etag }`. Added in 0.3.0.
- `deleteRecord(id, at, precondition?)`: `DELETE /lws/r/<id>`; a 404 or 204 is done, except that a conditional delete (`precondition.ifMatch`) treats a 404 as an error with status 404. Added in 0.3.0.
- `withTypeUri(rec, typeUri)`: the record with its type replaced; the `typeSubstituted` mark is kept only while the new type is still the unknown marker. Added in 0.3.0.
- `recordFromServed(id, doc, etag)`: a `BaseRecord` from a document the vault served.
- `factsAsServed(served, at, edit?)`: the facts a full-state write sends for a record you have read: every fact you did not edit exactly as the vault served it (a link stays `{ "@id" }`, a list stays a list, a fact the editor never held is kept), your own edits as typed. It reads the vault's own `@context` only when a kept fact is a bare address-shaped string. Throws `ServedShortFormError` for a short-form address the document itself does not declare, `ServedLinkUnreadableError` when the vault's description cannot be read to tell a link from text. With `RecordFacts`, the type of the editor's facts and `edit`'s `held` and `send`.
- `writeSource(rec)`: `[]` for a record that carries no served keys, else `[{ at, servedKeys }]`, to be spread into a write (`patchRecord(id, patch, at, ...writeSource(rec))`) so a record with no vault provenance keeps the arity of the call.
- `hasSubstitutedType(rec)`, `isFactStringFaithful(value)`.
- `RecordConflictError` (412 and 428), `RecordForbiddenError` (403, carrying the server's sentence as `reason`).
- `storedSpellings(slugs, source)`, `loadVaultContext`, `readVaultContext`, `parseVaultContext`, `parseVaultPrefixes`, `vaultContextUrl`, `resolveStoredSpellings`, `storedSpellingFor`, `namesNoStoredFact`, `omittableAssembledKeys`, `VAULT_CONTEXT_READ_MS`, `VAULT_CONTEXT_RETRY_MS`, and the types `BaseRecord`, `ServedDocument`, `RecordFactValue`, `RecordCreateFacts`, `WriteSource`, `MergePatchValue`, `VaultContextTerm`, `VaultContextTerms`, `VaultContextRead`, `StoredSpelling`: the vault-own spelling of a fact.
- `serverErrorText`, `serverReasonOrNull`, `parseServerErrorBody`, `carriesReason`, `NO_REASON_TAIL`, `ServerErrorBody`: the one reader of a failure body, so a refusal reaches the person as the sentence the server sent and not as its machine name.
- `resetVaultContextCache()`, `resetStoredSpellingCache()`: test seams that empty the two module caches below.

The unit holds two pieces of module state, `reads` (the vault `@context`, read once per address and kept; a read that was not answered is asked again after `VAULT_CONTEXT_RETRY_MS`) and `liveAttributeCache` (the live attribute set of one entity's datom log, kept per entity URI; an empty reading is never kept). An app must have ONE copy of this unit, or each copy asks and keeps its own. It reads the settings of `base-origin` through `vault-origin-rule` when a function is called, and signs through `lws-session-bridge`. Its peers: `base-origin`, `vault-origin-rule`, `record-types`, `lws-session-bridge` (which needs `signin`).

## What this is not

- Not the whole record client of the app. Only the symbols the Plan-card readers reach from `readRecord`, `patchRecord`, `createRecord`, `RecordConflictError`, `RecordForbiddenError`, `hasSubstitutedType`, `typeUriForVaultNamespace` and, since 0.2.0, `factsAsServed` and `writeSource` are taken. Not here: `replaceRecord` and `ensureSelfCardRecord`. (`retypeRecord`, `deleteRecord` and `withTypeUri`, which the record hooks reach, are here since 0.3.0.)
- Not a re-export of `record-types`. The app's `records.ts` imports `./recordTypes` and does not re-export it, so the other units import `resolveType` and the rest from `record-types` itself. `typeUriForVaultNamespace` is used by `retypeRecord` (0.3.0), which imports it from `record-types`.
- Not the app's `types.ts`. The session types it holds (`BaseSession`, `VaultInfo`, `readSessionVaults`, ...) belong to the replaced token and DPoP modules and are `lws-session-bridge`'s `LwsSession` here.
- Not a cache. It remembers a vault's `@context` and datom log (the two caches above) and nothing else; every record read is a request.
- Not a sign-in. It asks the auth seam for headers.

### Changes in 0.3.0

Taken from the same GilbApp commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, because the record hooks (`plan-record-hooks`) retype and delete records. New code, copied by script from `src/lib/base/records.ts`: lines 361-369 (`withTypeUri`), 885-935 (`retypeRecord`), 1004-1029 (`deleteRecord`). Named changes: the import from `record-types` gains `typeUriForVaultNamespace`; `retypeRecord` and `deleteRecord` hand their method to the credential seam, `authHeader(reqUrl, "PUT")` (source line 922) and `authHeader(reqUrl, "DELETE")` (source line 1017), because a DPoP proof binds the method (the app's call had no second argument). Nothing of 0.2.0 changed. Tests: `src/recordsWrites.test.ts` (8) is ported from `records.test.ts` (the `deleteRecord` block, 1 test, and the `retypeRecord` block, 3) and `records.deleteIfMatch.v38.test.ts` (4); the ported retype blocks reached the function by a dynamic import and here import it at the top. New: `src/recordsMethods.test.ts` (8: `withTypeUri` and the method each write hands to the seam). The peer range of `lws-vault-sets`, `record-cache-kit` and `lws-relations` on this unit is `^0.3.0`.

### Changes in 0.2.0

Taken from the same GilbApp commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, because the relation unit's share act (`lws-relations`) re-asserts a record's whole fact set and needs it. New code, copied by script from `src/lib/base/records.ts`: lines 236-238 (`RecordFacts`), 435-452 (`writeSource`), 703-843 (`ServedShortFormError`, `ServedLinkUnreadableError`, `inlineContext`, `ABSOLUTE_IRI`, `SHORT_FORM`, `factsAsServed`, `servedAsAddress`). The import from `./vaultContext` gains `parseVaultContext`, `parseVaultPrefixes` and `readVaultContext` (the unit already holds them). Nothing of 0.1.0 changed. No new named change: the new lines are verbatim except comments that name a host. Tests: `src/factsAsServed.test.ts` (19 tests) and `src/factsAsServed.gaps.test.ts` (5) are ported from `src/lib/base/factsAsServed.c214gapp42.test.ts` and `factsAsServed.c214gapp42.vatester.test.ts`, with the hosts made `example.test` hosts, the app's mocks of `./dpop` and `./token` replaced by the fake `LwsAuthHost` (`setUp()`), and the local-rig case run with `setBaseOrigin` and `setLocalRigHosts` in place of the environment and a module reload. The two "Share this item" cases of the first file go through `shareEntity` and are in `lws-relations`. New: `src/writeSource.test.ts` (8 tests: `writeSource`, the two errors, a null fact, a list of addresses). The peer range of `lws-vault-sets` and `record-cache-kit` on this unit is `^0.2.0`.

## How to take it

Package: `@kaigilb/gilbplatformcode-lws-records`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/lws-records` prints:

```sh
npm install <path-to-the-library>/units/lws-records
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-session-bridge`'s does, because a unit's type check reads its peers' source and the peer `signin` does not pass it.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { createRecord, patchRecord, readRecord, RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: "https://platform.example.test/base/auth/session/dpop-token" })));

const { id } = await createRecord("https://kai.platform.example.test/base", "t:Note", { title: "Hello" }, "Hello");
const rec = await readRecord(id, "https://kai.platform.example.test/base/e/" + id); // { facts: { title: "Hello" }, etag, ... } or null
try {
  await patchRecord(id, { title: "Edited" }, rec!.entityUri ?? null, undefined, { ifMatch: rec!.etag });
} catch (e) {
  if (e instanceof RecordConflictError) { /* the record changed elsewhere: read it again */ }
}
```

## What the host must supply

- `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, once at start-up.
- `setLwsAuth(host)` from `lws-session-bridge`, once at start-up. Called before it is set, a call that signs a request rejects with an error that names `setLwsAuth`. The one place that does not fail loudly is the datom-log read inside `resolveStoredSpellings`, which sends no credential when signing throws (as the app's did).
- On a local development rig only: `setLocalRigHosts([...])` from `base-origin`.

## Do not

- Do not pass `undefined` for `at` to `readRecord`, `patchRecord`: the parameter is required so that a call site that dropped the record's own URI does not compile. Pass `null` only where no URI exists; the request then goes to the platform origin and reaches only the vault that origin names.
- Do not build an `a:<slug>` key by hand for a fact the vault served. Pass the record's `servedKeys` and `entityUri` as `source` (`{ at, servedKeys }`), and let `storedSpellings` spell it. A slug the app authors keeps the `a:` form.
- Do not use `createRecord` for a self-card; it is not idempotent.
- Do not install a second copy of this unit.

## Wrong readings

- "A 401 on a read drops a different token from a 401 on a create." In the app it did (a read dropped the bearer token, a create the DPoP token). Here both drop the one held token: `readRecord` and `patchRecord` call `tokenManager.invalidate()`, `createRecord` calls `invalidateDpop()`, and the default host makes both `session.invalidate()`. The two calls are kept as the app wrote them, so a host that holds two tokens still can.
- "The id-keyed calls send a bearer token." They ask `bearerHeaderFor`, which here answers the same DPoP pair as the create (the bridge's README says why). `readRecord` asks it with the URL alone and gets a proof for a GET; `patchRecord` names `"PATCH"`. That second argument is the one change to the app's calls (see below). Whether the server accepts DPoP alone on `GET` and `PATCH /lws/r/<id>` is not proven here; only the create's use of it is the app's own.
- "`createRecord` writes into the sign-in vault." It writes into `vaultNamespace`, named as a path segment. A vault the principal cannot write is refused by the server (403, `RecordForbiddenError`), a request that names no vault is a 400; neither is retried or redirected.
- "A 403 says the record is read-only." The sentence is the client's guess unless the server sent a reason; then the server's reason is appended and available as `reason`.
- "`readRecord` joins reads of one record." It does not: every read is its own request, and a read asked after a write answers the record after it.
- "An `a:`-prefixed key is always written." Only a slug the app authors is. A slug the vault served is spelled as the vault stores it, read from its own `@context` and datom log; an unreadable log or `@context` falls back to `a:` + the slug. A bucket the vault assembles at read time (`functions`, `constraints`, ...) is left out of a write when the vault's log shows no stored row of it.
- "`factsAsServed` sends the editor's strings." It does not: a fact you did not edit goes back as the vault served it, so a link is not stored as the text of its address. A fact the editor held but the write leaves out of `send` is dropped on purpose (a retype into another kind). A fact the editor never held is kept.
- "The empty string clears a fact." On `patchRecord`, a `null` clears; an empty string is sent as it is. `createRecord` omits an empty string and keeps `0` and `false`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer):

- `src/lib/base/records.ts` to `src/records.ts`: lines 45-139 (`BaseRecord`), 141-154 (`ServedDocument`), 156-163 (`RecordConflictError`), 165-187 (`RecordForbiddenError`), 189-220 (`RecordFactValue`), 222-234 (`RecordCreateFacts`), 236-238 (`RecordFacts`, 0.2.0), 240-241 (`FRAME_META_KEYS`), 243-247 (`authHeader`), 249-264 (`throwForStatus`), 266-283 (`throwForCreateStatus`), 285-290 (`idFromResourceUrl`), 292-303 (`factToString`), 305-348 (`isFactStringFaithful`), 350-354 (`typeWasSubstituted`), 356-359 (`hasSubstitutedType`), 371-380 (`typeUriFromFrame`), 382-408 (`toWireFacts`), 410-433 (`WriteSource`), 435-452 (`writeSource`, 0.2.0), 454-505 (`storedSpellings`), 507-512 (`slugFromName`), 514-553 (`createRecord`), 626-647 (`readRecord`), 649-657 (`readRecordOnce`), 659-701 (`recordFromServed`), 703-843 (`ServedShortFormError`, `ServedLinkUnreadableError`, `inlineContext`, `ABSOLUTE_IRI`, `SHORT_FORM`, `factsAsServed`, `servedAsAddress`, 0.2.0), 937-948 (`MergePatchValue`), 950-1002 (`patchRecord`);
- `src/lib/base/records.ts` to `src/records.ts`, added in 0.3.0: lines 361-369 (`withTypeUri`), 885-935 (`retypeRecord`), 1004-1029 (`deleteRecord`);
- `src/lib/base/serverError.ts` to `src/serverError.ts`: lines 1-132, the whole file;
- `src/lib/base/vaultContext.ts` to `src/vaultContext.ts`: lines 1-49 (the file's header comment), 54-69, 71-72, 74-75, 77-104, 106-117, 119-124, 126, 128-129, 131-147, 149-169, 171-185, 187-205, 207-212 (`resetVaultContextCache`, a test seam), 214-274 (a comment block), 276-283, 285-358, 360-397, 399-403, 405-408 (`resetStoredSpellingCache`, a test seam), 410-415, 417-467, 469-512, 514-534, 540-618. The two test seams are not reached by product code; they are taken with the caches they empty, because the ported tests use them.

Named changes, and only these (the 0.3.0 changes are in "Changes in 0.3.0" above):

1. in `records.ts` the imports `./config`, `./token`, `./bearer`, `./dpop` and `./recordTypes` are replaced by imports of `vault-origin-rule` (`LWS_RESOURCE_URL`, `LWS_VAULT_CONTAINER_URL`; `LWS_VAULT_SELFCARD_URL` is not imported because only `ensureSelfCardRecord` uses it), `lws-session-bridge` (`NotSignedInError`, `tokenManager`, `bearerHeaderFor`, `dpopWriteAuth`, `invalidateDpop`) and `record-types` (`attrKey`, `normalizeTypeUri`, `typeUri`). The names the taken code does not use are dropped from the import lists (`typeUriForVaultNamespace`, and `parseVaultContext`, `parseVaultPrefixes`, `readVaultContext` from `./vaultContext`);
2. in `vaultContext.ts` the imports `./config` and `./recordTypes` are replaced by `vault-origin-rule` (`atVaultOrigin`, `vaultOriginOf`) and `record-types` (`isAppAddressableSlug`);
3. the dynamic import `await import("./dpop")` (line 448) is `await import("@kaigilb/gilbplatformcode-lws-session-bridge")`;
4. `authHeader` (line 245-246) takes an optional `method` and passes it to `bearerHeaderFor`, and `patchRecord` (line 984) calls `authHeader(reqUrl, "PATCH")`. This is the only change in what the code does: a DPoP proof names the method, and the app's bearer token did not;
5. comments that name a host are reworded, and `BASE_ORIGIN` in a comment reads `baseOrigin()`; no code changed.

`serverError.ts` is the file as it is. `src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, the served-`@context` pin in `test/servedContext.fixture.ts`, neither shipped): the app's mocks of `./token` and `./dpop` are a fake `LwsAuthHost` set with `setLwsAuth`, and the settings are set in place of the environment, with the hosts changed to `example.test` hosts. Ported: `serverError.test.ts` (all 17); `vaultContext.storedSpelling.test.ts` (all 13); `records.storedSpelling.test.ts` (all 15; its app version wrote the served facts back with `replaceRecord`, a full-state PUT that is not taken, so they go back through `patchRecord` and `put` is that body: both spell their keys with the same `storedSpellings`); `records.inflight.test.ts` (both tests of `records.inflight.m3f.test.ts`); from `records.test.ts` 8 of 16 (the `createRecord`, `readRecord`, `patchRecord` and "auth handling" blocks); from `serverErrorRelaySites.test.ts` 2 of 15 (the `records` block); from `credentialHost.d10.test.ts` the ten URIs of the `readRecord` block, with a real session and proof. Left out, with reasons: from `records.test.ts` the `replaceRecord`, `deleteRecord` and `retypeRecord` blocks (not taken); `records.deleteIfMatch.v38.test.ts` (all 4, `deleteRecord`); `records.inflight.s117.agenttester.test.ts` (both, `deleteRecord` and `deleteStepRecord` of a module that is not taken); the other 13 tests of `serverErrorRelaySites.test.ts` (`vaultAccess`, `registryLookup`, `orgListing`, `relations`); the rest of `credentialHost.d10.test.ts` (members find, history, photo and ontology write; the `vaultOriginOf` table is in `vault-origin-rule`); `recordTypes.*` tests (they test `record-types`, not a symbol reached through this unit). New: `records.reads.test.ts` (28 tests of the helpers, the statuses and the addresses), `lwsRecords.test.ts` (the export list), 6 tests in `records.test.ts` (the method of the PATCH, `If-Match`, 409 and 412, the 400 and the typeless record) and 4 in `vaultContext.storedSpelling.test.ts` (the datom-log read and the auth seam). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
