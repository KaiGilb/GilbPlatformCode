# direct-shares

Who is named on this record as a direct reader or a direct writer. Not the rest of access.

## What this is

`parseGrantPrincipals(raw)` splits one string into principals. The cut is a comma followed by whitespace. That is how a framed array is joined. `a, b` is two entries. `a,b` with no space is one entry. Do not split on every comma.

`listDirectShares(facts)` reads `directReader` or `a:directReader`, and `directWriter` or `a:directWriter`.

- A writer is listed as `read` and `write`, even when the reader fact does not name them. `readGranted` is true only when the reader fact names them. Show Repair when a writer has `readGranted` false.
- A reader who is not a writer is `read` only.
- Nobody else is invented.
- Rows are sorted with `localeCompare` and no locale argument, so the order follows the runtime.

A missing fact map returns `[]`.

## What this is not

- Not the vault grant, not a group, and not "the public can read". Those are other facts. An empty list means this record does not name a direct reader or writer. It does not mean nobody can read it.
- Not a live check. It lists the names written on the frame you pass.

## How to take it

Package: `@kaigilb/gilbplatformcode-direct-shares`

```ts
import { listDirectShares, parseGrantPrincipals } from "@kaigilb/gilbplatformcode-direct-shares";
```

Path: `units/direct-shares/`.

## Examples

```ts
parseGrantPrincipals("a, b");  // ["a", "b"]
parseGrantPrincipals("a,b");   // ["a,b"]

listDirectShares({
  directReader: "reader-only, writer-too",
  directWriter: "writer-only",
});
// reader-only → ["read"], readGranted true
// writer-only → ["read", "write"], readGranted false
// writer-too  → ["read", "write"], readGranted true
```

## Changes in 0.1.1

- Each person row has `readGranted`. It is true only when the reader fact names them. A writer is still listed as read and write when it is false. Show Repair when a writer has `readGranted` false.

## Do not

- Do not show a writer as write-only. This list always pairs write with read.
- Do not split principals on a bare comma. An address is unlikely to contain `, `, and a bare comma is left intact on purpose.
- Do not treat `[]` as "private". Say "no direct reader or writer is named on this record" if you need a sentence.

## Where it came from

GilbApp `src/lib/base/entityShare.ts`, `parseGrantPrincipals` and `listDirectShares`.
