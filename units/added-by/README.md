# added-by

Shows who added a record and lets the holder switch a note between private and shared.

## What this is

Shows who added a record and lets the holder switch a note between private and shared.

A held detail on a person's card (a note, an interest, a language, an organization number) may have been added by someone other than the viewer. Whoever may see it sees THAT person's name on it, and nothing else of their card, with a link to the card. The viewer's own details read "Added by you". The holder can also set a detail they added to be shared with everyone who may read the vault (the default) or private to them.

- `AddedByLine({ item, own, hasSource? })`: the small muted line `data-testid="added-by"` under a detail. `item` is the detail's own address (empty: nothing is drawn); `own` says the viewer's own card is the claim's one `a:statedBy` ("Added by you", no link, no request); `hasSource` false says the claim names no source at all (nothing to ask). Another person's: "Added by <name>", the name a link (`added-by-link`) at the card address the platform returned (`statedBy`, never built from the name). A click opens that card at ITS OWN vault (`openRecordInVault(vault, id, { push: true })`, else `openRecordFromList(id)`) and remembers its door and name for the session (`rememberAddedByCard`, `record-detail-reads`), so a card the viewer may not read can open as the name alone. A click with a modifier key or a non-primary button is left to the browser. Not disclosed, a refusal, an older platform, a timeout: NOTHING (no "unknown", no error text).
- `useAddedBy(items)`: the hook for the sections. One react-query entry per item address (`addedByKey(item)` = `["mynet","added-by",item]`, 60 s fresh). Entries asked for in one breath, by any number of sections, go out as ONE batch after a 20 ms collecting window, never one request per row. The viewer's own details are never asked about.
- `fetchSourceNames(items)`: the pure client of `GET /base/source-name?items=<addr>,<addr>,…`: dedupes, groups by the host that serves the item, chunks at 50 (`SOURCE_NAME_MAX_ITEMS`), URL-encodes. Never throws: a failure is null for every address of the chunk.
- `HeldVisibilitySwitch({ isPrivate, editing, busy?, onSet, noun })`: shared: while editing, "Make private to me only"; private: a small "Only you see this" label (always, in presentation too) and, while editing, "Everyone in this vault". The caller draws it only on the viewer's own claim.
- `AddedByHostContext`, `useAddedByHost()`, `AddedByHost`, `AddedByShell`: the one thing the app supplies (see "What the host must supply").
- `__resetAddedByForTest()`: test seam, never called by product code.

## What this is not

- Not a writer of anything. The switch only calls `onSet`; the caller writes the change.
- Not the name-only card: what the card then shows is decided by the platform's grants and by the app's record screen.
- Not a way to learn why a name is not shown: the route answers null/null for "not disclosed" for any reason, and the unit does not try to tell them apart.
- Not for the single form `?item=`: it answers 404 on any refusal and is never used.

## How to take it

Package: `@kaigilb/gilbplatformcode-added-by`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/added-by` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/added-by
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/added-by/src";`. The page must define `--ink-soft` (the line, the "Only you see this" label and the switch) and `--accent` (the focus outline).

## Requests and their servers

Reads only. `GET /base/source-name?items=<addr>,<addr>,…` (1 to 50 absolute item addresses), asked at `vaultOriginOf(item)`: the node that serves the item, one call per host and per 50 items. It carries a plain Bearer (`bearerHeaderFor`, `lws-session-bridge`) and a 10-second abort. Always 200 `{ items: { [address]: { statedBy, name } } }` on a platform that has the route; a 404 on the route (an older platform), any other refusal, a network error or a timeout gives null for every address of the call: nothing is shown, nothing is retried, and it is said once per page at debug level, never to the person.

## Examples

```tsx
import { AddedByHostContext, AddedByLine, HeldVisibilitySwitch } from "@kaigilb/gilbplatformcode-added-by";

const host = { useShell: () => useMyShell() }; // a hook of yours; only openRecordFromList and openRecordInVault are read

<AddedByHostContext.Provider value={host}>
  <AddedByLine item={claimAddress} own={claim.statedBy === myCard} />
  {own ? <HeldVisibilitySwitch isPrivate={priv} editing={editing} busy={saving} onSet={setPrivate} noun="interest Sailing" /> : null}
</AddedByHostContext.Provider>;
```

## What the host must supply

- `AddedByHostContext.Provider` above the line, with `useShell()`: a HOOK that answers the app shell or null: `{ openRecordFromList(id), openRecordInVault?(vault, id, { push? }) }`. Without the provider the line throws an error that names it. With a null shell a click opens nothing.
- One `QueryClientProvider` above (the unit makes no client).
- `setBaseOrigin(...)` (and `setSystemVaultHosts([...])`) from `base-origin` and the auth seam `setLwsAuth(...)` from `lws-session-bridge`, once at start-up.
- Tailwind scanning this unit's `src` and the two CSS variables above.

## Module state

Three, in `addedBy.ts`: `pending` (a Map from item address to the waiters of the batch being collected), `timer` (the collecting window's timeout) and `saidOnce` (the debug line was said). Per page session, per module copy; reset only by `__resetAddedByForTest()`. An app must have ONE copy of this unit, or two sections would send two batches. The query client holds the names (`addedByKey`).

## Do not

- Do not call `useShell` of the host conditionally: it is a hook and the line calls it on every render.
- Do not build the card's address from the name: the link is `statedBy`, what the platform returned.
- Do not show anything for a name that is not disclosed, and do not tell the person why.
- Do not ask about the viewer's own details; they read "Added by you" with no request.
- Do not use the single form `?item=`.
- Do not draw `HeldVisibilitySwitch` on a detail another person (or an old vault card) added.

## Wrong readings

- "Each line makes a request." The names of all the details on a card are asked in one batch (50 to a call, one call per host).
- "A null name means the person is unknown." It means not disclosed, for any reason.
- "The switch changes the note." It calls `onSet(true|false)`; writing is the caller's.
- "The 'Only you see this' label needs edit mode." It shows in presentation too.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, whole files:

- `src/lib/base/addedBy.ts` (174 lines) to `src/addedBy.ts`.
- `src/components/records/AddedByLine.tsx` (75) to `src/AddedByLine.tsx`.
- `src/components/records/HeldVisibilitySwitch.tsx` (50) to `src/HeldVisibilitySwitch.tsx`.

Named changes, and only these:

1. The imports are imports of units: `bearerHeaderFor` from `lws-session-bridge`; `vaultOriginOf` from `vault-origin-rule`; `rememberAddedByCard` from `record-detail-reads`; `entityRefFromFact` from `entity-ref`; `vaultNamespaceOfEntityUri` from `plan-stakeholder-lines` 0.2.1 (exported there for this); the files import one another by their new names.
2. `const shell = useContext(ShellContext);` is `const shell = useAddedByHost().useShell();`: the app shell is a member of the unit's host (a new file, `src/addedByHost.ts`), a hook the app supplies, as in `other-linked-records`. It stays the line's third hook, after `useAddedBy`, as in the source. `useContext` is no longer imported.
3. The header comments of the three files are reworded (no cycle, ticket, ruling, date or wiki-rule names); no code changed.

With comments and imports removed, `addedBy.ts` (607 words) and `HeldVisibilitySwitch.tsx` (107) are token-equal to the source; `AddedByLine.tsx` (138) differs in exactly the one line of named change 2. `src/index.ts` and `src/addedByHost.ts` are new. Peers compared with the source: `vaultNamespaceOfEntityUri` of `plan-stakeholder-lines` 0 diff; `bearerHeaderFor` of `lws-session-bridge` takes an optional method and asks the host (the seam; the same header); `entityRefFromFact` of `entity-ref` 9 token lines (guards for an undefined regex group; same answers). `plan-source` still holds its own private, token-equal copy of `vaultNamespaceOfEntityUri`: a later dedupe.

## Tests

54 tests in 6 files (`npx vitest run`):

- `addedBy.sb1b2.test.tsx` 9: PORTED from `addedBy.sb1b2.test.tsx`: 8 as they are (the client: dedupe, encoding, one call, 60 addresses as 50 + 10, a 404 / half entry / network failure give null, said once; the hook: 60 items as two requests, a viewer's own details as no request, one ask for the same address and none inside the staleness window, the link is `statedBy`), re-based on the real `lws-session-bridge`, `vault-origin-rule` and `base-origin` over the source's own test kit (`test/addedByTestkit.ts`) instead of the source's `vi.mock` of six app modules. The 9th (a whole card view of three sections, seven details of two adders, ONE request of seven addresses) mounted the app's `InterestRows`, `SkillRows` and `OrgNumberSection`, which are in no unit; it is ADAPTED to three sections of `AddedByLine` with the same claim and the same assertions.
- `AddedByLine.test.tsx` 16 (new): what is drawn, and the click: the adder's card is opened at its own vault with `{ push: true }`, the door and name are remembered, the list fallback, a non-entity address, modifier clicks, no shell, no provider; no request for an empty item or a sourceless claim. These stand in for the five cases of `AddedByLine.nameOnlyCard.sb1c.test.tsx`, which mount the app's whole record screen and its name-only card (not in the unit); at the unit's edge: the card is read at ITS OWN host (the address `statedBy` carries) is pinned here as the vault the shell is told to open, and the name-only card itself is owed to the composition.
- `HeldVisibilitySwitch.test.tsx` 6 (new): shared and private, editing and not, the two labels and accessible names, `onSet`, busy.
- `requests.test.ts` 8 (new): one call per host with a Bearer for that URL, `?items=` and never `?item=`, 50 and 51, blank names / cards / bodies, blank addresses, the 10-second abort.
- `exports.test.ts` 2, `hostAgnostic.test.ts` 13 (the same host-agnostic check test as the other units; it writes to the OS temp directory).

No `vi.mock`. The "no request" tests use fake timers; the others wait on query state.

Mutation checks: 27 mutants of the three files, 7 on the batching and bounds (50, host grouping, dedupe, encoding, the 20 ms window's effect, the single form), 5 on who is asked about, 6 on the click and the remembered card, 4 on the switch, 5 others (credential, timeout, trim, null on failure, said once). 24 killed on the first run; 3 survived, all real gaps (a sourceless claim asked about, an empty own item drawn, and one mutant that did not apply because its text matched twice, redone): killed by tests added or by the corrected mutant. Final 27 of 27.
