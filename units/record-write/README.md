# record-write

Whether this session may write one record, from the frame you already hold and from a pin you already recorded.

## What this is

`recordWriteAllowed(vaultWriteAllowed, record, identityKeys, sessionDenied)` returns true or false.

The checks run in this order. The first hit wins:

1. Vault write is off, or there is no record, or the id is `""`. False.
2. `sessionDenied` is true. False. This is a write this session was already refused for this id. It beats a writer grant.
3. The frame has no reader grant and no writer grant. True. That is the whole-vault owner path.
4. A writer grant names this session. True. A reader grant on the same frame does not cancel it.
5. A reader grant names this session, and a writer grant does not. True only when the frame also says this session stored the row (`fileStoredBy` or `a:fileStoredBy`). Otherwise false.
6. The grants name other people. True. The vault write still stands.

`entityWriteAllowed(vaultWriteAllowed, recordId, sessionDenied)` is steps 1 and 2 only. It does not read grants. Use it when you do not have the frame. Prefer `recordWriteAllowed` when you do.

`sessionIdentityKeys(principal, shortWebId)` is the list to pass. Principal first, then the short address. Each is trimmed. A blank is left out. Null is left out.

`ENTITY_READ_ONLY_REASON` is the sentence `You can read this item but not edit it.`

## What this is not

- Not a store of refusals. The app keeps a set of ids that returned 403. You pass true or false for this id. This unit does not remember the set, and it does not listen for changes.
- Not a request. It does not ask the server who may write.
- Not the whole of access. It does not paint the read, append, or control marks.
- Not proof the server will accept the write. A true result is what the frame shows. The server can still refuse, and that refusal is what you pass back as `sessionDenied` the next time.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-write`

```ts
import {
  ENTITY_READ_ONLY_REASON,
  recordWriteAllowed,
  sessionIdentityKeys,
} from "@kaigilb/gilbplatformcode-record-write";

const allowed = recordWriteAllowed(
  vaultWriteAllowed,
  record,
  sessionIdentityKeys(principal, shortWebId),
  deniedIds.has(record.id),
);

if (!allowed) {
  // show ENTITY_READ_ONLY_REASON when the vault itself can write
}
```

Path: `units/record-write/`.

The fourth argument is required. There is no default. Forgetting the pin would show write on a row this session was already refused.

## What you pass

- `vaultWriteAllowed`: the vault-level write flag. This unit does not compute it.
- `record`: `{ id, facts? }`. `facts` values are strings, as a framed record already flattened them. A missing `facts` is the same as no grants.
- `identityKeys`: from `sessionIdentityKeys`. Pass both the opaque principal and the short address when you have them. Shares are addressed with either.
- `sessionDenied`: true only for this record's id.

## What you get

True or false. The record is not changed.

## How a grant is read

Reader keys, in order: `directReader`, then `a:directReader`. Writer keys: `directWriter`, then `a:directWriter`. Both spellings count. A value is trimmed. It is then split on a comma or a newline. A space is not required. `a,b` is two grants. Each piece is trimmed. An empty piece is dropped. A value that is only commas is not a grant at all, and the frame falls through to the owner path.

Comparison is `toLowerCase()`, with no locale. The whole string is folded, including the path. `HTTPS://Host.Example.TEST/Base/p/Me` matches `https://host.example.test/base/p/me`. This is not the person-ruling key. That one keeps the path's letter case. Do not make these two agree.

A grant written as `{"@id":"..."}` is not unwrapped. It is compared as the whole JSON text, so it does not match the principal. The result is the owner path (true), not read-only. Do not "fix" that by parsing `@id` on a grant. Only the stored-by value unwraps `@id`.

## How stored-by is read

Keys: `fileStoredBy`, then `a:fileStoredBy`. This is consulted only in step 5, when a reader grant names this session and a writer grant does not.

A trimmed value that starts with `{` is one piece, even if it contains commas. It is parsed as JSON. A string `@id` is trimmed and compared. Invalid JSON is compared as the whole literal, which will not match. A value that does not start with `{` is split on comma or newline like a grant, and each piece is trimmed.

Stored-by alone does not grant write. If the reader grants name someone else, step 6 returns true because of the vault write, not because of stored-by.

Absent, unreadable, or someone else's stored-by stays read-only when step 5 applies. Do not turn "could not tell" into write.

## Examples

```ts
const keys = sessionIdentityKeys(
  "https://id.example.test/base/p/me",
  "https://person.example.test/i",
);

recordWriteAllowed(true, { id: "n", facts: { title: "Mine" } }, keys, false); // true
recordWriteAllowed(true, { id: "n", facts: { directReader: keys[0]! } }, keys, false); // false
recordWriteAllowed(
  true,
  { id: "n", facts: { directReader: keys[0]!, fileStoredBy: keys[0]! } },
  keys,
  false,
); // true
recordWriteAllowed(true, { id: "n", facts: { directWriter: keys[0]! } }, keys, true); // false
recordWriteAllowed(true, { id: "n", facts: { directReader: "https://other.example.test/i" } }, [], false); // true
```

An empty identity list does not mean read-only. It means "these grants do not name me", so the vault write stands.

## What the host must supply

The vault write flag, the framed record, the two identity strings you actually have, and whether this id is already in the refusal set. The app's set is a module-level `Set` updated when a write returns 403. Keep that set in the app. Pass a boolean in.

## Do not

- Do not drop `sessionDenied` because the frame looks writable. The pin is the later fact.
- Do not treat a reader grant as "only read" when `fileStoredBy` names the same session. That grant is the server's own read-back on the uploader's file.
- Do not treat `fileStoredBy` as the permission. The server does not authorize a write from it. It is only the display exception above. A person who stored a file and later lost write can still be shown write until a 403 pins the row. When that 403 arrives, pass `sessionDenied` true. Do not invent a cleverer reading to close that gap.
- Do not parse `@id` out of `directReader` or `directWriter`.
- Do not switch the comparison to `toLocaleLowerCase`. In a Turkish locale that folds `I` to a different letter, and this match would miss.
- Do not align this folding with `personRulingKey`. A refusal stored under that key keeps the path's case on purpose.

## Wrong readings

- "No grants means read-only." No grants means the vault write stands.
- "Grants for other people means I cannot write." It means the opposite. The owner is looking at a row shared with someone else.
- "JSON `@id` on the reader is read-only." It is not recognised as this session, so the owner path stays true.
- "An empty identity list is the safe read-only answer." It is the owner path. Pass the keys you have.
- "`entityWriteAllowed` already read the grants." It did not. It only knows the vault flag and the pin.

## Where it came from

GilbApp `recordWriteAllowed`, `entityWriteAllowed`, and `sessionIdentityKeys` in `src/lib/base/entityWriteAccess.ts`. The refusal set and the React hook stay in the app. The sentence is the app's sentence.
