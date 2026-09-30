# principal-key

The opaque key for a principal, the friendly card address, and which `to` values a connect screen accepts.

## What this is

`encodePrincipalKey(principal)` is URL-safe base64 of the UTF-8 text, with `+` turned into `-`, `/` turned into `_`, and the `=` padding removed. It does not trim.

`decodePrincipalKey(key)` is the inverse. It trims the decoded text. It returns that text only when it starts with `http://` or `https://`. The check is case-sensitive. `Https://` is null. A key that is not base64url is null. An empty key is null.

`opaqueCardPath(basename, principal)` is the path only: the base path, with one trailing slash removed, then `/card/`, then the key. It does not add an origin. `""` and `"/"` both produce `/card/<key>`. `"/mynet/"` produces `/mynet/card/<key>`.

`friendlyCardUrl(shortWebId)` returns `scheme://host/card` when the path, after one trailing slash is removed, is exactly one of `/i`, `/base`, `/vault`, `/card`. Otherwise null. The query and the fragment are dropped. The port stays. Letter case of the path matters: `/I` is not `/i`. A longer path such as `/vault/e/abc` or `/base/p/abc` is null. The root `/` is null.

`vaultHostCardAlias(...candidates)` returns the first candidate for which `friendlyCardUrl` is not null. It returns that candidate unchanged, not the `/card` address. It does not build an address when none of the candidates match.

`parseConnectTarget(to)` trims. A blank is null. An absolute `http:` or `https:` address is returned unchanged (the trimmed input, not a rebuilt URL) when the path is `/i`, ends with `/i`, or contains `/base/p/`. A vault root is not accepted. Anything else is tried as an opaque key. A non-address that is also not a key is null.

## What this is not

- Not an origin. The app once defaulted a production origin when `window` was missing. That default is not in this unit. You pass the origin the browser is on, in front of `opaqueCardPath`.
- Not a permission, and not a check that the principal exists.
- Not the share-link unit. That one encodes the screen you are on. This one encodes who the card is for.
- Not a composer of a vault-host address. If you do not already have `/i`, `/base`, `/vault`, or `/card`, the friendly form is null.

## How to take it

Package: `@kaigilb/gilbplatformcode-principal-key`

```ts
import {
  friendlyCardUrl,
  opaqueCardPath,
  parseConnectTarget,
  vaultHostCardAlias,
} from "@kaigilb/gilbplatformcode-principal-key";

const alias = vaultHostCardAlias(shortWebId, vaultRoot);
const card =
  friendlyCardUrl(alias) ?? `${window.location.origin}${opaqueCardPath(basename, principal)}`;

const target = parseConnectTarget(toParam);
```

Path: `units/principal-key/`.

`VAULT_HOST_CARD_ALIAS_PATHS` is the four paths, in this order: `/i`, `/base`, `/vault`, `/card`.

## Examples

```ts
encodePrincipalKey("https://person.example.test/base/p/abc");
decodePrincipalKey(encodePrincipalKey("  https://person.example.test/i  "));
// "https://person.example.test/i"  — spaces were trimmed on the way out only

friendlyCardUrl("https://person.example.test/vault/");
// "https://person.example.test/card"

friendlyCardUrl("https://person.example.test/vault?x=1#h");
// "https://person.example.test/card"

friendlyCardUrl("https://id.example.test/base/p/abc"); // null

vaultHostCardAlias("https://id.example.test/base/p/abc", "https://person.example.test/i/");
// "https://person.example.test/i/"   — the candidate, not the /card form

parseConnectTarget("https://person.example.test/i?x=1");
// "https://person.example.test/i?x=1"

parseConnectTarget("https://person.example.test/vault"); // null
```

## What the host must supply

The principal string, the base path the app is mounted at, and the origin the browser is on if you need an absolute card URL. For the friendly form, pass addresses you already hold for that holder. Do not invent one.

The connect screen passes the `to` query value.

## Do not

- Do not trim before `encodePrincipalKey` if you need the same key the app stored. Decode trims. Encode does not. A key made from a padded string is a different key, and it still decodes to the trimmed address.
- Do not treat `Https://` as valid on decode. The app does not.
- Do not put an origin inside this unit. If the page has no `window`, stop and ask. Do not fall back to a built-in host.
- Do not treat a null friendly URL as a broken holder. A person key on a shared id host has no friendly card address. Use the opaque path.
- Do not return the `/card` form from `vaultHostCardAlias`. Callers still run `friendlyCardUrl` on what you return.
- Do not accept `/vault` as a connect target. `parseConnectTarget` will not. The card paths and the connect paths are not the same list.

## Wrong readings

- "Decode failed, so the principal was rejected by the server." Decode only checks the key's shape and the `http://` or `https://` prefix.
- "`/base/p/...` is a friendly card." It is not. It can be a connect target. The friendly card paths are the four exact paths above.
- "A trailing slash on `/i/` is a different card." `friendlyCardUrl` strips one trailing slash first. The alias function does not strip the candidate it returns.
- "The second `/base/p/` check accepts something the first one misses." On a parsed path they are the same test. Both are kept so the order stays the order the app runs.

## Where it came from

MyNetBase `encodePrincipalKey`, `decodePrincipalKey`, `friendlyCardUrl`, `vaultHostCardAlias`, and `parseConnectTarget` in `src/lib/card/shareUrl.ts`. `opaqueCardPath` is the path half of `opaqueCardShareUrl`. The origin half is not included.
