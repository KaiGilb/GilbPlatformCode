# vault-scoped-id

The vault id inside a vault-scoped address. A missing slash after the id is not an id.

## What this is

`vaultIdFromVaultScopedUrl` reads `/lws/vault/<id>/`. The match is case-sensitive. `LWS` does not match. `vaults` does not match `vault`. The slash after the id is required. An address that ends on the id is null. The host is ignored. The first match wins.

The captured id is decoded once. `%20` becomes a space. `%2F` becomes a slash, and it is still one id: the encoded slash was not a path separator. A broken `%` returns null, not the encoded text.

That last point is not `uriTail` in `id-tail`. `uriTail` returns the encoded segment when decoding fails. This function returns null. Do not "align" them. A caller that treats null as "no vault in this URL" is right. A caller that treats the broken text as an id would address the wrong vault.

The id is not lower-cased. `AbC` stays `AbC`.

## What this is not

- Not a check that the vault exists.
- Not the tail of an entity address. Use `id-tail` for `/base/e/<id>`.
- Not a URL builder.
- Not a fetch.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-scoped-id`

```ts
import { vaultIdFromVaultScopedUrl } from "@kaigilb/gilbplatformcode-vault-scoped-id";
```

Path: `units/vault-scoped-id/`.

## What you pass

The URL string, absolute or relative. Only the path shape matters.

## What you get

The decoded id, or null.

## Examples

```ts
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc/records"); // "abc"
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc"); // null
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc/?x=1"); // "abc"
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/abc#x"); // null
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/a%20b/"); // "a b"
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/a%2Fb/"); // "a/b"
vaultIdFromVaultScopedUrl("https://example.test/lws/vault/a%ZZ/"); // null
```

A query is fine when the slash is there: `/lws/vault/abc/?x=1`. A hash with no slash after the id is null: `/lws/vault/abc#x`.

## What the host must supply

The request URL. What to do when the result is null: this URL is not vault-scoped, so do not invent an id from the host name.

## Do not

- Do not accept a URL that ends at the id. The slash is the end of the match on purpose.
- Do not lowercase the id.
- Do not decode twice. `%2520` decodes once, to `%20`, not to a space.
- Do not use the broken-percent text as a fallback id.

## Wrong readings

- "Null means the vault is gone." It means this URL does not contain `/lws/vault/<id>/`.
- "The id cannot contain a slash." It can, if the slash was `%2F` in the URL.
- "This is `uriTail`." It is not. The failure on a broken `%` is the opposite.

## Where it came from

MyNetBase `vaultIdFromVaultScopedUrl` in `src/lib/base/lws.ts`.
