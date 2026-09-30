# member-name

What to call one group member, and which address identifies the row. The host label keeps `www` and `id`. The principal-row unit does not.

## What this is

Two functions over a roster row the host already holds.

`memberDisplayName` is the heading. A label the roster returned wins. Otherwise a host label is used when the address is one of four roots. Otherwise the last path segment of the principal is used.

`memberDirectoryId` is the identity of that row. The trimmed web id when it is not blank. Otherwise the principal, unchanged.

The roster is not fetched here. A value already in hand beats a second fetch.

## What this is not

- Not the principal-row unit. That unit skips a first hostname piece that is exactly `www` or `id`, and then uses the whole remaining hostname. This unit keeps `www` and `id`, and it uses only the first dotted piece. The two do not agree. Do not make them agree.
- Not the unnamed-person unit. That unit builds a fallback when no name was admitted. This unit names a member from the roster's own fields.
- Not a directory lookup, and not a card fetch.
- Not a promise that the heading is never blank and never the word `base`. The screen comment in the app says that. The code does not. See Wrong readings.

## How to take it

Package: `@kaigilb/gilbplatformcode-member-name`

```ts
import { memberDirectoryId, memberDisplayName } from "@kaigilb/gilbplatformcode-member-name";

const heading = memberDisplayName(member);
const rowId = memberDirectoryId(member);
```

## What you pass

`memberDisplayName` takes `{ label?, webId?, principal }`. `principal` is required and is a string. `label` and `webId` may be missing or null.

`memberDirectoryId` takes `{ webId?, principal }`. It does not read `label`.

## What you get

`memberDisplayName` returns a string, in this order:

1. `label` when `trim()` is not empty. The returned text is trimmed. `"  Ada  "` is `"Ada"`.
2. The host label of `webId`, then of `principal`, but only when the path is exactly `/i`, `/card`, `/base`, or `/vault` after **one** trailing slash is removed. The host label is `hostname.split(".")[0]`. The URL parser lowercases the hostname first, so `WWW` becomes `www`. An empty first piece becomes "no host label" and the function falls through.
3. The last non-empty segment of `principal`, split on `/`.
4. `principal` itself when that segment is missing.

`memberDirectoryId` returns the trimmed `webId` when that trim is non-empty. Otherwise `principal`, not trimmed. A web id of spaces is not an identity.

The path test is case-sensitive. `/BASE` does not match `/base`, so the heading becomes the segment `BASE`, not the host label.

A query string and a hash are not part of the path. `https://ada.example.test/i?x=1` still has path `/i`, so the heading is `ada`. The directory id, if that string is the web id, is the whole string, query included, because the directory id does not parse.

## Examples

```ts
memberDisplayName({
  label: "  Ada  ",
  webId: "https://ada.example.test/i",
  principal: "https://id.example.test/base/p/abc",
});
// "Ada" — the label wins

memberDisplayName({ label: "   ", principal: "https://ada.example.test/i" });
// "ada"

memberDisplayName({ principal: "https://WWW.example.test/i" });
// "www" — not "example". principal-row would skip www.

memberDisplayName({ principal: "https://id.example.test/base" });
// "id" — not the rest of the hostname

memberDisplayName({ principal: "https://ada.example.test/base/p/abc" });
// "abc" — the path is not one of the four roots

memberDisplayName({ principal: "https://ada.example.test/BASE" });
// "BASE"

memberDirectoryId({ webId: "  https://ada.example.test/i  ", principal: "https://h/p/1" });
// "https://ada.example.test/i"

memberDirectoryId({ webId: "   ", principal: "  p  " });
// "  p  "
```

## Host must supply

The roster row. Map whatever the server called the fields onto `label`, `webId`, and `principal` before the call. This unit does not know `a:label` or a web-id claim key.

## Do not

- Do not use the heading as the row identity. Two members can display the same host label. `memberDirectoryId` is the identity. It prefers the web id and does not turn it into a host label.
- Do not drop `www` or `id` to match principal-row. A row headed `www` or `id` is what this function returns for those hosts.
- Do not parse `principal` yourself for the heading and also call this. The four roots are the only paths that become a host label. Every other path, including `/base/p/<id>` and `/vault/e/<id>`, uses the last segment.
- Do not trim `principal` before `memberDirectoryId` unless the host means to change the identity. This function does not trim it.

## Wrong readings

- The word `base` can be the heading. `https://h.example/files/base` is not one of the four roots, so the last segment is `base`. The four roots themselves return the host label instead of the word `base`. The app comment that says the heading is never the word `base` describes the intent of those four roots, not every input.
- An empty principal with no label and no usable host returns `""`. The heading can be blank. Do not swap in a product name here. A placeholder, if the screen wants one, is the host's decision after this returns.
- `"not a url"` is not parsed. It is returned as itself, because it has no slash to split on. It is not rejected.
- A second trailing slash is not removed. Path `/vault/` matches. Path `/vault//` does not, and the heading falls through to a path segment.
- `memberDirectoryId` is not a shorter form of the heading. A long web id stays long.

## Source

MyNetBase `src/lib/base/orgMembers.ts`, `nameFromWebId` (private, copied), `memberDisplayName`, `memberDirectoryId`.
