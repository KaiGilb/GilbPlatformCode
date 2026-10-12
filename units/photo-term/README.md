# photo-term

The profile-photo term's read spellings and its one write spelling, read from the GilbVeda master at run time. No app keeps a list.

## What this is

`resolvePhotoTerm({ vedaOrigin, slug?, fetchImpl? })` reads `<vedaOrigin>/base/a/<slug>` (slug default `profilePhoto`) and returns a `PhotoTerm`:

| Field | Meaning |
|---|---|
| `readKeys` | every spelling a stored fact may carry, prefixed (`a:profilePhoto`) and bare (`profilePhoto`), retired spellings included |
| `writeKey` | the ONE spelling to write, as the master serves it (`a:profilePhoto`) |
| `writeKeyBare` | the same without its one leading prefix (`profilePhoto`), for a write helper that adds `a:` itself |
| `termUrl` | the term document's address, so a claim can name where its spellings came from |

The read set is every segment of `a:predicateAttribute` split on `|`. The write spelling is the one segment not named in `a:deprecatedNotation`.

`createPhotoTermResolver(options & { store? })` resolves once and keeps the answer for the life of the resolver: after the first successful read it does not read again. A read that fails before then serves the stored answer or the seed when there is one, and otherwise rejects; the next `get()` tries again. With a `store` (`localStorage` fits), the answer survives a reload. It is stored under a key that names the term's address, so a resolver for another slug or another master never reads it. That key is not the private package's `gilb-photo.term.v1`, so a cache written by that package is not read; the seed covers the cold start. With nothing in hand, it starts from a dated seed (`PHOTO_TERM_SNAPSHOT`), a recorded reading of the master, used only for the `profilePhoto` slug and replaced by the first live read. `peek()` returns what is in hand without waiting; null means "not known yet", never "no photo".

`photoRefFromFacts(facts, term)` reads the photo reference off a record's facts under any read spelling, as a plain string or a `{"@id": …}` node.

## What this is not

- Not a fetch of the photo. That is `photo-ref`, then the host's fetch.
- Not the photo's access level. The master holds several incompatible vocabularies for it; carrying one here could only mean hardcoding it.
- Not a general term resolver. It is shaped for one name predicate.

## How to take it

Package: `@kaigilb/gilbplatformcode-photo-term`

```ts
import { createPhotoTermResolver, photoRefFromFacts } from "@kaigilb/gilbplatformcode-photo-term";

const photoTerm = createPhotoTermResolver({ vedaOrigin: config.vedaOrigin, store: localStorage });
const ref = photoRefFromFacts(card.facts, await photoTerm.get());
```

## What you pass

`vedaOrigin`: the GilbVeda master's origin, from the host's configuration. Optional: `slug`, `fetchImpl` (default the global `fetch`), `useSeed: false` (refuse the seed; for tests), `store`.

## What you get

A `PhotoTerm`, or a `PhotoTermUnavailableError` when the master could not be reached or served something unusable (including a body that is not a term document, such as `null`) and nothing better is in hand.

## Host must supply

The master's origin. To refresh the seed: `VEDA_ORIGIN=<origin> npm run refresh-term`. It runs a control (`a/zzqqnotaterm` must answer 404) and refuses to capture otherwise.

## Do not

- Do not add a spelling to a list in an app or in this unit. A missing spelling is missing from the master; it is the ontology's to place.
- Do not treat `PhotoTermUnavailableError` as "this person has no photo". It is a claim about this request, not about the data.
- Do not hand-edit `termSnapshot.ts`. Run the refresh script.
- Do not send `writeKeyBare` to a store that keeps body keys as written. It names no term there.

## Wrong readings

- Retired spellings are READ. Deprecation retires the write, never the read; data written before still carries the old key.
- Two current spellings with none retired is not a pick-the-first. It throws, because order carries no meaning.
- Every spelling retired throws too. Writing a retired spelling is worse than not writing.

## Source

`photoTerm.ts` and `termSnapshot.ts` from the private `gilb-photo` package. Changed here: the seed no longer names the master's host; its `termUrl` is built on the injected origin, and it is used only for its own slug. The refresh script requires `VEDA_ORIGIN`.
