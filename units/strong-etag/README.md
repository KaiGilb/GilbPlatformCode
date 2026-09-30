# strong-etag

The validator to send back with a later write. A weak marker added in transit is removed. The quotes around the validator stay.

## What this is

`normalizeStrongEtag` takes the ETag header text, or the value you are about to send as If-Match.

- `null`, `undefined`, and a string that trims to nothing become `null`. Do not send an If-Match in that case.
- One leading `W/` or `w/` is removed. The rest is trimmed.
- If nothing remains after that, the result is `null`. `W/` alone is null. `W/` followed only by spaces is null.
- Quotes stay. `W/"sha256:ab"` becomes `"sha256:ab"`, quotes included.
- A second `W/` stays. `W/W/"sha256:ab"` becomes `W/"sha256:ab"`.
- `WW/` is not a weak marker. It is kept whole.
- A `W/` that is not at the start is kept. `sha256:W/ab` stays `sha256:W/ab`.
- The result is not lower-cased, and it is not checked for a hash shape.

The comparison on the server is exact. Stripping the weak marker is what keeps a real mismatch a mismatch. Do not also strip the quotes, or the server will not recognise a validator it issued with quotes.

## What this is not

- Not a generator of validators.
- Not a decision to retry. `null` means you do not have a validator. It does not mean the write should proceed without one.
- Not a fetch.

## How to take it

Package: `@kaigilb/gilbplatformcode-strong-etag`

```ts
import { normalizeStrongEtag } from "@kaigilb/gilbplatformcode-strong-etag";
```

Path: `units/strong-etag/`.

## What you pass

The raw header string, or null / undefined when the header was absent.

## What you get

The strong validator string, quotes included when they were there, or null.

## Examples

```ts
normalizeStrongEtag('W/"sha256:ab"'); // '"sha256:ab"'
normalizeStrongEtag('  w/"sha256:ab"  '); // '"sha256:ab"'
normalizeStrongEtag('"sha256:ab"'); // '"sha256:ab"'
normalizeStrongEtag("W/"); // null
normalizeStrongEtag(null); // null
normalizeStrongEtag('W/W/"sha256:ab"'); // 'W/"sha256:ab"'
normalizeStrongEtag('WW/"sha256:ab"'); // 'WW/"sha256:ab"'
```

## What the host must supply

The header text. Send the result as If-Match only when it is not null. A write with no validator is the host's decision, and this function will not invent one.

## Do not

- Do not strip the quotation marks.
- Do not strip every `W/` in the string. Only one leading marker.
- Do not lowercase the hex.
- Do not treat `WW/` as weak.

## Wrong readings

- "Weak means the validator is stale." It means an intermediary marked it weak. The opaque text is still the validator. A genuinely different validator still fails the write.
- "Null means the resource is gone." It means there is no marker text to send back.
- "Quotes are decoration." They are part of the bytes the server compared. Leave them.

## Where it came from

MyNetBase `normalizeStrongEtag` in `src/lib/base/lws.ts`.
