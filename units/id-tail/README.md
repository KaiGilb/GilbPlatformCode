# id-tail

The last segment of an id. There are two functions. They do not do the same thing. Picking the wrong one puts a query in the id, or fails to decode it, or turns a trailing slash into an empty id.

## What this is

| Function | Also called in the app | Query and hash | Trailing slash | Percent-encoding |
|---|---|---|---|---|
| `slashTail` | `entityIdTail`, `idFromUri`, `idFromEntityUri` | Kept. `id?x=1` stays `id?x=1`. | The segment after the slash is empty, so the result is `""`. | Not decoded. `a%20b` stays `a%20b`. |
| `uriTail` | `opaqueIdFromUri` (the same function, not a second rule) | Removed first. | Removed first, so `…/note-x/` is `note-x`. | Decoded. `a%20b` becomes `a b`. A broken encoding returns the encoded segment. |

No slash at all: both return the whole string.

`entityIdTail`, `idFromUri`, and `idFromEntityUri` are `slashTail`. They were three copies. They are one function here so they cannot drift.

## What this is not

- Not a check that the segment is an id the vault will recognise.
- Not a host. The front of the address is discarded. Two addresses with the same tail and different hosts become the same string. That is resemblance, not identity. Do not delete or address a record by this string alone when more than one host is in play. Use the full address (see hands-off).

## How to take it

Package: `@kaigilb/gilbplatformcode-id-tail`

```ts
import { slashTail, uriTail } from "@kaigilb/gilbplatformcode-id-tail";
```

Path: `units/id-tail/`.

## Which one to call

- The route wants the tail of an entity address, and the address has no query: either works. Prefer `slashTail` when you are matching `entityIdTail` / `idFromUri` / `idFromEntityUri`.
- The address may have `?` or `#`, or a trailing slash, or a `%`: use `uriTail`. Relation member ids use `uriTail`.
- You are about to open the record: use the full address, not either tail.

## Examples

```ts
slashTail("https://example.test/base/e/id?x=1"); // "id?x=1"
uriTail("https://example.test/base/e/id?x=1");   // "id"

slashTail("https://example.test/base/e/note-x/"); // ""
uriTail("https://example.test/base/e/note-x/");   // "note-x"

slashTail("https://example.test/base/e/a%20b"); // "a%20b"
uriTail("https://example.test/base/e/a%20b");   // "a b"

slashTail("bare-id"); // "bare-id"
uriTail("bare-id");   // "bare-id"
```

## Do not

- Do not "clean up" `slashTail` by stripping the query. Callers of `entityIdTail` do not do that. A query glued to the id is how you notice you needed `uriTail`.
- Do not treat `opaqueIdFromUri` as a different cut. It is `uriTail`.
- Do not decode twice. `uriTail` decodes once.

## Where it came from

`slashTail` is GilbApp `entityIdTail` (`src/lib/base/processTypes.ts`), `idFromUri` (`src/lib/base/vaultSets.ts`), and `idFromEntityUri` (`src/lib/base/fanout.ts`). Those three bodies match. `uriTail` and `opaqueIdFromUri` are GilbApp `src/lib/base/relations.ts`.
