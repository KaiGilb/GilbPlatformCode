# entity-write-access

Remembers, for this page, which entities refused a write, and tells a screen whether it may write one.

## What this is

Remembers, for this page, which entities refused a write, and tells a screen whether it may write one.

When a write comes back 403, the page pins that record id as read-only for the rest of the session. A screen asks whether it may write a record, and flips closed the moment a pin is added. This unit is that memory and the hooks over it. The decision itself ("may this session write this record, from the frame it holds") is the unit `record-write`; this unit hands it the memory's answer.

- `markEntityWriteDenied(recordId)` pins the id. An empty id is ignored. A pin already there is ignored (nothing is announced twice). A new pin tells every mounted screen.
- `isEntityWriteDenied(recordId)` is true when the id is pinned. `null`, `undefined` and `""` are never pinned.
- `clearEntityWriteDenials()` clears every pin and tells every screen. When nothing is pinned it does nothing and tells no one. It is a test helper.
- `entityWriteAllowed(vaultWriteAllowed, recordId)` is vault write and an id and not pinned. It does not read the record's grants. This is `record-write`'s `entityWriteAllowed` with this memory's pin as its third argument; it is called the same name, with two arguments here and three there.
- `useEntityCanWrite(vaultWriteAllowed, record, identityKeys?)` is the hook a screen calls. `record` is the frame (`{ id, facts? }`), or a bare id, or `null`. It re-renders by itself when a pin is added or cleared. For a frame it is `record-write`'s `recordWriteAllowed(vaultWriteAllowed, record, identityKeys, pinned)`, with the frame's own id looked up in this memory. For a bare id it is `entityWriteAllowed` above. For no record it is false.
- `useMarkEntityWriteDenied()` returns the same function on every render, for event handlers and effects.
- `ENTITY_READ_ONLY_REASON`, the sentence "You can read this item but not edit it." It is defined in `record-write` and re-exported here, so a screen can take both from one place. It is one value in one unit.

## What this is not

- Not the pure decision. `recordWriteAllowed`, `sessionIdentityKeys`, the grant and provenance key lists and the rules for a reader grant, a writer grant and "I stored it" are in `record-write`. This unit does not export them. Import them from there.
- Not a request. It never asks the server anything. A screen marks the id after it gets a refusal.
- Not saved. The pins live in the page's memory and are gone on reload.

## How to take it

Package: `@kaigilb/gilbplatformcode-entity-write-access`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/entity-write-access` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/record-write <path-to-the-library>/units/entity-write-access
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { sessionIdentityKeys } from "@kaigilb/gilbplatformcode-record-write";
import { markEntityWriteDenied, useEntityCanWrite } from "@kaigilb/gilbplatformcode-entity-write-access";

function Card({ record, vaultWriteAllowed, principal }: Props) {
  const canWrite = useEntityCanWrite(vaultWriteAllowed, record, sessionIdentityKeys(principal));
  async function save() {
    try {
      await writeIt(record.id);
    } catch (e) {
      if ((e as { status?: number }).status === 403) markEntityWriteDenied(record.id); // every screen on this record closes
    }
  }
  return canWrite ? <Editor onSave={save} /> : <ReadOnly />;
}
```

## What the host must supply

Nothing. It reads no setting, no origin and no session, and it sends no request. It needs React (the hooks) and `record-write` (the decision).

## What it writes

Nothing outside this page's memory. It never writes to a vault.

## Module state

`entityWriteAccess.ts` holds two pieces of module state: `denied`, a `Set` of the record ids this page was refused a write on, and `listeners`, a `Set` of the callbacks the mounted screens added to hear of a change. Both are singletons for the page. Two installed copies of this unit would each keep their own pins: a refusal marked through one would not close a screen that reads through the other. Install it once; it is a singleton peer of every unit or app that marks or reads a refusal. `clearEntityWriteDenials()` empties `denied` (for a test).

## Do not

- Do not install a second copy of this unit beside another one (see "Module state").
- Do not copy `ENTITY_READ_ONLY_REASON` into your app. Import it from here or from `record-write`.
- Do not pin a record because the vault says read-only. Pin only after the vault refused a write of that record: a pin beats a writer grant.
- Do not call `clearEntityWriteDenials` from product code.

## Wrong readings

- "`entityWriteAllowed` here and in `record-write` are the same function." Same decision, different argument lists: here the pin comes from the memory, there you pass it.
- "A pin on a record closes its vault." Only that id.
- "The hook polls." It listens: a screen is told once for each new pin and once for a clear that had something to clear.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script and then edited by hand where the named changes say:

- `src/lib/base/entityWriteAccess.ts` lines 83 to 110 (the imports, `denied`, `listeners`, `notify`, `isEntityWriteDenied`, `markEntityWriteDenied`, `clearEntityWriteDenials`), 112 to 113 (`ENTITY_READ_ONLY_REASON`), 266 to 276 (`entityWriteAllowed`) and 278 to 304 (`useEntityCanWrite`, `useMarkEntityWriteDenied`) to `src/entityWriteAccess.ts`.

Not taken: lines 1 to 82 (the module's header, which explains the grant and provenance rules) and 115 to 264 (`GRANT_READER_KEYS`, `GRANT_WRITER_KEYS`, `STORED_BY_KEYS`, `refValue`, `storedByIdentity`, `grantValues`, `identitySet`, `includesIdentity`, `sessionIdentityKeys`, `recordWriteAllowed`): that is the pure half, the unit `record-write`. I compared it with the source by comment-stripped declarations: the three key lists, `sessionIdentityKeys` and `ENTITY_READ_ONLY_REASON` are token-equal; `recordWriteAllowed` and `entityWriteAllowed` differ in the one parameter (`sessionDenied` where the source reads the module's `denied`) and in brace style; `refValue`, `storedByIdentity`, `grantValues`, `identitySet` and `includesIdentity` have the same size and are written differently (other local names, brace-less ifs, one pair of parentheses), so they are the same behaviour but not token-equal. `record-write` is not changed by this unit.

Named changes (also in `unit.json`):

- `ENTITY_READ_ONLY_REASON` (source line 113, a `const`) is `export { ENTITY_READ_ONLY_REASON } from` the unit `record-write`, which holds the same sentence (token-equal); there is one definition.
- `entityWriteAllowed` (source 270-276: `if (!vaultWriteAllowed || !recordId) return false; return !denied.has(recordId);`) returns `record-write`'s `entityWriteAllowed(vaultWriteAllowed, recordId, isEntityWriteDenied(recordId))`; the answer is the same for every input.
- `useEntityCanWrite` (source 281-297) calls `record-write`'s `recordWriteAllowed(vaultWriteAllowed, record, identityKeys, isEntityWriteDenied(record.id))` where the source called its own three-argument `recordWriteAllowed`, which read `denied.has(record.id)` itself.
- The imports, and a new header comment for the file; the doc comment of `entityWriteAllowed` names `useEntityCanWrite` where the source named `recordWriteAllowed`. No other code changed.

The comment-stripped declarations of `denied`, `listeners`, `notify`, `isEntityWriteDenied`, `markEntityWriteDenied`, `clearEntityWriteDenials` and `useMarkEntityWriteDenied` equal the source's (0 diff lines). `src/index.ts` is new.

## Tests

62 tests in 3 files (`npx vitest run`):

- `entityWriteAccess.test.tsx` 43: all 19 cases of the source that do not touch the network, ported (8 of `entityWriteAccess.test.ts`, 11 of `entityWriteAccess.uploaderSelfGrant.c186.test.ts`), and 24 new (the memory, `entityWriteAllowed`, the hook: a bare id, a frame, an empty id, a pin for another record, no identity keys, flips closed and open by itself, every screen, one notice per new pin, nothing announced for a clear of nothing or an empty id, after unmount; `useMarkEntityWriteDenied`; the reason). The source calls `recordWriteAllowed(vault, record, keys)` from its own module; here the same expectations run through `useEntityCanWrite(vault, record, keys)`, the entry this unit ships, which checks the wiring of the pin into `record-write`. The 403-wins case (7) is the one that covers the memory.
- `exports.test.ts` 6 (exactly the seven exports, none of the pure half, the reason is `record-write`'s string and is never assigned in this unit's source, the arities).
- `hostAgnostic.test.ts` 13.

Left out: `entityWriteAccess.spellings.test.ts` (1 case). It fetches the served ontology term for `fileStoredBy` over the network and checks `STORED_BY_KEYS` against it. `STORED_BY_KEYS` is in `record-write`, and that test needs a network this unit does not have; it belongs with `record-write`, which has no such drift check today. Of the 19 ported cases, 5 test this unit's memory (the first four of `entityWriteAccess.test.ts` and the 403-wins case 7) and 14 test the pure decision. Those 14 also have their equivalents in `record-write`'s own tests, which I checked by reading them (names shortened): the vault cannot write; this session was already refused; the frame names no reader and no writer; only a reader grant names this session; a writer grant names the principal or the short address; the grants name someone else; the reader is this session and the row says this session stored it; someone else stored the row; a stored-by value that starts with a brace and is not JSON; a stored-by JSON `@id` and the prefixed spellings (the short address included).
