# other-linked-records

Lists the other records the list on screen links to this record.

## What this is

Lists the other records the list on screen links to this record.

A person can have several records of the holder's linked to them. The Stakeholders list shows one row per person (the newest record's); the others are reached from that person's card, here. `OtherLinkedRecords` draws a card group titled "Your other cards of this person", with one row for each of the person's other records on the holder's screen: the record's title, and at its right a quiet line with the name of its vault and its last-changed date, so same-named cards can be told apart. A click on a row opens that record.

Nothing is read or fetched here. The records come from the holder's screen as the list last set it (`stakeholder-list-state`), and the group follows the list while the card is open. Nothing is drawn when there is no other record.

- `OtherLinkedRecords({ holder, principal, selfId, onOpen })`: `holder` the signed-in holder, `principal` the person the open record is linked to, `selfId` the open record's id (left out of the list), `onOpen(id)` opens a record.
- `OTHER_CARDS_TITLE`: the group's title.
- `OtherLinkedRecordsHost`, `OtherLinkedRecordsHostContext`, `useOtherLinkedRecordsHost()`, `OtherLinkedRecordsShell`: the one thing the app supplies (see "What the host must supply").
- The type `OtherLinkedRecordsProps`.

## What this is not

- Not the Stakeholders list, and not what fills the screen links: the list sets them (`setScreenLinks` of `stakeholder-list-state`). In an app with no list there are none, and this draws nothing. That is correct, and equal to the app on a deep link.
- Not a reader. It makes no request.
- Not the person's row: the row the list shows is the newest record; this lists the rest.

## How to take it

Package: `@kaigilb/gilbplatformcode-other-linked-records`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/other-linked-records` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/other-linked-records
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/other-linked-records/src";`. The page must define `--ink` (the title), `--ink-soft` (the quiet line at the right) and `--accent` (the focus outline). The group itself (`card-group`) has its own variables.

## Examples

```tsx
import { OtherLinkedRecords, OtherLinkedRecordsHostContext } from "@kaigilb/gilbplatformcode-other-linked-records";

const host = { useShell: () => ({ vaults: myVaults() }) }; // a hook of yours; only `vaults` is read

<OtherLinkedRecordsHostContext.Provider value={host}>
  <OtherLinkedRecords holder={sessionPrincipal} principal={personWebId} selfId={openRecord.id} onOpen={(id) => open(id)} />
</OtherLinkedRecordsHostContext.Provider>;
```

## What the host must supply

- `OtherLinkedRecordsHostContext.Provider` above the list, with `useShell()`: a HOOK that answers `{ vaults }`, the vaults the holder reaches (each `{ vaultId, name? }`). It is read to name each record's vault; `vaults` may be missing or null (no vault is then named). Without the provider the list throws an error that names it.
- Something that calls `setScreenLinks(holder, owners, groups)` from `stakeholder-list-state` whenever the list's loaded records change. Without it the list is empty and nothing is drawn.

## Module state

None of its own. `stakeholder-list-state` holds the screens (the data this reads) and the listeners; an app must have ONE copy of it, and of `card-group`.

## Do not

- Do not call `useShell` of the host conditionally: it is a hook, and the list calls it on every render.
- Do not export or reuse the unit's copy of `FOCUS` or of `formatShortDate`; they are named copies for this unit only (see "Where it came from").
- Do not pass the open record's own id as `principal` or `holder`: `holder` is the signed-in principal, `principal` the person.

## Wrong readings

- "It lists every record linked to the person." Only those on the holder's screen now (the loaded list), less the open one. A record the list has not loaded is not here.
- "It fetches the vault names." It names a record's vault from the shell's vault list only; a vault that is not in it shows no name, only the date.
- "An empty list is an empty group." Nothing is drawn at all, not even the title.
- "It follows the list only when the card is reopened." It follows the list while the card is open (a subscription to `stakeholder-list-state`).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, symbol by symbol:

- `src/components/records/OtherLinkedRecords.tsx` to `src/OtherLinkedRecords.tsx`: lines 17-54 (`OtherLinkedRecordsProps`, `OTHER_CARDS_TITLE`, `OtherLinkedRecords`). Lines 1-16 (header comment and imports) are replaced.
- `src/lib/format.ts` to `src/formatShortDate.ts`: lines 29-37 (`formatShortDate`), a **named copy**. The function is pure and in no unit; this unit is the only one that needs it. Its header names the source file and commit. It is not exported from the package.
- `src/components/records/orgCard/OrgHierarchySections.tsx` line 28 to `src/OtherLinkedRecords.tsx`: `FOCUS` (the focus ring class string), a **named copy**, not exported. A person card should not depend on the organization card's unit for one class string.

Named changes, and only these:

1. the imports are the units': `onScreenLinks`, `screenLinkedRecordsOf`, `screenLinksRevision` from `stakeholder-list-state`; `vaultLabel` from `vault-list`; `CardGroup` from `card-group`;
2. `const { vaults } = useShell();` is `const { vaults } = useOtherLinkedRecordsHost().useShell();`: the app shell is a member of the unit's host (a new file, `src/otherLinkedRecordsHost.ts`), a hook the app supplies, as in `online-stakeholder-card`;
3. `formatShortDate` and `FOCUS` are the two named copies above;
4. the header comment is shorter and drops the cycle, ruling, agent and ticket references; no code changed.

With comments and imports removed, `OtherLinkedRecords.tsx` differs from the source in the two lines of named changes 2 and 3 (the added `const FOCUS`, and the `useShell` line) and in no other. `formatShortDate` and `FOCUS` are token-equal to the source (0 diff lines). The body of `vaultLabel` of `vault-list` is token-equal to the app's; its parameter is typed structurally (`{ name?, vaultId }`), where the app's is its own vault type.

`src/index.ts` and `src/otherLinkedRecordsHost.ts` are new. Tests: `OtherLinkedRecords.m3f.test.tsx` is the source's file, 4 of 4 tests (the app's `vi.mock` of the shell is the host of this unit, a fake; the import paths are the units'; the example hosts are `example.test` hosts). New: `pins.test.tsx` (26: the host, what is listed, the meta line, the group's registration with the card mode, the row, the two named copies, the export list). `hostAgnostic.test.ts` (13) is the same host-agnostic check test as the other units. 43 tests in all.
