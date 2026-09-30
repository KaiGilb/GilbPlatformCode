# relation-ends

The source end and the target end of a relation document you already decoded. A short `base:` id is expanded from that document, or it stays unresolved.

## What this is

`relationEndsFromDocument(id, doc)` returns:

- `id` — the id you passed. It is not read from the document.
- `uri` — the document's `@id` when that value is a string, otherwise null.
- `typeCurie` — the type spelling, from `@type`, or from `type` when `@type` is missing or null.
- `sourceUri` — the first source key that expands to an address.
- `targetUri` — the first target key that expands to an address.
- `extras` — the other facts.

Source keys, in order: `role:source`, then `source`. Target keys: `role:target`, then `target`. A key that does not expand is skipped, and the next key is tried. A list contributes its first entry only.

## What this is not

- Not a fetch. Pass the document you already decoded. A 404 is not an empty document. Do not call this with a stand-in.
- Not every member. `relation-members` lists members. This picks one source and one target.
- Not a host. When `@id` is missing, `uri` is null. The app fills a host URL in that gap. This unit does not.
- Not an ended-link filter. An ended fact stays in `extras` when its key is kept. Dropping ended links is a later decision.

## How to take it

Package: `@kaigilb/gilbplatformcode-relation-ends`

```ts
import { relationEndsFromDocument } from "@kaigilb/gilbplatformcode-relation-ends";

const ends = relationEndsFromDocument(id, doc);
```

The folder copies two helpers so it can stand alone. The short-id expansion must stay in agreement with `compact-id`. The type spelling must stay in agreement with `type-curie`. If you only need one of those, use that unit.

## What you pass

`id` is the id you already had. `doc` is the JSON object. Keys are read as stored.

## What you get

An address, or null for an end that did not expand.

A `base:` id is prefixed with the base taken from this document's `@id`. That base exists only when `@id` matches `http(s)://<host>/base/e/<one segment>` or `.../base/r/<one segment>`. The returned base ends with `/`. A query, a hash, a trailing slash, `/vault/`, or an extra path segment does not expand. A `base:` id with no such `@id` is null. It is not kept as the short string, and it is not composed onto some other host.

A string that starts with `http` or `urn:` is kept unchanged. The check is `startsWith`, not a URL parse. `httpfoo` is kept. Do not tighten that. `https://...` starts with `http`, so it is kept.

`veda:t/Name` does not start with `http`, `urn:`, or `base:`. It is null even when the document's own id would have expanded a `base:` id.

Extras skip keys that start with `@` or `role:`, and the exact keys `source`, `target`, and `member`. `Member` is not skipped. The bare key `type` is not skipped either. When `@type` is missing, `type` is the type spelling, and that same value stays in extras. Do not drop it from one of those two places. Values are the same references, not copies.

A broken `%` in a `/base/t/` type throws. The app does not catch it. Do not add a catch here.

## Examples

```ts
const vault = "https://holder.example.test/base";
const ends = relationEndsFromDocument("rel-1", {
  "@id": `${vault}/r/rel-1`,
  "@type": "t:ConnectedTo",
  "role:source": { "@id": "base:e/person-1" },
  "role:target": { "@id": "base:e/note-1" },
});
ends.sourceUri === `${vault}/e/person-1`;
ends.sourceUri.includes("/e/base:") === false;
```

A document id of `urn:uuid:...` leaves both ends null. The `uri` is still that urn string, because `@id` was a string.

## The host must supply

The document. If you need a URL when `@id` was not a string, compose it outside this unit, from the host you already trust. Do not invent one inside.

## Do not

- Do not glue a `base:` id onto the app's origin. That writes an address no host holds (`.../e/base:e/...`).
- Do not read `source` ahead of `role:source` when `role:source` already expanded.
- Do not unwrap a whole list. The second entry is ignored on purpose.
- Do not treat null as "keep the short form". Null means the end was not read. The screen's refusal stays honest.

## Wrong readings

- "`uri` null means the relation has no id." It means the document did not carry a string `@id`. You still passed `id`.
- "An unknown prefix should be left as text." Not on an end. An end is an address or null.
- "Ended relations should disappear here." They should not. Ending is a later filter.

## Where it was taken from

GilbApp `src/lib/base/relationDoc.ts`, `relationDocFromJson` and the helpers it uses for the two ends. The fetch stays in the app. The app's fallback URL, used when `@id` is not a string, stays in the app.
