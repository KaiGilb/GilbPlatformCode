# entity-ref

Reads one stored string as a pointer to another record, lists those pointers on a record, and — only when both ends are already in the set you passed — turns them into a pair. It also picks a name to show.

It does not fetch the other record. If the other record is not in the set, you get its id and address back from `missingEntityRefTargets` and nothing else. You go and load it.

## What this is

| Function | You pass | You get |
|---|---|---|
| `entityRefFromFact` | One string, or null. | `{ uri, id }` or null. |
| `entityRefsOf` | One record's `facts`, and an optional set of fact names to ignore. | One entry per fact whose value is a record address. |
| `refDisplayName` | A fact map, and an optional address. | A string you may show. See the order below. |
| `findEntityRefPairs` | Records that are already loaded. | Edges whose both ends are in that list. |
| `missingEntityRefTargets` | The same kind of list, and an optional cap. | Addresses named by the list that are not in the list. |
| `childrenPointingAt` | One record, and a pool. | Pool rows that point at it. |

A record address is exactly `http://` or `https://`, a host, then `/base/e/<id>` or `/vault/e/<id>`. The word `base` or `vault` is kept as it was written. This function does not swap them.

## What this is not

- Not a request. Nothing is loaded.
- Not the card-link walker. That walker already draws `claimSubject`, `heldParty`, the photo, and the other names in the list below. This unit does not skip those names unless you pass them.
- Not a process title. `refDisplayName` says `Untitled` when it has nothing. A process name stays blank in that case (`stored-field`). Do not write `Untitled` back onto the record.
- Not a check that the id exists.

## How to take it

Package: `@kaigilb/gilbplatformcode-entity-ref`

```ts
import { entityRefFromFact, refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref";
```

Path: `units/entity-ref/`.

## What you pass to `entityRefFromFact`

A string the vault stored. Null and undefined are fine; both return null.

Accepted: `https://example.test/base/e/osm-r-1`, `https://example.test/vault/e/abc`, surrounding whitespace (it is trimmed).

Rejected (null): a type address (`/t/…`), a bare word, an empty string, a person address (`/p/`), a relation address (`/r/`).

The id is decoded once. `a%20b` becomes `a b` in both `id` and the rebuilt `uri`. A query, a hash, and any path after the id are dropped. `…/e/abc/extra` is id `abc`.

A broken `%` throws `URIError`. It does not become null. Catch it if the string might be damaged. Do not "fix" the throw into a null; a damaged id and a non-address are different.

## What you get from `refDisplayName`

Looked up in this order, after trim: `label`, `termLabel`, `title`, `name`. The first one that is not blank wins.

Not read: `a:label`, `a:title`, or any other spelling. An empty `label` does not hide a later `termLabel`. It only fails that one slot.

If none of the four is present, the last segment of `entityUri` is used. That cut is `uriTail` from `id-tail` (query and hash removed, trailing slash removed, percent-encoding decoded). It is not `slashTail`.

If there is no address either, the result is the word `Untitled`. That word is for the screen only.

## What the host must supply

The set of fact names your graph already draws some other way. GilbApp passes these, and only these, so they are not drawn twice:

`claimSubject`, `heldParty`, `profilePhoto`, `principalUri`, `directReader`, `directWriter`, `aliasUri`, `accountSubject`, `registeredVault`, `vaultAddress`, `anchorBoundEmail`.

Pass them as a `Set` to `entityRefsOf`, `findEntityRefPairs`, `missingEntityRefTargets`, and `childrenPointingAt`. Omit the set and those facts become pointers too. That is not a bug in this unit. It is the difference between "every address" and "addresses the other walker does not own".

`findEntityRefPairs` will not invent the missing end. Use `missingEntityRefTargets` for the ones you still need to load. The default cap is 24, applied after each add, so you get at most 24. A cap of 0 still returns the first one, because the length is checked after the push. Do not pass 0 expecting an empty list.

## Examples

```ts
entityRefFromFact("https://example.test/vault/e/a%20b?x=1");
// { uri: "https://example.test/vault/e/a b", id: "a b" }

entityRefFromFact("https://example.test/base/t/Region");
// null

refDisplayName({ termLabel: "Sarandi" }, "https://example.test/base/e/osm-r-123");
// "Sarandi"

refDisplayName({}, null);
// "Untitled"
```

A child fact `member-of` whose value is the parent's address becomes one pair `{ sourceId: childId, targetId: parentId, slug: "member-of" }` only when the parent is in the same array. Source is the record that holds the fact.

## Do not

- Do not skip `member-of`. It is not in the list above. It is the pointer this unit exists to see.
- Do not rebuild the address with a hard-coded `base` when the match said `vault`.
- Do not treat `Untitled` as stored text.
- Do not decode the id a second time. It was decoded once.

## Wrong readings

- "Null means the record was deleted." No. Null means the string was not a record address.
- "Both ends missing from the pair list means there is no link." No. It means the other end was not in the array you passed. Check `missingEntityRefTargets`.
- "`label: ''` hides `a:label`." `a:label` is never read. An empty `label` falls through to `termLabel`, then `title`, then `name`.

## Where it came from

GilbApp `src/lib/base/entityRefFacts.ts`: `entityRefFromFact`, `entityRefsOf`, `refDisplayName`, `findEntityRefPairs`, `missingEntityRefTargets`, `childrenPointingAt`. The skip set stays with the caller. The name cut matches `opaqueIdFromUri` in GilbApp `src/lib/base/relations.ts` (this folder includes that cut so it does not depend on `id-tail`).
