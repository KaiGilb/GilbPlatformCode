# compact-id

Turns the short `base:` form inside a relation document into an absolute address, using the document's own id as the host. A short form is not an address you can open, match, or save.

## What this is

| Function | You pass | You get |
|---|---|---|
| `vaultBaseFromRelationId` | The document's `@id`. | `https://<host>/base/` or null. |
| `absoluteIdFromCompact` | A string or `{ "@id": string }`, and that base. | An absolute string, or null. |
| `memberAddress` | The same, but a one-element list is unwrapped first. | An absolute string, or null. |
| `firstJsonLdValue` | Anything. | The first list entry, or the value if it is not a list. |

```ts
const base = vaultBaseFromRelationId("https://example.test/base/r/rel1");
// "https://example.test/base/"

absoluteIdFromCompact("base:e/petter", base);
// "https://example.test/base/e/petter"

absoluteIdFromCompact("base:e/petter", null);
// null    — not the string "base:e/petter"
```

## What this is not

- Not a request, and not a guess of a host. If the document id does not yield a base, you get null. Do not substitute a host you remember.
- Not the graph's member walker. That walker still returns the short string. This function is the relation-document read. Do not "fix" the other walker by assuming it now agrees.
- Not a vault-segment reader. Only `/base/e/<id>` and `/base/r/<id>` produce a base. `/vault/…` returns null.

## How to take it

Package: `@kaigilb/gilbplatformcode-compact-id`

```ts
import { memberAddress, vaultBaseFromRelationId } from "@kaigilb/gilbplatformcode-compact-id";
```

Path: `units/compact-id/`.

## The document id

Accepted: `http://` or `https://`, a host, `/base/e/<one segment>` or `/base/r/<one segment>`. No query, no hash, no trailing slash, no further path.

The result always ends with `/`. This function will not add a slash to a base you pass yourself. If you pass `https://example.test/base` without the slash, `base:e/id` becomes `https://example.test/basee/id`. Use the string `vaultBaseFromRelationId` returned.

## What counts as already absolute

`absoluteIdFromCompact` returns the string unchanged when it starts with `http` or with `urn:`. That is `startsWith`, not a URL parse. `httpfoo` is treated as absolute. Do not tighten it; callers rely on the short form being the only thing that expands, and on everything else either passing through or becoming null.

`base:` expands only when you passed a base. The four characters `base:` are removed and the rest is appended. `base:e/petter` → `<base>e/petter`.

Any other string is null. Null means do not use it as an address. It does not mean "keep the short form". Writing the short form back into a host-shaped slot produces an address that exists nowhere.

## Lists

`absoluteIdFromCompact` does not unwrap a list. A list is null there. `memberAddress` unwraps one level and reads the first entry only. An empty list is null. The second entry is ignored.

## What the host must supply

The document `@id` of the relation you just read, not a host from configuration. The base is derived from that id so a relation opened on vault A is not rewritten onto vault B.

```ts
const base = vaultBaseFromRelationId(doc["@id"]);
const source = memberAddress(doc["role:source"] ?? doc.source, base);
```

If `base` is null, do not invent one. Leave the member unresolved.

## Do not

- Do not treat a null expansion as the compact string. That is the bug this function exists to stop.
- Do not add `/vault/` to the document-id pattern.
- Do not append a slash "to be helpful" inside `absoluteIdFromCompact`. The slash belongs on the base.

## Wrong readings

- "null means the member was removed." It means this value was not an absolute address and could not be expanded. A relation can also simply have no member; that is the same null, and the screen should say the end is absent, not that expansion failed, unless you still hold the short string beside it.
- "`httpfoo` should be rejected." Not here. The check is the prefix `http`.

## Where it came from

GilbApp `src/lib/base/relationDoc.ts`: `vaultBaseFromDocId` (named `vaultBaseFromRelationId` here), the private `idOf` (named `absoluteIdFromCompact`), and `firstValue` (named `firstJsonLdValue`). `memberAddress` is `firstValue` then `idOf`, which is what that file does for one role key.
