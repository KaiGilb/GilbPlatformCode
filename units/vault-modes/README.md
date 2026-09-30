# vault-modes

Which modes a vault grant keeps, and which session rows survive. Read and write stay. Append and control do not. A row with no id does not.

## What this is

Two functions the session reader and the vault list both need, so there is one narrowing instead of two.

`narrowVaultModes` turns the wire's mode strings into the two this app reasons about.

`readSessionVaults` turns the session's vault list into lean rows: an id, and those two modes. Rows that cannot be named are not rows.

## What this is not

- Not vault-list. `canWriteVault` and `canReadVault` ask whether `write` or `read` is already in a set. They do not drop `append`. Dropping happens here, before the set is stored. Do not move the drop into the question.
- Not a fetch of the vault list, and not a session. The host passes the arrays it already decoded.
- Not a trim and not a case fold. `Read` is dropped. ` read` is dropped. `"  "` as an id is kept.
- Not a dedupe of vault ids. The same id twice is two rows. Modes inside one row are deduped. Ids are not.
- Not the rich vault row. Name, parent, entity, and landing flag are not read and not returned. Those arrive from a different response. This list must not invent them.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-modes`

```ts
import { narrowVaultModes, readSessionVaults } from "@kaigilb/gilbplatformcode-vault-modes";

const modes = narrowVaultModes(node.modes);
const vaults = readSessionVaults(session.vaults);
```

Use `narrowVaultModes` on a vault-list payload, where each node already has a name and a parent the host is copying itself.

Use `readSessionVaults` on the session payload, where each entry is only an id and modes.

## What you pass

`narrowVaultModes` takes a list of strings, or null, or undefined.

`readSessionVaults` takes a list of `{ vaultId?, modes? }`, or null, or undefined. Extra fields are ignored. They are not copied.

## What you get

`narrowVaultModes` returns a new list. `read` and `write` only, in the order they first appeared. Later copies of the same word are dropped.

| Input | Result |
|---|---|
| `["write", "append", "read", "write", "control"]` | `["write", "read"]` |
| `["Read"]`, `[" read"]`, `["WRITE"]` | `[]` |
| `undefined`, `null`, `[]` | `[]` |

`readSessionVaults` returns a new list of `{ vaultId, modes }`.

| Row | Result |
|---|---|
| missing `vaultId`, `null`, `""` | skipped |
| `vaultId` of `"  "` | kept, spaces and all. Modes still narrowed. |
| a real id | kept. Modes narrowed. Other fields dropped. |
| the same id again | a second row |
| `undefined` or `null` list | `[]` |

A null **entry** inside the list throws. It is not skipped. The app does not pass null entries. Do not add a skip to hide a bad payload.

The input list is not modified. The mode array on an input row is not modified.

## Examples

```ts
narrowVaultModes(["write", "append", "read", "write"]);
// ["write", "read"]

readSessionVaults([
  { vaultId: "", modes: ["read"] },
  { vaultId: "https://h.example.test/base/p1", modes: ["read", "control"] },
]);
// [{ vaultId: "https://h.example.test/base/p1", modes: ["read"] }]
```

## Host must supply

The decoded JSON. This function does not know the URL the list came from, and it does not decide which of the two responses is the membership source. In the app, the session list is the membership. The richer list only decorates ids that are already there. That merge stays in the host. If you let this function's output replace the session list with the richer list, you have changed the membership rule. This unit did not.

## Do not

- Do not pass `append` through as an unknown grant. Unknown here means dropped.
- Do not collapse the two modes to one "highest" word. A write-only vault is `["write"]`. Adding `read` because write "includes" read is the bug the set exists to prevent.
- Do not trim `vaultId` before the call unless the host means to change which rows exist. This function's skip is falsy, not blank-after-trim.
- Do not treat the app comment that says `podId` as the field name. The field on the object is `vaultId`. A row that has `podId` and no `vaultId` is skipped.

## Wrong readings

- `[]` from `narrowVaultModes` means none of the words were `read` or `write`. It does not mean the request failed.
- An id of spaces is a row. It is a bad id, and it is still a row. Fixing that is a different change.
- Two rows with one id are not a mistake this function repairs. The host decides if that payload is wrong.
- `readSessionVaults` does not apply `modesLabel`. The words for the set are a separate unit. An empty mode list is `[]` here, not the sentence "No access modes".

## Source

GilbApp `src/lib/base/types.ts`, `narrowVaultModes` and `readSessionVaults`. The same narrowing is called from `src/lib/base/vaultSets.ts` on the richer list. That fetch was not copied.
