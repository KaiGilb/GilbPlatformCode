# vault-resources

Creates, reads, patches and deletes a vault entity by its address, over the record doors.

## What this is

Creates, reads, patches and deletes a vault entity by its address, over the record doors.

Five functions and two types, the vault-write surface that the held-claim modules (notes, languages, labels, organization numbers, place and employment claims) share. Each is a thin wrapper over `lws-records`; none is a second client.

- `createResource(vaultId, { type, facts })` creates an entity in the NAMED vault (`POST /lws/vault/<vault>/c`, through `createRecord`) and answers `{ id, location, etag }`; `location` is the vault namespace plus `/e/` plus the id. A fact key may carry one `a:`; ONE is taken off (the record door adds it back), a bare key is left bare.
- `getResource(id, vaultId, entityUri?)` reads one entity and answers `{ doc, etag, gone, typeUri? }`: the served document (keys as served, values verbatim), its version, and what the store says it is. A 404 is an empty document with `gone: true` (and `etag: null`), so a caller can tell "deleted" from "served with nothing". Any other failure rejects.
- `patchResource(id, facts, vaultId, entityUri?)` sends a JSON merge patch of only the keys given (`null` clears one; one `a:` taken off each key) and answers `{ etag }`.
- `deleteResource(id, vaultId, entityUri?)` retracts one entity. A 404 is already gone.
- `readResources(uris, vaultId)` reads many entities, at most 6 in flight, in input order, each at its own address, and answers `ReadResource[]` (`{ id, uri, doc, gone, typeUri? }`). A 404 comes back `gone` with an empty `doc`; any other failed read rejects the whole read; the caller decides what `gone` means.
- Types: `FactValue` (a fact value as the composers build it: a string, a reference, a list), `ReadResource`.

Where the address is given (`entityUri`), the request is addressed at THAT address's own node. Where it is left out, the address is the vault namespace plus `/e/` plus the id.

## What this is not

- Not a listing (the source's `listRecordsOfType` and `getListedResource` are not taken: nothing here reaches them).
- Not an entity-address builder or an id parser: those are `vault-namespace` (`entityUriInVault`) and `resource-id` (`idFromResourceUri`), and are not re-exported.
- Not a retry, a cache or a conflict handler: a 412 is `lws-records`' `RecordConflictError`, passed through. `patchResource` sends no `If-Match`.
- Not a guard on WHAT may be written. The held-claim modules decide which facts a claim carries (and refuse the privacy keys); this unit writes what it is handed.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-resources`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-resources` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/vault-resources
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

It WRITES. `createResource` creates one entity (`POST /lws/vault/<vault>/c`), `patchResource` changes the keys it is given on one entity (`PATCH /lws/r/<id>`, merge patch, `null` clears), `deleteResource` retracts one entity (`DELETE /lws/r/<id>`). Each acts on the one entity or vault it is handed and on nothing else. `getResource` and `readResources` write nothing.

## Requests and their servers

- `POST /lws/vault/<vault>/c`: the NAMED vault's own node (the host of the vault namespace, through `vaultOriginOf` in `vault-origin-rule`, used by `lws-records`). The platform lands the create in that vault if the signed-in person holds a write grant on it, else refuses; it never lands in the person's own vault instead.
- `GET`, `PATCH`, `DELETE /lws/r/<id>`: the node of the entity's address (`entityUri`, else the vault namespace). The platform answers an entity only at the node that holds it; at any other node (the base address included) a read is the non-disclosure 404, which this unit reports as `gone`. Pass the entity's own address whenever the caller has it.
- `readResources` issues one `GET` per address, at most 6 at a time.
- Credentials are signed for the host each request names, through the auth seam of `lws-records` (`lws-session-bridge`), as for every unit.

## Examples

```ts
import { createResource, getResource, patchResource, deleteResource } from "@kaigilb/gilbplatformcode-vault-resources";

const made = await createResource(vaultId, { type: "t:HeldPartyFieldClaim", facts: { "a:heldParty": { "@id": person } } });
const read = await getResource(made.id, vaultId, made.location);
if (!read.gone) await patchResource(made.id, { "a:note": "kept" }, vaultId, made.location);
await deleteResource(made.id, vaultId, made.location);
```

## What the host must supply

- The platform settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (`base-origin`) and the auth seam `setLwsAuth(...)` (`lws-session-bridge`).
- The vault namespace of the vault written to (`ReachableVault.vaultId`), and the entity's own address where the caller has it.

## Module state

None.

## Do not

- Do not call `getResource`, `patchResource` or `deleteResource` for an existing entity without its `entityUri`, unless the vault named is the vault that holds it: the default address is built from the vault named.
- Do not treat `gone: true` as "the entity has no facts": a 404 and an empty served document are different, and the caller decides what each means.
- Do not add a key to a claim's facts here to widen who can read it: that decision belongs to the module that composes the claim.
- Do not keep a second copy of these functions in another unit.

## Wrong readings

- "`createResource` returns the address the platform minted." It returns the id the platform minted and the address built as vault namespace plus `/e/` plus the id.
- "`patchResource` is conditional." It is not; no `If-Match` is sent.
- "A failed read in `readResources` returns the others." It rejects the whole read; only a 404 is a `gone` row.
- "`a:` is added to every key." One `a:` is taken off, and the record door adds it back.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/mynet/place/lws.ts` to `src/vaultResources.ts`: lines 24-25 (`FactValue`), 38-88 (`bare`, `createResource`, `getResource`, `resourceOf`, `patchResource`, `deleteResource`), 146-170 (`ReadResource`, `readResources`). Each declaration compares token-equal to the source's (9 of 9, 0 diff lines).

Imports: `createRecord`, `deleteRecord`, `patchRecord`, `readRecord`, `MergePatchValue`, `RecordFactValue` from `lws-records` 0.4.0 (`createRecord`, `readRecord` equal to the source's; `patchRecord` and `deleteRecord` differ only by that unit's own named change, `authHeader(reqUrl, "PATCH")` / `"DELETE"`); `mapWithConcurrency` and `MAX_PARALLEL_DEREFERENCES` from `lws-vault-sets` 0.2.0 (equal); `idFromResourceUri` from `resource-id` 0.1.0 (the source's `m ? m[1]! : uri` is that unit's `m?.[1] ?? uri`: the same result for every string); `entityUriInVault` from `vault-namespace` 0.1.0 (equal).

Named changes, and only these: the imports; the comments that name a cycle, a ticket, an agent, an app or a ruling are reworded with the same facts. No code changed. The unit sits beside an inline partial copy in the provider `stakeholder-card-hosts-gilbplatform` (`inline.ts`): its `readResources` is token-equal to this one's; its `getResource` leaves out the etag and inlines `resourceOf`; the provider is untouched.

Not taken: `entityUriInVault`, `idFromResourceUri` (units), `RecordRef`, `getListedResource`, `listRecordsOfType`, `MAX_LIST_PAGES` (nothing here reaches them).

## Tests

41 tests in 3 files (`npx vitest run`):

- `vaultResources.test.ts` 25, all new (the source has no test of these symbols of its own; they were exercised through the held-claim tests): over the real `lws-records`, `vault-origin-rule`, `vault-namespace`, `resource-id` and `lws-vault-sets` and a fake platform (`test/support.ts`: a fake `fetch` that keeps each vault's entities at that vault's own host and answers only at the host that holds one; no timers). They pin: each verb is sent to the entity's OWN node, the address wins over the vault named, one `a:` taken off each key, a reference sent as a reference, the type sent, null clears, 404 is `gone`, any other failure rejects, a 404 delete is done, input order, `gone` rows, whole-read rejection, no more than 6 reads in flight (and 6 reached).
- `exports.test.ts` 3: the five exports, their arities, and that the symbols of other units are not re-exported.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units (it writes to the OS temp directory).

Mutation checks: 20 mutants of `src/vaultResources.ts`, 20 killed (the `a:` strip on create and patch and on a bare key, the created address, the type, the entity address ignored or replaced by the base address on read, patch and delete, the 404 flag, the type and etag dropped, concurrency 1 and unbounded, the address ignored in `readResources`, the `gone` flag, the type and the id of a row). Two first survived (create's type, delete's entity address); a test was added for each.
