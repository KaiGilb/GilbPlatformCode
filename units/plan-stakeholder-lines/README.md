# plan-stakeholder-lines

Draws the Stakeholder line and the Authority line of a Plan card, and on a Development Resource the Resource Owner line: linked people and organizations as chips with their role marks, names that are not records yet as text, the picker to link a record, creating a new stakeholder, removing, and an Authority's "acts for", with every read and write supplied by the host.

## What this is

Draws the Stakeholder line and the Authority line of a Plan card, and on a Development Resource the Resource Owner line: linked people and organizations as chips with their role marks, names that are not records yet as text, the picker to link a record, creating a new stakeholder, removing, and an Authority's "acts for", with every read and write supplied by the host.

Two components in one unit. It is three lines: the Stakeholder line, the Authority line, and the Resource Owner line (the Authority line again, with `resourceOwner`).

- Which card shows which, as the source's `planLinesFor` lists them: the Function card, the Solution card and the Value card show a Stakeholder line and an Authority line. The two constraint cards (a Function Constraint, a Design Constraint) show an Authority line (person only, required) and a Stakeholder line. The Development Resource card shows all three: Resource Owner, Stakeholder and Authority (its lines are the Value lines without "Value of Function", with Resource Owner before Stakeholder).
- `PlanStakeholders({ record, vaultId, planVault?, editing, offer?, onOpen, onNotice, onPicked? })`: the Stakeholder line, `data-testid="plan-stakeholders"`. `planVault` is the record's own vault, where the relations are written; it defaults to `vaultId`.
  - Shows, in this order: the plain stakeholders (relation `t:StakeholderOf`), each as the name chip of `entity-ref-value` plus the person's `@handle`, which is the record's main tag as the host's `useMainTag` answers it (nothing while the answer is pending, when the tag is unknown, or when the record has none; the record's `tagString` fact is not read), with a remove control (named `Remove <name>`) while editing; then the Authorities (`t:AuthorityOf`), each with the mark "Authority"; then, only on a `t:Resource` record whose type is not the app's "unknown type" marker, the Resource Owners (`t:ResourceOwnerOf`), each with the mark "Resource Owner"; then the older record-level Authority holder with the mark "Authority", unless a relation already names that person; then each name that is not a record yet (the `a:stakeholders` text) as text, with `Remove <name>` and `Link` buttons while editing. An Authority is shown on both lines.
  - Nothing is drawn when there is nothing; "Could not read stakeholders." only when the relation read failed and there is nothing to show.
  - The picker (`Search`, "Search stakeholders") and "+ New stakeholder" are shown while editing, or when `offer` is true; `offer` false hides them in Edit. A search asks the host for records of the master's stakeholder kinds in the held vaults; the person already linked as a plain stakeholder is not offered. A search that was not whole says so, with Try again, which drops this text's cached search.
  - Picking a record writes ONE `t:StakeholderOf` relation (`roles: { source: "role:referenced-by", target: "role:stakeholder" }`, `extraFacts: { "a:relationType": "stakeholder" }`, in the record's vault), then adds it to the relations. The same record picked twice before the first write answers writes once (a guard by address). A person who is already an Authority (as a relation or as the older holder) is refused with "Already an Authority here."; on a card that shows Resource Owners, a person who already is one is refused with "Already a Resource Owner here."; a person already linked as a plain stakeholder is skipped without a word. Either way `onNotice(null)` and `onPicked` run after it: the refusal stays on screen as the line's own alert.
  - `Link` on a text name opens the box with that name. When that name's record is linked, the name is removed from `a:stakeholders` (with the version check). If removing it fails, the new relation is ended, dropped from the relations, and the failure is shown and passed to `onNotice`.
  - Removing a link ends the relation and drops it from the relations.
  - "+ New stakeholder" opens the host's dialog; the record it makes is linked (an id is read in the record's vault first; an address is used as it is).
- `PlanAuthority({ record, vaultId, planVault?, editing, offer?, personOnly?, resourceOwner?, onOpen, onNotice, onPicked? })`: the Authority line, `data-testid="plan-authority"`, or with `resourceOwner` the Resource Owner line, `data-testid="plan-resource-owner"`.
  - Each Authority is a chip (`data-authority-for=<address>`) with a remove control while editing, and an "acts for" row: the record it acts for (read from the relation document, not from the relation row), with a remove control while editing, and, while the picker is shown, a search `Acts for <name>` over records of any kind. Choosing one ends the relation and writes it again with the acts-for; removing it writes it again with `actsFor: null`.
  - The older record-level holder (`authorityHolder`, `authorityActsFor`) is a chip too, unless a relation names that person; its acts-for is changed by writing a relation and clearing both record keys, removed by clearing the record's `authorityActsFor`, and the holder is removed by clearing both keys. The older Authority text (`a:authority`) is shown as an editable row "Authority text" (read-only unless the picker is shown) with `Remove <text>` and `Link` while editing; `Link` opens the box with the text, and linking a person clears the text once. If clearing fails the relation stays and the failure is shown. Neither the older holder nor the text is shown on a Resource Owner line.
  - The picker is labelled with the word of the line ("Authority" or "Resource Owner"). Picking a person writes ONE Authority relation (`t:AuthorityOf`, or `t:ResourceOwnerOf` with `resourceOwner`; the host's writer is given `relationType` only for a Resource Owner). If the same person is a plain stakeholder, that link is ended first and the Authority written, so the two never both hold. The same person picked twice quickly writes once. A person who already holds the line writes nothing.
  - `personOnly` (a constraint): every stakeholder is listed, and a hit that is not a person (its type is not Person or a kind under Person in the master's set) carries the note "not a person"; picking one is refused with the constraint sentence and writes nothing; removing the last person Authority is refused. The judgement of a pick uses the kinds the host holds at click time, falling back to the ones drawn.
- `StakeholderLinesHostContext`: the context through which the host gives both components everything they read and write. With no provider the components throw an error naming it.
- The types `StakeholderLinesHost` (the host's shape, member by member), `StakeholderFind`, `PairRelationWrite`, `OpenRecordInVault`, `RelationsRead`, `CreateStakeholderProps`, `WriteSource` and `MergePatchValue`.

## Changes in 0.2.0

- The `@handle` beside a stakeholder chip is now the record's MAIN tag, read through the new host member `host.useMainTag(uri)`; the record's `tagString` fact (flat or served) is no longer a fallback, as in the app. While the answer is pending, when `known` is false, or when the record has no tag, no `@handle` is drawn.
- BREAKING for hosts: one new REQUIRED member, `useMainTag` (a hook; see "What the host must supply"). A host written for 0.1.0 does not type-check until it adds it.
- `useRecordRead` is now read only for `data.facts` (`served` is no longer read).
- Peers: `plan-stakeholders-model` ^0.2.0 (it no longer exports `handleFromFacts`), `entity-ref-value` ^0.2.0.
- Re-synced from KaiGilb/GilbApp @ `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`. The private `entityDisplayName` gains the `mainTag` option (not used by this unit's own calls).

## What this is not

- Not the Plan card or its group frame: the "Stakeholder", "Authority" and "Resource Owner" titles, the "+" add button, the source control under a line (`PlanSource`), the Edit button and the card mode are the form's.
- Not a reader or writer of records. It never fetches and never writes; the host does, through the members below. A host without the writers gets a read-only line.
- Not the rules of who is a stakeholder: `plan-stakeholders-model` reads the relations and the text and holds the constraint rules.
- Not a search: the host's `findStakeholders` and `findAnyRecords` answer the picker.
- Not `entity-ref-value` or `record-picker`: it uses them, so their hosts' contexts (the record name hook, the picker's query hook) are needed too.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-stakeholder-lines`

Take it together with its peers `plan-stakeholders-model`, `plan-card-facts`, `plan-kinds`, `record-picker`, `field-row`, `remove-control`, `entity-ref-value`, `entity-ref`, `relation-role` and `base-record`, and their own peers (`type-curie` and `type-key` for `plan-stakeholders-model`, `type-key` for `plan-kinds`, `card-mode` and `open-popups` for `field-row`, `id-tail` for `entity-ref-value`). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/id-tail <path-to-the-library>/units/open-popups <path-to-the-library>/units/card-mode <path-to-the-library>/units/entity-ref <path-to-the-library>/units/relation-role <path-to-the-library>/units/base-record <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/record-picker <path-to-the-library>/units/field-row <path-to-the-library>/units/remove-control <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/plan-stakeholder-lines
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { PlanStakeholders, PlanAuthority, StakeholderLinesHostContext } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import type { StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";

// Once, above the card. Every member below is yours; "What the host must supply" says what each does.
const host: StakeholderLinesHost = {
  useRecords, useRecordRead, useMainTag, useRelations, useStakeholderKinds, usePersonAuthorities, useHeldVaults, useOpenRecordInVault, useRelationDoc,
  hasSubstitutedType, getRelations, getKindSet, liveRow, readRecord, memberEntityUri, findStakeholders, findAnyRecords,
  ensureEtagUnchanged, applyPatch, storePlanRow, setRecordRead, setRelations, invalidateSearch,
  // Writers: leave all of a line's writers out and that line is read-only.
  writePairRelation, endRelation, patchRecord, writeAuthorityRelation, endThenWriteAuthority, renderCreateStakeholder,
};

<StakeholderLinesHostContext.Provider value={host}>
  <RefLabelContext.Provider value={useRefLabel}>
    <PickerQueryContext.Provider value={usePickerQuery}>
      {/* The Stakeholder line, the Authority line and, on a Development Resource, the Resource Owner line. */}
      <PlanStakeholders record={record} vaultId={vaultId} planVault={planVault} editing={editing} onOpen={openRecord} onNotice={setNotice} />
      <PlanAuthority record={record} vaultId={vaultId} planVault={planVault} editing={editing} personOnly={isConstraint} onOpen={openRecord} onNotice={setNotice} />
      <PlanAuthority record={record} vaultId={vaultId} planVault={planVault} editing={editing} resourceOwner onOpen={openRecord} onNotice={setNotice} />
    </PickerQueryContext.Provider>
  </RefLabelContext.Provider>
</StakeholderLinesHostContext.Provider>;
```

The picker's query key, as the lines pass it to `record-picker`, is `["stakeholder-search", role, vaultsKey, text]`, with `role` one of `line`, `authority`, `owner`, `acts` and `vaultsKey` the held vault ids joined by `|`. Your picker query hook caches under it, and your `invalidateSearch` drops by it (the lines pass `{ queryKey: ["stakeholder-search", "line"], refetchType: "active" }` after a stakeholder is created from the Stakeholder line, and `["stakeholder-search", "authority"]` from an Authority or Resource Owner line).

## What the host must supply

Contexts of the peers, above the lines: the `RefLabelContext` provider of `entity-ref-value` (the name on each chip); the `PickerQueryContext` provider of `record-picker` (the search). Without them the components throw errors naming them. A `CardModeProvider` of `card-mode` is read by the older Authority text row (`field-row`) only; without one it is always editable when not read-only.

The `StakeholderLinesHostContext` provider with an object of these members. File and line are those of GilbApp, commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, `src/components/records/PlanStakeholders.tsx` unless another file is named.

Reads (hooks; called on every render, in the order the source called them, never conditionally):

- `useRecords(vaultId)`: the records already loaded for a vault (`data`). Replaces `useRecords(vaultId)` (:128).
- `useRecordRead(ref, uri)`: the cached read of one record that the name hook fills; never fetches. Replaces the `useQuery` with `enabled: false` and key `["base", "record", id, origin]` (:134-139).
- `useMainTag(entityUri)`: `{ data?: { known, tag } }`, the record's MAIN tag; a hook, called on every render for every chip (`PlanStakeholders` and `PlanAuthority` alike), after `useRecordRead`, not gated: one request per chip. Replaces `useMainTag(uri)` (:144; `recordTags.ts`); the app's options are `staleTime: 60_000, retry: false, refetchOnWindowFocus: false` (query key `["main-tag", entityUri]`). Only `known` and `tag` are read. REQUIRED: it is a read, not a writer, so a host without it fails to type-check and the components throw when it is called.
- `useRelations(recordId, recordUri)`: `{ data, isError }`. Replaces `useRelations(record.id, record.entityUri ?? null)` (:229, :626).
- `useStakeholderKinds(enabled)`: `{ data }` of the master's stakeholder kinds. Replaces `useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled: showPicker })` (:230, :628).
- `usePersonAuthorities(record, vaultId)`: `{ people }`. Replaces `usePersonAuthorities(record, vaultId)` (:627; `useConstraintPeople.ts:74`).
- `useHeldVaults()`: the held vault ids, with a stable identity while they do not change. Replaces `useHeldVaults()` (:174-177: `useShell` and `heldVaultIds`).
- `useOpenRecordInVault()`: how to open a record in another vault, or `undefined`. Replaces `useShell().openRecordInVault` (:110, :116-122).
- `useRelationDoc(relation, planVault)`: `{ data }`, the relation document read for "acts for"; `relation` is null for the older holder. Replaces the `useQuery` with key `["plan", "authority-relation", relation ?? ""]`, 15 000 ms, no retry (:537-543).
- `hasSubstitutedType(record)`: whether the record carries the app's "unknown type" marker as its type. Replaces `hasSubstitutedType(record)` (:244; `records.ts:357`).

Click-time getters (called when the person acts, never kept from a render):

- `getRelations(recordId, recordUri)`: the relations the app holds now. Replaces `qc.getQueryData(relationsKey(id, uri))` (:270, :298, :674).
- `getKindSet()`: the kinds the app holds now. Replaces `qc.getQueryData(STAKEHOLDER_TYPE_SET_QUERY_KEY)` (:669).
- `liveRow(planVault, id, fallback)`: the newest copy of the record. Replaces `liveRow(qc, planVault, id, fallback)` (:253, :271, :284, :686, :719, :750, :763; `planRowCache.ts:101`).
- `readRecord(id, at)`: reads a record. Replaces `readRecord(id, at)` (:482, :928, :931).
- `memberEntityUri(idOrUri, preferredUri, vaultNamespace)`: the address of a record. Replaces `memberEntityUri(...)` (:269, :324, :483, :707, :929; `relationWrite.ts:99`).
- `findStakeholders(vaults, names, text)`: records of the stakeholder kinds whose name matches, as `{ hits, complete, vaultsMissed }`. Replaces `findStakeholderRecords(...)` (:443, :650; `planStakeholders.ts:322`).
- `findAnyRecords(vaults, text)`: records of any kind. Replaces `findAnyRecords(vaults, text)` (:661; `planStakeholders.ts:378`).
- `ensureEtagUnchanged(planVault, row, sameFor)`: reads a missing ETag; `{ conflict }` when the fresh copy differs in a field the write touches, `{ unreadable }` when it still has none. Replaces `ensureEtagUnchanged(qc, planVault, row, sameFor)` (:88; `planRowCache.ts:148`).
- `applyPatch(row, patch, etag, opts)`: the row with the patch applied. Replaces `applyPatch(...)` (:104; `planRowCache.ts:30`).
- `storePlanRow(planVault, row)`: puts a saved row in the app's lists. Replaces `storePlanRow(qc, planVault, row)` (:105; `planRowCache.ts:117`).
- `setRecordRead(id, at, record)`: puts a saved row in the app's record read. Replaces `qc.setQueryData(planRecordKey(id, at), row)` (:106).
- `setRelations(recordId, recordUri, next)`: replaces the relations the app holds, with a list or a function of the old one. Replaces `qc.setQueryData(relationsKey(id, uri), next)` (:306, :313, :347, :679, :807).
- `invalidateSearch({ queryKey, refetchType? })`: drops cached searches. Replaces `qc.invalidateQueries({ queryKey, refetchType })` (:198, :478, :923).

Writers (optional; a line whose writers are not all given is read-only, see "Wrong readings"):

- `writePairRelation(input)`: writes one relation, returns `{ id, uri? }`. Replaces `writePairRelation(...)` (:286; `relationWrite.ts:217`).
- `endRelation(relation, vaultNamespace)`. Replaces `endRelation(...)` (:312, :346, :806; `relationWrite.ts:491`).
- `patchRecord(id, patch, at, source, precondition)`: returns `{ etag }`; `source` is `undefined` for a record with no served keys. Replaces `patchRecord(...)` (:102-103; `records.ts:963`).
- `writeAuthorityRelation(input)`: writes one Authority (or Resource Owner) relation, returns the relation row. Replaces `writeAuthorityRelation(input)` (:741, :770; `planStakeholders.ts:236`).
- `endThenWriteAuthority(endId, input)`: ends one relation, then writes an Authority. Replaces `endThenWriteAuthority(endId, input)` (:741, :751; `planStakeholders.ts:266`).
- `renderCreateStakeholder(props)`: the dialog that creates a stakeholder record; called as a function in render while the dialog is open (if yours uses hooks, return an element of a component of your own). Replaces `<ConnectedCreateDialog open stakeholders source={null} drawnVaultIds onClose onCreated />` (:470-488, :915-941).

Also:

- Tailwind scanning this unit's `src`, so its classes are generated (`text-[11px]`, `text-[13px]`, `text-[14px]`, `min-h-11`, `uppercase`, `tracking-wide`, …).
- These CSS variables: `--bad`, `--accent`, `--ink`, `--ink-faint`, `--ink-ghost` (and those of `record-picker`, `field-row`, `remove-control` and `entity-ref-value`).
- React 19, and the peers installed beside this one.

## Do not

- Do not install a second copy of this unit or of `entity-ref-value`, `record-picker` or `card-mode`: a second copy has its own context.
- Do not return a new array from `useHeldVaults` on every render: the search callbacks depend on it.
- Do not snapshot `getRelations`, `getKindSet` or `liveRow` at render: the lines call them when the person acts, to judge against what the app holds then.
- Do not make `setRelations` a stand-in for the write: the lines call the writer first and `setRelations` after, so the line shows what was written.

## Wrong readings

- "A read-only host gets a disabled Edit." A line is read-only only when a writer is missing: `PlanStakeholders` needs `writePairRelation`, `endRelation`, `patchRecord` and `renderCreateStakeholder`; `PlanAuthority` needs `endRelation`, `writeAuthorityRelation`, `endThenWriteAuthority`, `patchRecord` and `renderCreateStakeholder`. With one missing, the line behaves as with `editing` false and no `offer`: chips and names, no picker, no remove, no Link, no "+ New stakeholder". The cache members (`ensureEtagUnchanged`, `applyPatch`, `storePlanRow`, `setRecordRead`, `setRelations`, `invalidateSearch`, `readRecord`, `memberEntityUri`) are not writers and are always required; a host with no writers may give no-ops.
- "The Development Resource card has Stakeholder and Resource Owner." It has three lines: Resource Owner, Stakeholder and Authority (`RESOURCE_LINES` of `planKinds.ts`).
- "A Resource Owner line writes `t:AuthorityOf`." It writes `t:ResourceOwnerOf`; `relationType` is given to the host's writer only then, and an Authority line gives none.
- "A refusal ends the pick." On the Stakeholder line "Already an Authority here." is set, and then `onNotice(null)` and `onPicked` still run (the line's alert stays, the card's notice is cleared). On the Authority line a person who already holds the line is skipped without any sentence.
- "Linking a text name always removes it." Only the name that `Link` opened the box with, once, and only when the pick was written; a pick made with no `Link` before it removes no name. If the removal fails the new relation is ended and the failure is shown; on the Authority line the relation is kept.
- "The Stakeholder line shows every Resource Owner relation." Only on a `t:Resource` record that is not a substituted type; the refusal "Already a Resource Owner here." needs the same (on another card a person who is a Resource Owner can be linked as a stakeholder).
- "The Resource Owner line dedupes against the older holder." It does not read the older holder or text at all.
- "The search key of a Resource Owner line is `owner` everywhere." The picker's key is `owner`, but the cached searches dropped after a stakeholder is created are `["stakeholder-search", "authority"]`.
- "`personOnly` is checked when the hits arrive." It marks hits when they arrive (with the kinds drawn), and judges the pick when it is made (with the kinds the app holds then).
- "The search is made without kinds." It waits: with no kind names the picker does not search.
- "The `@handle` costs one request per line." It costs one request per chip: `useMainTag` is called for every chip of both components, ungated, with that chip's own address (key `["main-tag", address]`), not one batch per line; and the Authority line asks too, although it draws no handle. The handle appears only after the host answers.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`:

- `src/components/records/PlanStakeholders.tsx` lines 1-945 (the whole file) to `src/PlanStakeholders.tsx`; the exports are the source's (`PlanStakeholders`, `PlanAuthority`). The code is copied by script and then changed only as listed. Named changes:
  1. Imports (lines 5-59): `OrgRecordPicker`, `PickerFind`, `PickerIncomplete` from `record-picker`; `FieldRow` from `field-row`; `RemoveControl` from `remove-control`; `EntityRefValue` from `entity-ref-value`; `entityRefFromFact` from `entity-ref`; `alreadyLinked`, `authoritiesOf`, `actsForOnRelation`, `RESOURCE_OWNER_RELATION_TYPE`, `resourceOwnersOf`, `legacyAuthorityOf`, `sameRecord`, `stakeholdersOf`, `STAKEHOLDER_RELATION_FACT`, `STAKEHOLDER_RELATION_TYPE`, `STAKEHOLDER_ROLES`, `stakeholderTagTexts`, `stakeholdersWithoutTag`, `LinkedStakeholder`, `CONSTRAINT_AUTHORITY_WHY`, `CONSTRAINT_LAST_PERSON`, `NOT_A_PERSON`, `isPersonStakeholderType`, `removingLastPersonAuthority` from `plan-stakeholders-model`; `isResourceType` from `plan-kinds`; `rowServedFact`, `sameServedList` from `plan-card-facts`; `RecordRelation` from `relation-role`; `BaseRecord`, `GridRecord` from `base-record`. Each was compared with the source's own, comments stripped: `planStakeholders.ts` (minus the writers and finders, which are host members), `planConstraint.ts`, `planKinds.ts`, `rowServedFact`, `sameServedList` are the same; `entityRefFromFact` is the same but for guards against an undefined array element.
  2. `@tanstack/react-query` is gone: each `useQuery` and `qc.*` call is a host member (see above), and `useQueryClient()` is not called (the query client stays in the host). `useShell()` is gone the same way. `hasSubstitutedType` (`records.ts:357`) and `memberEntityUri` (`relationWrite.ts:99`) are host members too, not copies: the first compares with the app's type namespace and the second falls back to the app's base origin, both from its configuration.
  3. Each host call is made with the same arguments, in the same place and order as the source's call. `useHeldVaults` (lines 174-177) is `host.useHeldVaults()`; `useOpenInItsVault` takes `host.useOpenRecordInVault()` where it read `useShell()`; the line `const key = relationsKey(...)` in `remember` is gone (the host forms the key from `setRelations`' arguments); `stakeholderIncomplete` takes the host where it took the query client; `Awaited<ReturnType<typeof readRecord>>` is `Awaited<ReturnType<StakeholderLinesHost["readRecord"]>>`; the `<ConnectedCreateDialog ... />` element is a call `host.renderCreateStakeholder!({ ... })` with the same props as one object; the writers are called with a `!` after the member.
  4. Each component reads `host` from the new `StakeholderLinesHostContext` (`useStakeholderLinesHost`, private) first; with no provider it throws.
  5. One added line in each component, before `showPicker`: `if (!(<its writers>)) { editing = false; offer = false; }`. That is the read-only behaviour: the same as `editing` false with no `offer`.
  6. One comment in `useLoadedStakeholder` is reworded; other comments are the source's. In `useLoadedStakeholder` the app's `useMainTag(uri)` (the import from `recordTags`) is `host.useMainTag(uri)`, a new required host member; `handleFromFacts` is no longer imported (the model dropped it) and the `served` read is gone. `ConnectedCreateDialog`, `useConstraintPeople`, `ShellContext` and the app's query-key helpers are not in the unit.
- `src/lib/base/entityDisplayName.ts` to `src/entityDisplayName.ts` (private): `CANONICAL_DISPLAY_SLUG` (line 22), `MASTER_TAG_SLUGS` (28), `IDENTITY_DISPLAY_SLUGS` (35-42), `BRIDGE_SLUGS` (45), `FILE_NAME_SLUG` (53), `EntityDisplayOpts` (155-165, with the new `mainTag` option and its doc), `factTrim` (167-174), `displayFriendly` (192-212), `entityDisplayName` (219-278, with the two new lines that return the trimmed `mainTag` after the `unitTag` / `tag` step). `needsMainTag` (175-183) is not copied: this unit never asks whether a record needs its tag. The code is the source's but for one replacement: `PARTY_NAME_FLOOR.name` (in `src/lib/base/partyName.ts`) is its literal value `"name"`. This is not the `entity-name` unit, which reads `label` first; the chip's remove label and the name used for the handle read `name` first, as the app's does. Its `displayFriendly` agrees with the `display-friendly` unit at that unit's default.
- `src/lib/base/ruleHooks.ts` lines 195-215 (`vaultNamespaceOfEntityUri`) to `src/vaultNamespaceOfEntityUri.ts` (private); this is not the `vault-namespace` unit. Code verbatim, comments made generic.
- `src/lib/base/records.ts` lines 427-433 (`WriteSource`), 447-452 (`writeSource`) and 942-948 (`MergePatchValue`) to `src/writeSource.ts` (private, the types exported). Code verbatim.
- `src/lib/base/planSearch.ts` lines 35 and 38 (`SEARCH_INCOMPLETE_NONE`, `SEARCH_INCOMPLETE_HITS`) to `src/planSearch.ts` (private). Verbatim.
- `writeNotice` (lines 65-69), `VERSION_UNREAD`, `FACTS_CONFLICT` (71-72), `servedRaw`, `sameStakeholderValue`, `writeFacts`, `stakeholderSearchKey`, `stakeholderIncomplete`, `noteAnswer`, `authorityText` and the chip components stay in `src/PlanStakeholders.tsx`, private, with the source's code.
- `src/host.ts`, `src/index.ts` are new.

Tests:

| Source | Ported / left out |
|---|---|
| There is no test of `PlanStakeholders.tsx` alone in GilbApp. | `src/PlanStakeholders.test.tsx` and `src/PlanAuthority.test.tsx` are new: they run the two components with a fake host (in-memory relations and rows, and a log of every click-time getter and writer call, in `test/fakeHost.tsx`) and the two peers' contexts. `src/helpers.test.ts` tests the private copies, `src/exports.test.ts` the exports, `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults. |
| `src/components/records/RecordDetail.planStakeholders.vaultit.test.tsx` (10), `RecordDetail.planAuthority.vaultit.test.tsx` (5), `RecordDetail.planConstraintAuthority.vaultit.test.tsx` (9), `RecordDetail.planResourceCard.vaultit.test.tsx` (17), `RecordDetail.planResourceCard.rqa1.test.tsx` (11), `RecordDetail.planSearchComplete.vaultit.test.tsx` (4), and the RecordDetail suites `planForm`, `planSolution`, `planValueCard`, `planCard`, `planClickToType`, `planFunctionEtagOffList`, `planQaTester3`, `planQaTester5` (each `.vaultit.test.tsx`) | Left out: they render the whole record card against a fetch rig and a query client, and check the card's lines together. Their stakeholder and authority cases are covered here against the fake host. |
