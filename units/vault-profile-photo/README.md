# vault-profile-photo

Finds a vault's profile photo and loads it, and makes the vault's own card when it has none.

## What this is

Finds a vault's profile photo and loads it, and makes the vault's own card when it has none.

Plain functions, no React. The photo of a vault is the `a:profilePhoto` fact of the vault's own Person card. This unit finds that card, reads the photo reference, fetches the bytes with the viewer's credential as an object URL, and, through the platform's idempotent door, makes the card when there is none.

- `discoverVaultProfilePhoto(host, vaultEntityUri, vaultId?)`: the `VaultProfilePhotoState` (`profileId`, `photoRef`, `personName`). Roads, in order, each tried only if the one before gave no photo: (1) the vault entity's `mnbProfile` pointer, then the pointer kept on this device; (2) the card at the address derived from the vault root (`vsc-` and 24 hex of the sha256); (3) the platform's published card of the principal (`/base/connect/public-card?principal=<vaultId>`; needs `vaultId`). A failed read is never taken for "no photo". When nothing is found the kept photo is dropped, so another face is never shown. Never lists a vault's people, never takes the newest Person with a photo.
- `loadPhotoObjectUrl(photoRef, door?)`: an object URL for the bytes, or `null`. A mediated route (`/base/connect/profile-photo`) is fetched directly with the credential; any other reference is read through `downloadFile` of `file-download-outcome`, at the reference's own host when it has one, else at `door` (the vault the file lives in). The caller revokes the URL.
- `ensureVaultSelfCard(vaultId, facts, displayName?)`: `{ id, etag, adopted }`. Makes a `t:Person` card through `ensureSelfCardRecord`, with `facts` and the trimmed `displayName` under `name` when it is not blank, then says so with `announceSelfCardMade`. An existing card is adopted untouched (`adopted: true`).
- `ensureSelfCardRecord(vaultNamespace, typeUri, facts, source?)`: `POST /lws/vault/<vaultId>/selfcard` at the node that holds the vault. 201 created, 200 already there (both success); 409 and the other refusals reach the caller.
- `announceSelfCardMade(vaultId)`, `onSelfCardMade(listener)` (returns the stop function): "a vault's own card was just made", for any reader that wants to read the card again. A listener that throws never fails the door.
- `peekCachedProfilePhoto(vaultId, vaultEntityUri?)`: the photo reference this device kept (memory, then `localStorage`), without a request; for painting at once.
- `vaultRootOf(namespace)`: the vault root with its own segment (`/base` or `/vault`), or `null`. `PROFILE_POINTER_ATTR` (`"mnbProfile"`). Types `VaultProfilePhotoState`, `VaultProfilePhotoHost`.

## What this is not

Taken from `vaultProfilePhoto.ts` (1,077 lines) are the three functions asked for and everything they reach in that file, plus `peekCachedProfilePhoto` and `readCachedPhotoRef` (so the memory of kept photos is whole). Not taken, and why:

- the save, link, upload and clear paths (`saveVaultProfilePhoto`, `saveVaultProfilePhotoFromExistingFile`, `linkProfilePhotoRef`, `trySetVaultPointer`, `clearVaultProfilePhoto`, `tryPatchPhoto`, `pairLivePhoto`, `linkPhotoOntoCard`, `LinkOutcome`, `LINK_REFUSED_WARNING`, `personEntityUri`): not reached by the three functions; they write;
- the record-target and logo paths (`PhotoRecordTarget`, `fileEntityInRecordVault`, `fileIdOfRef`, `linkLogoOntoRecord`, `linkPhotoOntoRecord`): an organization's logo and a person record's photo, not reached;
- the image-file list (`looksLikeImageFile`, `listVaultImageFiles`): not reached;
- the re-exports `photoWriteSlug`, `entityIdTail`, `fileIdFromPhotoRef` and the imports only those paths use (`deleteFile`, `uploadFile`, `uploadFilePreferVault`, `listVaultFiles`, `patchRecord`, `leanFaceNotice`, `faceFileId`, `faceEntityFor`, `refsOf`, `resolveOrgTerms`, `servedValue`).

Not a writer of the photo: nothing here patches a card's photo.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-profile-photo`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-profile-photo` prints:

```sh
npm install <path-to-the-library>/units/base-origin <path-to-the-library>/units/file-words <path-to-the-library>/units/photo-term <path-to-the-library>/units/record-types <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/vault-profile-photo
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. Seven peers: `base-origin ^0.2.0`, `file-download-outcome ^0.1.0`, `lws-records ^0.4.0`, `lws-session-bridge ^0.1.0`, `photo-term ^0.1.0`, `record-types ^0.1.0`, `vault-origin-rule ^0.1.0`.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { discoverVaultProfilePhoto, loadPhotoObjectUrl } from "@kaigilb/gilbplatformcode-vault-profile-photo";
import type { VaultProfilePhotoHost } from "@kaigilb/gilbplatformcode-vault-profile-photo";

// Once, at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["id.platform.example.test"]);
setLwsAuth(myAuthHost);

const host: VaultProfilePhotoHost = {
  photoReadKeys: async () => ["a:profilePhoto", "profilePhoto"], // yours: the spellings the photo term allows
  noteVaultPicture: (vaultId, has) => rememberPicture(vaultId, has), // optional
};

const vault = "https://ann.platform.example.test/vault";
const state = await discoverVaultProfilePhoto(host, `${vault}/e/vaultentity01`, vault);
const url = state.photoRef ? await loadPhotoObjectUrl(state.photoRef, vault) : null; // an object URL, or null
```

## What the host must supply

- `VaultProfilePhotoHost`, the FIRST ARGUMENT of `discoverVaultProfilePhoto`:
  - `photoReadKeys(): Promise<readonly string[]>`: every spelling a stored photo fact may carry, resolved from the photo term (the app's `photoReadKeys()`, which shares one ask of the term at a time and does not ask again for 60 s after an answer that did not resolve). Called once per discovery, before the first read. A rejection is not swallowed. A host can build it over `createPhotoTermResolver` of `photo-term`.
  - `noteVaultPicture?(vaultId, has)`: OPTIONAL. Told `true` when a photo is found and `false` when none is (and a kept photo is dropped). Absent: nothing is noted. Replaces the app's `knownVaultPicture.note(vaultId, has)`, a tab-level store the app's section menu reads.
- `setBaseOrigin(origin)` and `setSystemVaultHosts(hosts)` of `base-origin`, once; `setLwsAuth(host)` of `lws-session-bridge`, once. The origin is read when a function runs (the source read a constant when the module loaded).
- A `fetch`, `URL.createObjectURL` and, for the kept photo and pointer, `localStorage` (every use is guarded by `typeof localStorage` or a `try`).

## Module state

Two pieces of module state. An app must have ONE copy of this unit, or each copy keeps its own.

- `memoryPhotoByVault` (a `Map`, `vaultProfilePhoto.ts`): the photo reference found for each vault id, so cycling views does not flash empty while the network rediscovers. Written by discovery, read by `peekCachedProfilePhoto`, dropped when a discovery finds nothing.
- `listeners` (a `Set`, `selfCardMade.ts`): the listeners of `onSelfCardMade`.

`localStorage` keys, as the app wrote them (a device written by the app is read by the unit and the other way round): `mnb.profilePointer.<vault entity id>` (the card's id) and `mnb.profilePhotoRef.<key>` (the photo reference), under the vault id, the entity-id tail and the entity URI.

## Do not

- Do not list a vault's people to find a photo, and do not take the newest Person with a photo: in a vault of contacts that shows someone else's face as the vault's.
- Do not read a failed read as "no photo". The roads go on, and the kept photo is dropped only when every road answered without one.
- Do not make a vault's card with a plain create. `ensureSelfCardRecord` is the idempotent door: the address is derived from the vault, so a retry and two simultaneous requests meet at one card.
- Do not treat a 200 from the self-card door as a failure: it is the existing card, returned untouched.
- Do not use a bare `<img src>` for a private photo; use the object URL.
- Do not install a second copy of this unit.

## Wrong readings

- "`photo-ref` is the same parser." It is not. The unit uses the two parsers of the private package `gilb-photo`, copied as they are (`src/gilbPhotoRef.ts`), because `photo-ref`'s are not equal to them: on a malformed percent-encoding (`/files/%`, `https://h.example.test/vault/e/%E0%A4%A`) these THROW a `URIError` and `photo-ref` answers `null` (`fileIdFromPhotoRef`) or `""` (`entityIdTail`). Measured over 60,000 calls on strings made of 23 address parts: no difference in any value, and 1,408 strings on which the source throws and `photo-ref` answers. In `discoverVaultProfilePhoto` the first call, `entityIdTail(vaultEntityUri)`, is outside any `try`, so a malformed vault address rejects the discovery, as it does in the app; `loadPhotoObjectUrl` parses its reference outside its `try` and rejects too. Kept as in production.
- "The derived card is found by a listing." It is read by its derived id, at its own vault's address.
- "`discoverVaultProfilePhoto` needs a vault id." It does not for the pointer road; the derived and published-card roads and the kept photo need it.
- "A name on the card is only for the first road." The name of the card the discovery already read is returned from each road that read one; no extra request.
- "`noteVaultPicture` is told on every call." Only when a vault id is given.

## Where it came from

`KaiGilb/GilbApp` (private repo), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script, symbol by symbol:

- `src/lib/base/vaultProfilePhoto.ts` to `src/vaultProfilePhoto.ts`: lines 35-45 (`photoFactOf`, `personNameOf`), 47-48 (`PROFILE_POINTER_ATTR`), 86-88 (`localPointerKey`, `localPhotoKey`), 106-118 (`vaultRootOf`), 131-204 (`memoryPhotoByVault`, `cacheKeys`, `readCachedPhotoRef`, `writeCachedPhotoRef`, `peekCachedProfilePhoto`, `clearCachedPhotoRef`), 238-260 (`VaultProfilePhotoState`), 262-408 (`discoverVaultProfilePhoto`), 410-431 (`readPointerFromVaultEntity`, `normalizePhotoRef`), 433-496 (`loadPhotoObjectUrl`), 607-632 (`ensureVaultSelfCard`);
- `src/lib/base/selfCardMade.ts` to `src/selfCardMade.ts`: lines 9-100, the whole file after its header;
- `src/lib/base/records.ts` to `src/selfCardRecord.ts`: lines 555-624 (`ensureSelfCardRecord`).

The private package `gilb-photo` (a sibling checkout at `~/Developer/gilb-photo`, repository at commit `bf56ec7`; `src/photoRef.ts` was last changed by commit `8b5c74d8570e78f0686258164b9f4f4f8b6a595a`), copied by script as the rule for a private package asks: `src/photoRef.ts` lines 17-31 and 33-77 (`VAULT_PATH_SEGMENTS`, `VAULT_SEGMENT_PATTERN`, the three regexes, `isMediatedPhotoRef`, `fileIdFromPhotoRef`, `entityIdTail`) to `src/gilbPhotoRef.ts`. That file is a new file of this unit and is not in `unit.json` `source.files`, whose single repo is GilbApp.

**Merged units compared and taken or not** (each by a comment-stripped, declaration-by-declaration comparison with the source):
- taken as they are: `readRecord` of `lws-records` (token-equal, with `readRecordOnce` and `recordFromServed`); `typeUriForVaultNamespace` of `record-types` (equal); `photoRefFromFacts` of `photo-term` (equal to `gilb-photo`); `selfCardIdForVault` and `vaultSegmentOf` of `vault-origin-rule` (equal to `gilb-photo`); `atVaultOrigin` of `vault-origin-rule` (differs from the app only in `BASE_ORIGIN` read as `baseOrigin()`, that unit's named change); `dpopReadAuth` and `dpopWriteAuth` of `lws-session-bridge` (the credential seam); `downloadFile` of `file-download-outcome`; `toWireFacts`, `throwForCreateStatus`, `idFromResourceUrl` of `lws-records` (exported in its 0.4.0, for this unit);
- NOT taken: `entityIdTail` and `fileIdFromPhotoRef` of `photo-ref` (not equal to `gilb-photo`, see above); `selfCardIdForVault` of `self-card` (a root that ends in `/` throws there).

Named changes, and only these (a comment-stripped diff of each file against its source shows exactly these hunks):

1. **host first argument** (`discoverVaultProfilePhoto`, `writeCachedPhotoRef`, `clearCachedPhotoRef` take `host: VaultProfilePhotoHost`): `photoReadKeys()` of `photoTerm.ts` is `host.photoReadKeys()`; `knownVaultPicture.note(vaultId, has)` is `host.noteVaultPicture?.(vaultId, has)` (optional: absent, nothing is noted); the two calls of each helper pass `host`;
2. **a module-load origin becomes a function over the setting**: `BASE_ORIGIN` is `baseOrigin()` in `discoverVaultProfilePhoto` (the published-card URL) and in `loadPhotoObjectUrl` (`new URL(photoRef, baseOrigin())`);
3. **imports**: the app's `./config`, `./records`, `./files`, `./dpop`, `./recordTypes`, `gilb-photo` and `../knownFact` are the units' (`vault-origin-rule`, `lws-records`, `file-download-outcome`, `lws-session-bridge`, `record-types`, `photo-term`, `base-origin`) and this unit's own files (`./gilbPhotoRef`, `./selfCardRecord`, `./selfCardMade`);
4. **`LWS_VAULT_SELFCARD_URL`** (`config.ts` line 518) is an inline named copy in `selfCardRecord.ts`: `${vaultOriginOf(vaultId)}/lws/vault/${encodeURIComponent(vaultId)}/selfcard` (the app's `vaultSeg` is `encodeURIComponent`); `vaultOriginOf` is read from `vault-origin-rule`, which reads the origin setting;
5. comments that name a host, a cycle, a ticket, an agent or a person are reworded, and `BASE_ORIGIN` in a comment reads `baseOrigin()`; no code changed.

`src/index.ts` and `src/vaultProfilePhotoHost.ts` are new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, not shipped; node environment; an in-memory `localStorage`; the hosts are `example.test` hosts): ported from `src/lib/base/` 29 tests: `vaultProfilePhoto.test.ts` 10 of 15, `vaultProfilePhoto.derivedSelfCard.c186.test.ts` 6 of 6, `vaultProfilePhoto.vaultSegment.c183.test.ts` 10 of 10, `selfCardMade.ns1.test.ts` 3 of 3. The app's mocks of the credential, files, vault sets and records are the fake auth host (`setLwsAuth`) and fake peers (`readRecord`, `downloadFile`, the self-card door), each wrapping the real module with `importOriginal`; the derived card id of the measured production vault is the sha256 literal of an `example.test` vault root (made with `shasum -a 256`). New: `host.test.ts` 30 (the host members, what discovery keeps, the origin and the credential, the bytes), `selfCardRecord.test.ts` 16 (the door and `ensureVaultSelfCard`), `gilbPhotoRef.test.ts` 26 (including the false friend), `exports.test.ts` 2, `hostAgnostic.test.ts` 13. Total 116 = 29 ported + 74 new + 13. Left out, with reasons: from `vaultProfilePhoto.test.ts` the three C9 tests (`saveVaultProfilePhoto`, an upload) and the two C11 tests (`listVaultImageFiles`); `vaultProfilePhoto.selfCardDoor.test.ts` (5: every case runs a save function; what it pinned about the door is in `selfCardRecord.test.ts`); `vaultProfilePhoto.silentRefusal.c183.test.ts` (2, `linkPhotoOntoCard`); `vaultProfilePhoto.logo.s8org.test.ts` (10, the logo path); `vaultProfilePhotoDeleteDoor.test.ts` (2, `clearVaultProfilePhoto`). Many other app tests mock these functions (`VaultsView`, `RecordDetail` and the like); they test those components and are not ported.
