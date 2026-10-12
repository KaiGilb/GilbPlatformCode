# self-card

The address of a vault's own person card, derived from the vault root the way the server derives it. No pointer needed.

## What this is

`selfCardIdForVault(vaultRoot)` returns `vsc-` and the first 24 hex characters of sha256 of the root. Async, because it uses Web Crypto.

`selfCardEntityUri(vaultRoot)` returns `<root>/e/<that id>`: the card's address in its own vault.

`isSelfCardId(id)` is true for `vsc-` and exactly 24 lower-case hex characters.

The server mints each vault's self-card at this address. No vault record names its self-card, so a pointer, a cached id, or a person lookup are all conditional roads. This derivation is not.

## What this is not

- Not a fetch. You read the card at the address yourself.
- Not proof the card exists. The address is where it must be; a vault that never had one minted answers 404.
- Not a person lookup across vaults.

## How to take it

Package: `@kaigilb/gilbplatformcode-self-card`

```ts
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";

const cardUri = await selfCardEntityUri(vaultRoot); // vaultRoot e.g. "https://<host>/vault" -> "https://<host>/vault/e/vsc-…"
```

## What you pass

The vault root exactly as the server stores it: `https://<host>/vault` for a user vault, `https://<host>/base` for a system vault. Whitespace around it is trimmed. Nothing else is changed. A root that ends in `/` throws: a stored root never does, and hashing one would give the address of a card that does not exist.

## What you get

A string. An empty root throws, because an empty key would put every vault on one card. A root that ends in `/` throws too.

## Examples

```ts
await selfCardIdForVault("https://vault-a.example.test/vault"); // "vsc-a93e28680b27564d50be2ed6"
await selfCardIdForVault("https://vault-a.example.test/base");  // "vsc-1b35a46be9eab5af6d0ebe9d"
```

## Host must supply

The vault root, and Web Crypto (`crypto.subtle`), which browsers and Node both have.

## Do not

- Do not trim a trailing slash, lower-case the host, or guess the `/vault` or `/base` segment. Each is a different string and hashes to a different card that does not exist.
- Do not fetch the card at a default origin and conclude it is absent. Read it at its own vault's host.
- Do not swap in a hand-written sha256 to make this synchronous. One wrong byte addresses nothing.

## Wrong readings

- `/vault` and `/base` on one host are two vaults and two cards. That is the server's behaviour, not a defect here.
- A 404 at the address is "no card was minted here", not "this person has no photo".

## Source

`selfCard.ts` from the private `gilb-photo` package. One change: a root that ends in `/` throws here, where the source trimmed it in the address but not in the hash. The tests check the hash against literals made by `shasum`, not against a production card.
