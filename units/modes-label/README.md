# modes-label

The words for a mode set. Both modes are one sentence. Append is not a word here.

## What this is

`modesLabel(modes)` returns one of four sentences:

- `Read + write`
- `Write only`
- `Read only`
- `No access modes`

The list badge and the write-guard reason both use these words, so they cannot disagree about what is held. The `+` has a space on each side. The sentence is not lowercased here.

## What this is not

- Not a chip per mode. One detail pane draws a separate chip for read and a separate chip for write, and it stopped using the combined sentence. That pane is right to do so. Do not "restore" this sentence there, and do not split this function into chips to match that pane.
- Not vault-modes. This function does not remove `append` or `control` from a stored set. It only fails to mention them. An append-only list and an empty list produce the same sentence.
- Not a permission check. `Write only` does not grant the write. It describes a set the host already decided.
- Not lowercased. One guard builds `You hold ${modesLabel(modes).toLowerCase()} ...`. The lowercase happens at that call. `read + write` is not what this function returns.

## How to take it

Package: `@kaigilb/gilbplatformcode-modes-label`

```ts
import { modesLabel } from "@kaigilb/gilbplatformcode-modes-label";

const badge = modesLabel(modes);
```

## What you pass

A list of strings. Usually the list `narrowVaultModes` already returned. You may pass the raw wire list. Know what that does: `append` alone becomes `No access modes`, which reads as "nothing" even though the wire carried a word this function does not speak.

## What you get

One of the four sentences. Never an empty string.

| Input | Result |
|---|---|
| `["read", "write"]` | `Read + write` |
| `["write", "read"]` | `Read + write` — order does not matter |
| `["write"]` or `["write", "append"]` | `Write only` |
| `["read"]` | `Read only` |
| `[]`, `["append"]`, `["control"]`, `["READ"]` | `No access modes` |

`READ` is not `read`. There is no case fold.

## Examples

```ts
modesLabel(["read", "write"]); // "Read + write"
modesLabel(["write"]);         // "Write only"
modesLabel(["append"]);        // "No access modes"
```

## Host must supply

The mode list. If the sentence is going into the guard that lowercases it, lowercase at the call, not by editing the four sentences. The badge uses them as returned.

## Do not

- Do not add `Append only` or `Control`. Those modes are not a reach grade in this wording. A fourth sentence would make the badge and the guard disagree with every existing call.
- Do not return the modes joined by a comma. `read, write` is not the sentence. The sentence is `Read + write`.
- Do not treat `No access modes` as "the vault is hidden". The row can still be listed. The sentence says the set held no read and no write.
- Do not lowercase the return value inside a wrapper and then also lowercase it at the guard. The guard would show `read + write` still, but a badge that shared the wrapper would lose the capitals.

## Wrong readings

- Write does not imply read. `["write"]` is `Write only`, not `Read + write`.
- Both present is `Read + write` even when the list is `["write", "read", "write"]`. Duplicates do not change the sentence.
- The sentence is not a translation key. The words are the product copy. Do not rephrase `Write only` to `Can write`.
- An empty list is a stated fact, not a missing label. Do not substitute the vault's name.

## Source

GilbApp `src/lib/base/types.ts`, `modesLabel`. Called from the vault list and from the save-guard. The detail pane's per-mode chips were not copied.
