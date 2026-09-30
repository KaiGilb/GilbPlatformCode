# folder-part

Which already-read link is a member of a folder. The folder is the whole. An ended link is dropped only when the document says so.

## What this is

`folderPartsFromListing(rel, folderIdOrUri)` reads one row of a relation listing you already have.

`folderPartFromDocument(rel, doc, folderIdOrUri)` reads one relation document you already fetched, for a row the listing could not decide.

A member is the source end of a `t:PartOf` link whose target is this folder.

## What this is not

- Not the fetch. Listing relations and reading a relation document stay in the app.
- Not "every co-member." The listing of a folder includes links where the folder is the source, and links that are not part-of. Treating those people as members publishes the parent and whatever else the folder merely points at.
- Not `relation-ends`. That unit returns the source and the target of a document. It does not decide membership, and it does not drop an ended link. This unit drops ended only on the document arm.
- Not a grant. Saying who the members are is not the same as making them public. The grant stays in the app.

## How to take it

Package: `@kaigilb/gilbplatformcode-folder-part`

```ts
import { folderPartFromDocument, folderPartsFromListing } from "@kaigilb/gilbplatformcode-folder-part";

const decision = folderPartsFromListing(rel, folderIdOrUri);
if (!decision.needDocument) {
  use(decision.parts);
} else {
  const one = folderPartFromDocument(rel, doc, folderIdOrUri);
}
```

When `needDocument` is true there is no `parts` field. Do not default it to an empty list and then skip the document. Empty and unread are different. Empty means you know there are no members on that link. Unread means you do not know yet.

## What you pass

`folderIdOrUri` — the folder's opaque id or its address. Both are tailed the same way. `uriTail` is the private copy of `id-tail`. Query and hash are removed, trailing slashes are removed, then the last segment is decoded.

The listing row:

- `relation` — the link address. Kept as `relationUri`. The id is the tail.
- `role` — exactly `role:target` for a link that might contain members. `role:source` is the folder being a member of something else. That row is decided empty.
- `type` — present only when the listing named a predicate. It may be `t:PartOf`, a list, `{ "@id": ... }`, or an address. It is read with the `type-curie` rules.
- `members` — present only when the listing named them. An empty array is present. Each member has `member` and `role`. The member role must be exactly `role:source`.

The document:

- `typeCurie` — already resolved. `t:PartOf` matches. An address in this field does not. Resolve with `type-curie` first if that is all you have.
- `sourceUri`, `targetUri` — the ends. The target tail must be the folder. The source tail is the member.
- `extras` — where the lifecycle is read. Pass `{}` when there is none. Do not omit the object.

## What you get

From the listing:

- Role is not `role:target` → `{ needDocument: false, parts: [] }`.
- Role is target, and both `type` and `members` are present → decided. Parts are the source ends whose tail is non-empty and not the folder itself. A type that is not `t:PartOf` yields an empty list, not a document read. A bare word `PartOf` is not `t:PartOf`.
- Role is target, and `type` or `members` is absent → `{ needDocument: true }`.

The listing arm does not look at lifecycle. If the listing gave you the members, an ended link is still a member. The app's listing does not carry lifecycle on that arm. Do not filter it yourself and then also read the document. You will disagree with the app.

From the document, or null:

- Role is checked again. `role:source` is null even if the document's target is the folder.
- `typeCurie` must be exactly `t:PartOf`.
- Ended is `extras.relationLifecycleState`, and only if that value is null or missing does `a:relationLifecycleState` count. `""` does not fall through. A list uses the first entry only. The word is exactly `ended`. `Ended` is not ended.
- Target tail must equal the folder tail. Source tail must be non-empty and not the folder.

`relationUri` is the address you passed, including a query if you passed one. `relationId` is the tail, so a query is not part of the id.

## Examples

```ts
folderPartsFromListing(
  {
    relation: "https://vault.example/base/r/link1",
    role: "role:target",
    type: "t:PartOf",
    members: [{ member: "https://vault.example/base/e/note1", role: "role:source" }],
  },
  "folder1",
);
// { needDocument: false, parts: [{ memberId: "note1", relationId: "link1", relationUri: "..." }] }

folderPartsFromListing(
  { relation: "https://vault.example/base/r/link1", role: "role:target", type: "t:PartOf" },
  "folder1",
);
// { needDocument: true }  — members were not on the row

folderPartFromDocument(
  { relation: "https://vault.example/base/r/link1", role: "role:target" },
  {
    typeCurie: "t:PartOf",
    sourceUri: "https://vault.example/base/e/note1",
    targetUri: "https://vault.example/base/e/folder1",
    extras: { relationLifecycleState: "ended" },
  },
  "folder1",
);
// null
```

## The host must supply

The listing row and, when the decision says so, the document. This unit does not fetch, and it does not grant.

## Do not

- Do not publish every id on the listing. Filter with this function first.
- Do not treat `needDocument: true` as an empty folder. Read the document, then call the second function.
- Do not pass an unresolved address as `typeCurie`. The listing arm accepts an address. The document arm does not. They are different inputs on purpose.
- Do not drop ended links on the listing arm. There is no ended field in that decision.
- Do not let the two private copies drift from `id-tail` and `type-curie`. A broken `%` in a type address throws, in both places. `uriTail` catches a broken `%` and returns the encoded segment. Those are different functions.

## Wrong readings

- "The folder's parent is a member." No. The parent link has the folder as the source. Role `role:source` produces no members.
- "`PartOf` and `t:PartOf` are the same on the listing." No. A bare word stays a bare word and does not match.
- "Ended on either spelling is ended." Only when the first key is null or absent. A first key of `live` hides an ended second key.
- "The member id is the whole address." No. It is the tail.

## Where it was taken from

GilbApp `src/lib/base/folderPublic.ts`, the membership decision inside `listFolderPartMembers`. The grant, the revoke, and the reads stay in the app. `relation-ends` does not drop ended links. This document arm does.
