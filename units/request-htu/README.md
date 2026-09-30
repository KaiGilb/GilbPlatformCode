# request-htu

The address bound into a proof. The query and the fragment are not part of it. A mismatch fails the proof even when the key is fine.

## What this is

Two functions. Neither fetches, and neither has a built-in host.

`canonicalHtu(url)` keeps the scheme and the host the URL parsed, including a port. It drops the query, the fragment, and any user name or password. A URL with no path gets the path `/`, because that is how a URL parses. `http://example.test` becomes `http://example.test/`. An address that cannot be parsed throws. This function does not force https.

`proofHtu(fetchUrl, explicitOrigin?)` is the string to sign for a request whose fetch target is `fetchUrl`.

- No override (`undefined` or `null`): scheme is forced to `https`, host and path come from `fetchUrl`. An `http` fetch still signs `https`. The port stays. Query and fragment are dropped.
- A string override: that address's origin replaces scheme and host. The path still comes from `fetchUrl`. The override's own path, query, and fragment are ignored. Its scheme is kept, so an `http` override stays `http`.
- `""` is an override, not "no override". It throws, because it is not an address. Pass `null` when there is no override.

## What this is not

- Not a proof, and not a key. It is only the `htu` string the proof must contain.
- Not a check that the server will accept the host. Signing the wrong host fails later as a mismatch, which looks like a key problem and is not one.
- Not a rewrite of the fetch URL. Fetch the URL you mean. Sign the result of `proofHtu` for that same URL.

## How to take it

Package: `@kaigilb/gilbplatformcode-request-htu`

```ts
import { canonicalHtu, proofHtu } from "@kaigilb/gilbplatformcode-request-htu";
```

Path: `units/request-htu/`.

## What you pass

| Function | Arguments |
|---|---|
| `canonicalHtu` | The full request URL. |
| `proofHtu` | The URL the client actually fetches, and optionally the origin to sign instead. |

Pass an explicit origin only when the host you fetch is not the host the server will reconstruct. The app's flag for that stays in the app. This unit does not read environment variables.

## What you get

A string `scheme://host/path` with no query and no fragment. `proofHtu` without an override always starts with `https://`.

## Examples

```ts
canonicalHtu("https://user:pass@example.test:8443/a/b?q=1#h");
// "https://example.test:8443/a/b"

canonicalHtu("http://example.test");
// "http://example.test/"

proofHtu("http://example.test:8787/lws/x?q=1#h");
// "https://example.test:8787/lws/x"

proofHtu("http://example.test:8787/lws/x?q=1", "http://override.test/ignored?z=1");
// "http://override.test/lws/x"

proofHtu("https://example.test/a", null);
// "https://example.test/a"
```

## What the host must supply

The fetch URL. The explicit origin, when the deployment has one. Do not point the override at a host that is rewritten in transit. Sign the host the server will see.

## Do not

- Do not include the query. A proof bound to `?q=1` will not match a check that drops the query.
- Do not keep `http` on `proofHtu` unless you passed an explicit origin that is `http`. The no-override path forces `https` on purpose.
- Do not pass `""` to clear an override.
- Do not use `canonicalHtu` when you meant `proofHtu`. The first keeps `http`. The second, with no override, does not.

## Wrong readings

- "These two functions return the same string." They do not, as soon as the fetch is `http` or an override is set.
- "The user info has to be in the proof." It is dropped. The host is `example.test`, not `user:pass@example.test`.
- "A thrown error means the key is bad." It means the string was not a URL.

## Where it came from

MyNetBase `canonicalHtu` and `proofHtu` in `src/lib/base/dpop.ts`. The override here is the argument. In the app it is an environment flag. The flag is not in this unit.
