# wire-key

The spelling a reader uses after a stored attribute has already been framed. One leading `a:` comes off. This is a read. It is not a write.

## What this is

`wireKeyFor(storedAttribute)` answers one question: given the key the store framed, what key does a reader look up.

The framing step may hand the reader `a:label` or `label`, depending on how the vault compacted the document. A reader that only looks for one of those misses the fact. This function makes the two spellings meet, and only in that direction.

## What this is not

- Not the stored-spelling unit. That unit decides the key a **write** must send. This unit decides the key a **read** looks up. They are opposites. Do not chain them.
- Not permission to store the result. `label` from this function is not permission to store `label`, and it is not permission to store `a:label` without asking stored-spelling.
- Not a trim, not a case fold, and not a decoder. A space, a capital `A:`, and a full address are left as they arrived.
- Not a check that the key exists on a document. It rewrites one string.

## How to take it

Package: `@kaigilb/gilbplatformcode-wire-key`

```ts
import { wireKeyFor } from "@kaigilb/gilbplatformcode-wire-key";

const key = wireKeyFor(framedKey);
const value = framedDocument[key];
```

## What you pass

One string. The key as the framed document spells it. Not the document. Not a list of keys.

## What you get

A string.

| Input | Result |
|---|---|
| `a:label` | `label` |
| `a:a:label` | `a:label` — one prefix only. Not `label`. |
| `a:` | `""` |
| `label` | `label` |
| `role:source` | `role:source` |
| `A:label` | `A:label` — the prefix is lowercase `a:` only |
| ` a:label` | ` a:label` — a leading space means the prefix is not there |
| `https://h.example/base/a/label` | the same address. It does not start with `a:` |

Nothing else is removed. `filectl:`, `cost:`, `owl:sameAs`, and any other prefix stay.

## Examples

```ts
wireKeyFor("a:givenName"); // "givenName"
wireKeyFor("a:a:label");   // "a:label"
wireKeyFor("role:source"); // "role:source"
```

A reader indexes the framed document with this result. Both store spellings then land on the same lookup. That is the whole job.

## Host must supply

The framed key. This function does not read a document, does not ask the vault which spelling it serves, and does not know whether the value beside the key is a string.

## Do not

- Do not send the result back on a write. Feeding `label` into a write body is the defect the framing was built to stop. The write key comes from stored-spelling, which also looks at assembled terms and the vault's own context.
- Do not strip every `a:` in a loop. `a:a:label` is `a:label` on purpose. A second strip would invent a key the framing did not produce.
- Do not trim first. `" a:label"` is not an `a:` key. Trimming it and then calling this changes the document's spelling.
- Do not treat `""` from `a:` as "the field is absent". The key was present and empty after the prefix. Absence is a missing property on the document, which this function never sees.

## Wrong readings

- "It returns the app slug, so I can prefix it again with `a:`." No. The result of a double prefix is still prefixed. Prefixing `a:label` (the result of `a:a:label`) produces `a:a:label` again. And a foreign key such as `role:source` would become `a:role:source`, which the store did not serve.
- "Capital `A:` is the same prefix." It is not. `A:label` is unchanged.
- "A full address that contains `/a/` should lose that piece." It should not. Only a key that **starts** with the two characters `a:` changes.

## Source

MyNetBase `src/lib/veda/vocab.ts`, `wireKeyFor`. The comment above that function is the reason the write direction is a different unit.
