# vault-origin

The origin an entity address is served on. When the address is already on the host the caller passed, that caller's origin is returned unchanged, scheme included.

## What this is

`vaultOriginOf(entityUri, baseOrigin)` answers where to send a request that is about one entity.

The vault is the authority in the address. A different host means a different origin, path dropped. The same host means the origin the caller is already using, even when the address says `https` and the caller said `http`. A mint can stamp `https` on a rig that is serving plain `http` on that same host and port. Returning the address's own origin in that case points at a TLS port that is not open. The scheme error then looks nothing like its cause.

## What this is not

- Not vault-namespace. That unit returns `https://host/base` or `https://host/vault`, path included, and it does not take a fallback origin. This unit returns an origin with no path, and the fallback is the caller's origin.
- Not a licence to omit the address. Pass null only when the host truly has no address. A caller that has one and passes null is sent to `baseOrigin`, which may be a different vault.
- Not a fetch.
- Not a trim. This function does not trim. The URL parser may accept spaces around an address. Do not add a trim to "match" that.
- Not a hardcoded app origin. `baseOrigin` is an argument. The app's configured origin stays in the app.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-origin`

```ts
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin";

const origin = vaultOriginOf(entityUri, baseOrigin);
```

## What you pass

`entityUri`: the entity address, or null, or undefined, or `""`.

`baseOrigin`: the origin the caller is already talking to. Required. There is no default inside this function.

## What you get

A string.

| Address | Caller origin | Result |
|---|---|---|
| `null`, `""` | the caller origin | that origin, unchanged |
| `"not a url"` | the caller origin | that origin |
| a non-http scheme | the caller origin | that origin |
| `http://app.example.test/base/e/a` | `http://app.example.test` | `http://app.example.test` |
| `https://app.example.test/base/e/a` | `http://app.example.test` | `http://app.example.test` — same host, caller scheme kept |
| `https://APP.example.test/base/e/a` | `http://app.example.test` | the caller origin. The parser lowercases the host before the compare. |
| `https://other.example.test/base/e/a` | `http://app.example.test` | `https://other.example.test` |
| `https://other.example.test:443/base/e/a` | any | `https://other.example.test` — the parser drops the default port |
| `https://other.example.test:444/base/e/a` | any | `https://other.example.test:444` |
| `https://app.example.test:8443/...` | `http://app.example.test` | `https://app.example.test:8443` — the port makes it a different host |
| a real address | `"not a base"` | `"not a base"` — parsing the caller origin threw, so it is returned as itself |

The same-host result is the caller string, not a rebuilt origin. Spelling the caller passed is the spelling you get back.

## Examples

```ts
vaultOriginOf("https://app.example.test/base/e/a", "http://app.example.test");
// "http://app.example.test"

vaultOriginOf("https://other.example.test/base/e/a", "http://app.example.test");
// "https://other.example.test"
```

## Host must supply

Both arguments. The path that should be requested under that origin stays in the host. This function does not append `/base/e/`.

## Do not

- Do not prefer the address's scheme when the hosts match. That is the bug. The caller origin wins, including its scheme and its exact spelling.
- Do not compare hostname only and ignore the port. `app.example.test:8443` is not `app.example.test`.
- Do not use this result as a vault namespace. An origin plus a guessed `/base` is how a `/vault` root gets the wrong path. vault-namespace is the root. This is only the origin.
- Do not treat null as "try every vault". Null means `baseOrigin`.

## Wrong readings

- "https on the address means the service is on https." Not when the host and port are the caller's. The scheme on a same-host address is not a routing instruction.
- "A different host keeps the path." It does not. `u.origin` has no path.
- "The function lowercases the caller origin." It does not. It returns that string untouched when the hosts match or when parsing fails.
- A bad caller origin is not replaced with a repaired one. You get it back.

## Source

GilbApp `src/lib/base/config.ts`, `vaultOriginOf`. `BASE_ORIGIN` was an argument here so the source names no host. The door that chooses which URI to pass was not copied.
