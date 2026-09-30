# stored-spelling

The key a write must use. A key the vault renamed, and a key the vault only assembles at read time, must not be prefixed.

## What this is

`parseVaultContext(doc)` reads a context document the host already fetched into a map.

`namesNoStoredFact(wireKey, ctx)` is true when that map says the key is an assembled bucket. An assembled key names no stored fact. It must not be written.

`storedSpellingFor(wireKey, ctx, spelling, servedByVault)` is the key to put in the write body.

## What this is not

- Not a fetch. Loading the context document stays in the app. A `@context` that is only a URL becomes an empty map here. Empty means "the vault did not say", and the old prefix rule applies. It does not mean "drop every key".
- Not the addressable-slug unit. A private copy of that slug test lives in this file and must stay in agreement with addressable-slug: an ASCII letter, then at most 63 of letters, digits, `_`, and `-`. No trim. It is not exported. If the question is only "may this app prefix this slug", use addressable-slug.
- Not the stored-field unit. stored-field reads one fact off a document. This unit chooses the key a write will send.
- Not a decision to repair two spellings stored at once. `unknown` keeps today's prefix.

## How to take it

Package: `@kaigilb/gilbplatformcode-stored-spelling`

```ts
import {
  parseVaultContext,
  namesNoStoredFact,
  storedSpellingFor,
} from "@kaigilb/gilbplatformcode-stored-spelling";

const ctx = parseVaultContext(contextDoc);
if (namesNoStoredFact(key, ctx)) {
  // leave it out of the body
} else {
  const stored = storedSpellingFor(key, ctx, spelling, true);
}
```

## What you pass

`parseVaultContext` takes the parsed JSON. Either `{ "@context": { ... } }` or the context object itself.

`storedSpellingFor` takes:

- the wire key, exactly as served
- the map
- `bare`, `prefixed`, or `unknown` — what the vault's own log said about that key
- `servedByVault` — true only when this key came off a document the vault served. A key this app invented is false.

## What you get

`parseVaultContext` returns a new map each call.

Skipped: keys starting with `@`, string values (those are prefixes), objects with no string `@id`, an `@id` of `""`.

`assembled` is true only when `@container` is exactly `@set`. `@list` is not assembled.

`namesNoStoredFact` is true only for that exact key with `assembled === true`. A missing key is false. The key is not trimmed.

`storedSpellingFor`, first match wins:

1. Lowercase `http://` or `https://` is unchanged. `HTTP://` does not match this step.
2. Any key containing `:` is unchanged. This step is before the map. `a:label` stays `a:label`. `owl:sameAs` stays `owl:sameAs`. The map cannot rename a key that already has a colon.
3. An assembled map entry returns the wire key, not `term.id`.
4. Any other map entry returns `term.id`.
5. A key that is not an app slug is unchanged. A leading digit, a space, `""`, and a 65-character slug are this case.
6. `servedByVault` and spelling `bare` returns the wire key. `prefixed` and `unknown` do not. `servedByVault` false does not, even when the spelling is `bare`.
7. Otherwise one `a:` is added. `name` becomes `a:name`.

Nothing is trimmed. `httpfoo` has no colon and is a slug, so with an empty map it becomes `a:httpfoo`.

`shows` mapped to `a:viewShows` returns `a:viewShows`, not `a:shows`.

## Host must supply

The context document, and the spelling from the vault's own log. Do not hardcode a rename table. The vault's document is the table.

## Do not

- Do not prefix every bare key. `shows` is not `a:shows`.
- Do not write an assembled key under `term.id`. That stores a value the vault built at read time.
- Do not call `namesNoStoredFact` alone and then prefix the key when it returns false. False only means "not an assembled bucket". The spelling function is the next question.
- Do not treat an empty map as a failed save. The write continues with the prefix rule.

## Wrong readings

- `HTTP://...` is unchanged because it contains `:`, not because it was recognised as an address.
- A bare spelling applies only when the vault served the key. A key the app just typed is prefixed even if the caller passes `bare`.
- Two live spellings are `unknown`, not a guess. Do not pick the bare one because it is shorter.

## Source

GilbApp `src/lib/base/vaultContext.ts`, `parseVaultContext`, `namesNoStoredFact`, and `storedSpellingFor`. The fetch and the datom-log cache stay in the app. The slug test is a private copy of GilbApp `isAppAddressableSlug` and must stay in agreement with `units/addressable-slug`.
