# vault-namespace

The vault root inside an entity address, and an entity address built under a root the caller already has.

## What this is

`namespaceFromVaultEntity(entity)` reads the root. `entityUriInVault(vaultId, id)` writes `/e/<id>` under that root.

A user vault's root ends in `/vault`. A platform vault's root ends in `/base`. This unit does not choose which one a host uses. It only keeps the segment that is already written in the address.

## What this is not

- Not a fetch, and not a check that the vault exists.
- Not a WebID. It does not invent `/i`.
- Not the id-tail unit. id-tail returns the last segment of any address. This unit returns the root, or undefined when the address is not an entity address or a bare root.
- Not a trimmer.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-namespace`

```ts
import { namespaceFromVaultEntity, entityUriInVault } from "@kaigilb/gilbplatformcode-vault-namespace";

const root = namespaceFromVaultEntity(entity);
const uri = root ? entityUriInVault(root, id) : undefined;
```

## What you pass

`namespaceFromVaultEntity` takes the whole entity address, as a string.

`entityUriInVault` takes the root and the opaque id. The root should already end in `/vault` or `/base`. This function does not check that.

## What you get

`namespaceFromVaultEntity` returns the root string, or `undefined`.

| Input | Result |
|---|---|
| `https://h.example/vault/e/abc` | `https://h.example/vault` |
| `https://h.example/base` | `https://h.example/base` |
| `https://h.example/vault/e/abc?x=1` | `https://h.example/vault` |
| `https://h.example/vault/` | `undefined` |
| `https://h.example/vault/e` | `undefined` |
| `https://h.example/base/p/x` | `undefined` |
| `HTTP://h.example/vault` | `undefined` |

The scheme must be lowercase `http://` or `https://`. Nothing is trimmed. A leading space is undefined.

`entityUriInVault` removes one trailing slash from the root, then adds `/e/` and the id. A second trailing slash stays. The id is not encoded. An empty id still produces `/e/`.

```ts
entityUriInVault("https://h.example/vault/", "abc");
// "https://h.example/vault/e/abc"

entityUriInVault("https://h.example/vault//", "abc");
// "https://h.example/vault//e/abc"
```

## Host must supply

The address it already holds. Do not build a root by guessing `/base` for a vault whose addresses use `/vault`.

## Do not

- Do not paste `/base/e/` onto a root that already ends in `/vault`. That is a different vault.
- Do not treat `undefined` as "use the first vault". The address was not an entity address.
- Do not trim the address before calling, unless the screen already did that for a reason you can name. This function will not.

## Wrong readings

- A trailing slash on a bare root is not "close enough". It is undefined.
- `/e` without the slash after it is not an entity address.
- A principal (`/base/p/...`) is not an entity, so the root is undefined. Use another reader for a principal.
- A query after the id does not remove the root. The `$` alternative is only for a bare root. `/e/` matches with characters after it.

## Source

MyNetBase `src/lib/base/token.ts`, `namespaceFromVaultEntity` and `entityUriInVault`.
