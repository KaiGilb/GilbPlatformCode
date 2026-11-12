# vault-list

Orders vaults as a tree, names one, and lists only the vaults that can be written.

## The vault's true root

`vaultRootFromList(list, hostOrName)` returns the `vaultId` of the vault the list names for a host (`kai.example.test`, or any address on it) or a stored name, exactly as the list gave it, or `null`. A host match wins; a name that fits two vaults is `null`. It is THE way to get a vault's root: the list is `GET /lws/vaults` (`listReachableVaults` of `reachable-vaults`, field `vaultId`). A user vault's root ends in `/vault`, a platform vault's in `/base`; never append either by hand.

## The chooser rows

`vaultChoices(vaults, isYours)` (since 0.1.2) answers one `{ vaultId, label, yours, viewOnly }` per vault: the person's own first, then the rest, each group in the order given. `label` is `vaultLabel` (the name, else `shortName`, else the host label of a `/vault` or `/base` address, else the last path part, else `Vault <last 8>`); `viewOnly` is "no `write` mode". The caller says what "yours" means (a remembered vault id or a name rule), because `GET /lws/vaults` carries no owner field. `choiceLine(choice, words?)` is the second line of a row: "Yours" or "Shared with you", then " · View only"; `words` replaces any of the three phrases. Pure; no React. A vault chip and sheet are not in this unit.

## vaultsOfType

`vaultsOfType(rows, { represents?, nameSuffix?, keepUnknown? })` (since 0.1.3) keeps the rows of one type and does not drop a vault shared with the person that arrives bare (no `represents`, `name` or `shortName`). A row stays when its `represents` equals the one asked, or its `shortName` or `name` ends with `nameSuffix` (any case); a bare row stays unless `keepUnknown: false`; a row that says what it is and does not match goes. Neither `represents` nor `nameSuffix` asked: every row, as a copy. Pure; the input is not changed and the order is kept.

```ts
const rows = await listReachableVaults();               // some rows carry only vaultId
const mine = vaultsOfType(rows, { represents: "t:Flock", nameSuffix: " flock" });
const strict = vaultsOfType(rows, { represents: "t:Flock", keepUnknown: false });
const choices = vaultChoices(mine, (v) => v.vaultId === ownId);
```

## Which vault am I in

Pure functions over the app's own key-value store (`{ get(key), set(key, value), remove(key) }`, for example `localStorage` wrapped in three lines): no storage access of its own, and a store that throws is never an error (a failed read is "nothing kept", a failed write is "not kept"). `appKey` must include the signed-in person, for example `teapots:<principal>`: with the app alone in the key, two people on one browser would share one remembered vault and one dismissed offer.

- `rememberVault(store, appKey, vaultId)`, `forgetVault(store, appKey)`, `hasChosenVault(store, appKey)`.
- `rememberedVault(store, appKey, rows)`: the remembered id as `rows` list it, only while it is still in `rows` (no trailing-slash differences); else `null`.
- `sharedOffer(rows, { ownVaultId, dismissed, chosen })`: the first row that is not the person's own, not marked `yours`, not dismissed, and none at all when `chosen` (the person already chose a vault). `dismissed` is a list of ids or a function.
- `dismissOffer(store, appKey, vaultId)` and `offerDismissed(store, appKey, vaultId)`.

```ts
const store = { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k) };
const appKey = `teapots:${principal}`;
const id = rememberedVault(store, appKey, rows);                       // was restoreChosenVault + remembered
rememberVault(store, appKey, picked.vaultId);                          // was remember / chooseVault's write
const offer = sharedOffer(choices, { ownVaultId, chosen: hasChosenVault(store, appKey), dismissed: (v) => offerDismissed(store, appKey, v) }); // was findSharedOffer
dismissOffer(store, appKey, offer.vaultId);                            // was dismissBanner
```

Replaces in run 8's `app/src/services/session.ts` (lines 182 to 254): `currentKey`, `remembered`, `remember`, `bannerKey`, `hasRememberedChoice`, `dismissBanner`, `isBannerDismissed`, and the rule inside `findSharedOffer`; about 45 lines, 8 of them stay as thin wrappers. The keys are `<appKey>:current` and `<appKey>:banner:<vaultId>`, so a choice kept by run 8's own keys (`<app>:current:<principal>`) is not found by these.

### Changes in 0.1.4

Added the vault-session functions above and the type `KeyValueStore`. Nothing else changed. `src/exports.test.ts` lists the exports.

### Changes in 0.1.3

Added `vaultsOfType`. Nothing else changed.


### Changes in 0.1.2

Added `vaultChoices`, `choiceLine` and the types `VaultChoice`, `ChoiceWords`. Nothing else changed. `src/exports.test.ts` lists the exports.

### Changes in 0.1.1

Added `vaultRootFromList`. Nothing else changed.
