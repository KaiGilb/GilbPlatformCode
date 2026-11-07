# vault-list

Orders vaults as a tree, names one, and lists only the vaults that can be written.

## The vault's true root

`vaultRootFromList(list, hostOrName)` returns the `vaultId` of the vault the list names for a host (`kai.example.test`, or any address on it) or a stored name, exactly as the list gave it, or `null`. A host match wins; a name that fits two vaults is `null`. It is THE way to get a vault's root: the list is `GET /lws/vaults` (`listReachableVaults` of `reachable-vaults`, field `vaultId`). A user vault's root ends in `/vault`, a platform vault's in `/base`; never append either by hand.

### Changes in 0.1.1

Added `vaultRootFromList`. Nothing else changed.
