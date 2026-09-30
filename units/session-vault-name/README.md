# session-vault-name

The name of the vault the session signed into. A usable name wins. Otherwise the words `Unnamed vault` and that vault's id. This is not the label used for a reachable vault.

## What this is

`sessionVaultLabel(vault)` answers the heading for the sign-in vault. A vault name is optional. Printing `vault.name` raw is one empty string away from an empty heading. This function always returns words.

## What this is not

- Not vault-list's `vaultLabel`. That function, when the name is blank, reads the hostname if the path is exactly `/base`, otherwise the last path segment, otherwise the word `Vault` and the last eight characters of the id. This function never does any of that.
- The comment in the app says this is the same rule as `vaultLabel`. That comment is wrong about the code. Do not "correct" this function until it matches `vaultLabel`. They name different objects. The sign-in vault's id is the record id. The reachable vault's id is the namespace. Running one function on the other id produces a confident, wrong heading.
- Not member-name and not principal-row. Those read a web address. This one reads `name` and `id` only.
- Not a fetch, and not a lookup of a reserved name. If the only name lives in a registry this object does not carry, the result is `Unnamed vault` plus the id. That is honest. Do not invent the registry name here.

## How to take it

Package: `@kaigilb/gilbplatformcode-session-vault-name`

```ts
import { sessionVaultLabel } from "@kaigilb/gilbplatformcode-session-vault-name";

const heading = sessionVaultLabel(session.vault);
```

Call it only when the session has a vault object. A session with no vault is null in the app. This function does not accept null. The host branches before the call.

## What you pass

`{ name?, id }`. `id` is required and is a string. `name` may be missing, null, or a string.

Pass `VaultInfo.id`, the opaque id the record paths are keyed on. Do not pass the namespace (`vaultId` on a reachable vault) and do not pass the entity address unless that address is actually what this session object stores in `id`.

## What you get

A string.

| `name` | `id` | Result |
|---|---|---|
| `"  Ada  "` | anything | `"Ada"` |
| `""`, `"   "`, `null`, missing | `"abc"` | `"Unnamed vault abc"` |
| `""` | `""` | `"Unnamed vault "` — the space after the word stays |
| missing | `"  x  "` | `"Unnamed vault   x  "` — the id is not trimmed |

The name is trimmed only for the emptiness test and for the returned text. The id is never trimmed.

## Examples

```ts
sessionVaultLabel({ name: "  Ada  ", id: "abc" }); // "Ada"
sessionVaultLabel({ name: "   ", id: "abc" });    // "Unnamed vault abc"
sessionVaultLabel({ id: "" });                     // "Unnamed vault "
```

## Host must supply

The session vault object, with `name` and `id` already on those keys. This function does not read `a:name`, `vaultId`, or `entity`.

## Do not

- Do not fall back to `vaultLabel` when this returns a string that starts with `Unnamed vault`. That string is the answer, including when it looks sparse.
- Do not trim `id` in a wrapper. A spaced id is unusual, and hiding it changes the heading the operator would use to recognise the row.
- Do not treat a hostname inside `id` as a display name. If `id` is an address, the whole address is appended. The function does not parse it.
- Do not call this for every vault in the navigator. The navigator uses `vaultLabel`. Mixing them makes two vaults with no stored name render under two different rules.

## Wrong readings

- "Same rule as the reachable-vault label." No. A blank name here does not become the first piece of a hostname.
- A whitespace name is not a name. It falls through to the id sentence.
- The words are `Unnamed vault`, with that capital and that space. Not `Untitled`, and not `Vault` plus eight characters. Those other fallbacks belong to other units.
- An empty id does not omit the sentence. You get `Unnamed vault ` with the trailing space. That means the id was empty. Do not trim the result and then compare it to `Unnamed vault` as if the id had been absent. The space is the join.

## Source

GilbApp `src/lib/base/types.ts`, `sessionVaultLabel`.
