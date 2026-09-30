# canonical-host

The address to open when this page is on a host the app does not serve. No host is built in.

## What this is

`canonicalAppUrl(loc, nonCanonicalHosts, canonicalHost)` returns a URL string, or null.

The hostname must be exactly one of `nonCanonicalHosts`. The match is case-sensitive. It is not a suffix. `notwww.example.test` does not match `www.example.test`. A port is not stripped, so `www.example.test:443` does not match `www.example.test`. A browser's `location.hostname` has no port. Pass `hostname`, not `host`.

On a match, the result is `canonicalHost` with the same path, query, and hash.

- `http:` and `https:` are kept.
- Any other protocol, including `file:` and a string with no colon, becomes `https:`.
- Nothing is inserted for you. An empty `pathname` leaves the host against `search`: `https://example.test?x=1`. Pass `search` with its `?` and `hash` with its `#`. A location object already has them that way.

No match returns null, including an empty host list. The page stays where it is.

## What this is not

- Not a navigation. This function does not touch `window`. When the result is not null, the app replaces the page with it and does not mount. When it is null, the app mounts.
- Not a redirect for every host. Hosts you did not list stay put, including a local dev host. Put only the hosts that must not serve the app as a second origin into the list.
- Not a default host. The third argument is required. Do not hide a production host inside this package.

## How to take it

Package: `@kaigilb/gilbplatformcode-canonical-host`

```ts
import { canonicalAppUrl } from "@kaigilb/gilbplatformcode-canonical-host";

const next = canonicalAppUrl(
  {
    protocol: location.protocol,
    hostname: location.hostname,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  },
  ["www.example.test"],
  "example.test",
);
if (next) {
  location.replace(next);
  // do not mount
}
```

Path: `units/canonical-host/`.

## What you pass

| Argument | Meaning |
|---|---|
| `loc.protocol` | `location.protocol`, including the colon. |
| `loc.hostname` | `location.hostname`, no port. |
| `loc.pathname` | `location.pathname`. May be `"/"`. |
| `loc.search` | `location.search`, `""` or `"?…"`. |
| `loc.hash` | `location.hash`, `""` or `"#…"`. |
| `nonCanonicalHosts` | Exact hostnames that must move. |
| `canonicalHost` | The hostname to put in the result. Not a full URL. |

## What you get

A string, or null. The string is not checked to be different from the current page. If `canonicalHost` is the hostname you matched, you still get a URL, and a careless `replace` would reload the same page. Pass a different host.

## Examples

```ts
canonicalAppUrl(
  { protocol: "https:", hostname: "www.example.test", pathname: "/app/", search: "?x=1", hash: "#top" },
  ["www.example.test"],
  "example.test",
);
// "https://example.test/app/?x=1#top"

canonicalAppUrl(
  { protocol: "https:", hostname: "WWW.EXAMPLE.TEST", pathname: "/", search: "", hash: "" },
  ["www.example.test"],
  "example.test",
);
// null

canonicalAppUrl(
  { protocol: "file:", hostname: "www.example.test", pathname: "", search: "?x=1", hash: "" },
  ["www.example.test"],
  "example.test",
);
// "https://example.test?x=1"
```

## What the host must supply

The host list and the canonical hostname for this app. The `location.replace` call. The decision not to mount after a replace. This unit will not read the window, so a test can pass a fake location.

## Do not

- Do not lowercase the hostname before comparing. The app does not.
- Do not add a slash when `pathname` is empty. Callers that pass a real `location.pathname` already have one.
- Do not treat null as an error. Null means stay.
- Do not put a production hostname in this package as a default.

## Wrong readings

- "`www.` is always stripped." Only hostnames you listed are moved, and they are moved to the host you named, not by deleting a prefix.
- "The function redirects." It returns a string. The app redirects.
- "http becomes https." It does not. `http:` is kept. A scheme that is neither `http:` nor `https:` becomes `https:`.

## Where it came from

MyNetBase `canonicalAppUrl` in `src/lib/canonicalOrigin.ts`. The host list and the canonical hostname in that file are arguments here. `redirectToCanonicalOrigin` is not included, because it reads `window`.
