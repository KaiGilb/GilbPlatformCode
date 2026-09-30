# relation-members

The members named on a relation document you already have. It does not fetch the relation.

## What this is

`memberUrisFromRelationDoc(doc)` returns the full values, first-seen order, duplicates removed.

`memberIdsFromRelationDoc(doc)` returns those same values cut with `uriTail` (query and hash removed, trailing slashes removed, percent-decoded). That cut is the id-tail unit's `uriTail`, copied into this folder so the folder stands alone. It is not `slashTail`. A query is not part of the id.

## What is a member

A key is read when:

- it does not start with `@`, and
- it ends in `source`, `target`, or `member` (a `role:source` key counts), or it starts with `role:`.

`a:label` is not a member, even when the text looks like an address. `@id` on the relation itself is not a member.

A value is kept when:

- it is a string that contains `/`, or
- it is an object with a non-empty `@id`. A bare `@id` with no slash is kept.

A string with no slash is not a member. `"bare-word"` on `source` is dropped. `{ "@id": "bare-word" }` is kept. That split is easy to "fix" and wrong.

Arrays are read item by item. Null is skipped. An empty `@id` is skipped.

## What this is not

- Not a request. Pass the document you already decoded.
- Not permission to open the member on whatever vault is on screen. `memberIds` is a set key. Opening a member needs `memberUris`. An id asked for on the wrong host is a miss, and the miss is not "this member does not exist".

## How to take it

Package: `@kaigilb/gilbplatformcode-relation-members`

```ts
import { memberUrisFromRelationDoc, memberIdsFromRelationDoc } from "@kaigilb/gilbplatformcode-relation-members";
```

Path: `units/relation-members/`.

## Examples

```ts
memberUrisFromRelationDoc({
  "@id": "https://example.test/base/r/rel",
  "a:label": "https://example.test/base/e/not-a-member",
  source: { "@id": "https://example.test/base/e/left" },
  member: ["https://example.test/base/e/left", { "@id": "bare" }],
});
// ["https://example.test/base/e/left", "bare"]

memberIdsFromRelationDoc({
  source: "https://example.test/base/e/a%20b?x=1",
});
// ["a b"]
```

## Do not

- Do not use the ids to build a new address by gluing them onto the current vault. Keep the URI the document gave you.
- Do not add `a:label` to the key list because a label sometimes holds an address. A label is not a membership.

## Where it came from

GilbApp `src/lib/base/relations.ts`, `memberUrisFromRelationDoc` and `memberIdsFromRelationDoc`.
