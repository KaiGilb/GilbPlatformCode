# vault-list

Orders vaults as a tree, names one, and lists only the vaults that can be written.

## The vault's true root

`vaultRootFromList(list, hostOrName)` returns the `vaultId` of the vault the list names for a host (`kai.example.test`, or any address on it) or a stored name, exactly as the list gave it, or `null`. A host match wins; a name that fits two vaults is `null`. It is THE way to get a vault's root: the list is `GET /lws/vaults` (`listReachableVaults` of `reachable-vaults`, field `vaultId`). A user vault's root ends in `/vault`, a platform vault's in `/base`; never append either by hand.

## The chooser rows

`vaultChoices(vaults, isYours)` (since 0.1.2) answers one `{ vaultId, label, yours, viewOnly }` per vault: the person's own first, then the rest, each group in the order given. `label` is `vaultLabel` (the name, else `shortName`, else the host label of a `/vault` or `/base` address, else the last path part, else `Vault <last 8>`); `viewOnly` is "no `write` mode". The caller says what "yours" means (a remembered vault id or a name rule), because `GET /lws/vaults` carries no owner field. `choiceLine(choice, words?)` is the second line of a row: "Yours" or "Shared with you", then " · View only"; `words` replaces any of the three phrases. Pure; no React. A vault chip and sheet are not in this unit.

### Changes in 0.1.2

Added `vaultChoices`, `choiceLine` and the types `VaultChoice`, `ChoiceWords`. Nothing else changed. `src/exports.test.ts` lists the exports.

### Changes in 0.1.1

Added `vaultRootFromList`. Nothing else changed.
