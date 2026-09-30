# seat-address

The public address of a seat. A declared URL is used as the server stored it. This function does not invent a second address ending in `/i`.

## What this is

`seatPublicAddress(vault)` returns a string or `undefined`.

1. `shortWebId`, if it is an absolute `http(s)` URL after trim.
2. Otherwise `aliasUri`, but only when `shortWebId` is `null` or `undefined`. An empty string is not missing, so `shortWebId: ""` does not fall through to `aliasUri`.
3. Otherwise `vaultId`, if that is an absolute URL.
4. Otherwise `undefined`.

`isAbsoluteHttpUrl` is the check: trimmed value matches `http://` or `https://`, any case. `https://` with nothing after it is still true. A bare word is false. Null and `""` are false.

## What this is not

- Not a builder. It never concatenates an origin with `/i` or with `/base`. If you need `/base`, it has to already be in one of the three fields.
- Not a retirement of `/i`. A stored `https://example.test/i` is returned as-is. A stored `…/base` is also returned as-is. The function does not prefer one path over the other.
- Not a WebID validator. It only checks the scheme prefix.

## How to take it

Package: `@kaigilb/gilbplatformcode-seat-address`

```ts
import { seatPublicAddress } from "@kaigilb/gilbplatformcode-seat-address";
```

Path: `units/seat-address/`.

## Examples

```ts
seatPublicAddress({ shortWebId: "", vaultId: "https://example.test/base" });
// "https://example.test/base"

seatPublicAddress({ shortWebId: "https://example.test/i", vaultId: "https://example.test/base" });
// "https://example.test/i"   — the declared one, not the vault

seatPublicAddress({ aliasUri: "https://example.test/base", vaultId: "https://other.test/base" });
// "https://example.test/base"

seatPublicAddress({ shortWebId: "", aliasUri: "https://alias.test/base", vaultId: "https://example.test/base" });
// "https://example.test/base"  — empty shortWebId blocks the alias

seatPublicAddress({ shortWebId: "w" });
// undefined
```

## What the host must supply

The three fields from the seat you already loaded: the short id, the alias, and the vault address. This function does not fetch them. Pass what the server said. Do not pre-compose `/i` "in case the short id is empty".

## Do not

- Do not append `/i` when the result is undefined. Undefined means there is no address to show.
- Do not treat an empty `shortWebId` as "use the alias". Use a missing property, or `null`, if the alias should win.
- Do not strip `/i` off a declared URL. Holders who already have that path keep it.

## Wrong readings

- "The vault address is always what we show." Only when the declared value is missing or not a URL.
- "`https://` alone should be rejected." Not here. The check is the prefix. A broken URL of that shape is still "absolute" by this test. Do not show it if you have a stricter check of your own; do not weaken this one so that a normal `https://host/base` starts failing.

## Where it came from

MyNetBase `src/lib/base/seatAddress.ts`, `isAbsoluteHttpUrl` and `seatPublicAddress`.
