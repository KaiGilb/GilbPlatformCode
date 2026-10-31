# stakeholder-record-card

Draws and edits the card of a person the holder keeps a record of, with Edit, +, the groups in their order, autosave, and the link to their online card.

## What this is

Draws and edits the card of a person the holder keeps a record of, with Edit, +, the groups in their order, autosave, and the link to their online card. It is the record screen's `content` placement for a person: the header (the shared contact header when the holder's vault is known, a band when it is not), the Name group, the Email, Phone and Online account groups, the Skill group, the Relations and Contact preferences, the Record group, the people who list this one as a member, and the foot with "+ Add Information".

One component, `StakeholderRecordCard({ recordId, vaultId?, slots? })`:

- It reads the record at its door (below), then draws the card. The Edit / Done and + controls, the presentation and edit modes, the framed groups and "+ Add your own" are those of the units it stands on (`card-mode`, `card-group`, `one-card`, `contact-rows`, `stakeholder-set-fields`, `stakeholder-contact-header`).
- It saves by itself: a keystroke settles for 600 ms and then goes out as one merge PATCH against the version the card read; leaving the field, hiding the page or leaving the card flushes at once; a save in flight queues the next edit; a 412 reads the record again, rebases the edit on what is stored now and sends it once more (`record-update`).
- It decides who may write: the shell's guard, a framed grant on the record (against the session's principal and short web id), a refusal the session has had for this record (an in-memory pin after a 403), and the holder's own MyNet card (read only, with a band that says where to edit it).
- Four sections and four pieces are the host's, as optional slots (see Slots). Absent, the section is not drawn, with two exceptions that are written below, and **a save never retracts a fact of a section the host does not draw**.

Exports: `StakeholderRecordCard`, `StakeholderRecordCardHostContext`, `useStakeholderRecordCardHost`, `unambiguousVaultOfRecord`, `editorFacts`, `extraKeysFromFacts`, and the types of the host and of every slot.

### The door

`vaultId` is the id of the vault that holds the record; the read goes to that vault's node (`GET /lws/r/<id>`), never to the platform's base address (which answers for one vault only). The record's own address wins when a cache already knows it (a search hit, the list's own row, or the vault a create wrote the record into this session, `createdInVaultOf`); `vaultId` is the door when none is known; and when `vaultId` is absent the vault a create wrote into is the door. With none of them the card **does not read** and says "Which vault holds this card is not known, so it was not read." A deep link after a reload has no door: the host must pass one.

### Order of hooks

The host context is read first, then `host.useShell()`: the first hook of the card, every render, never conditionally. The body is keyed by the record's id (a new record is a new body), and calls its hooks in the order the source did, with the delete, retype and Add-field hooks left out.

## Host

One context, `StakeholderRecordCardHostContext`. With no provider the card throws an error that names it. **R** read, **W** write, **N** navigation.

| Member | Kind | Replaces (GilbApp `RecordDetail.tsx`) | What it is |
|---|---|---|---|
| `useShell()` | hook, R, N | `useShell()` :197, :498 | `{ session, vaults, contentScope: { reach }, writeGuard, openRecordFromList }`. `session.vault.shortWebId` is matched against framed grants; `writeGuard` is `{ allowed, reason }`; `openRecordFromList(id)` opens a linked record. Called first. |
| `photoReadKeys()` | R | `photoReadKeys()` :505 | the photo term's read keys (with `a:`), as a promise; "not known yet" is an empty list, never "no photo" |
| `photoReadKeysSync()` | R | `photoReadKeysSync()` :502 | the same, known now |
| `holdingVaultOf?(qc, id)` | R, optional | `holdingVaultOf(qc, id)` :679, :739 | the vault the holder's merged list attributes the record to. Absent: `createdInVaultOf` of `record-detail-reads`, then the card's `vaultId` |
| `vocabulary` | R | `stakeholderCardVocabularyQuery()` :530 | the card vocabulary host (`stakeholder-card-vocabulary`) |
| `useRefLabel` | hook, R | `useResolvedRefLabel` in `EntityRefValue` | the name of the record a field's address points at; the card mounts it as `RefLabelContext` of `entity-ref-value` |
| `renderRecordPicture?` | W | `VaultAvatar` :1698, :1747 | see Slots |
| `renderBandIcon?`, `renderTypeDescription?` | R | `TypeIcon` :1765, `TypeDescription` :1791 | see Slots |
| `renderAttachments?` | W | `Attachments` :2021 | see Slots |
| `renderAddress?`, `renderEmployment?`, `renderLanguages?`, `renderSkillsAndInterests?` | W | `AddressRows` :1449, `EmploymentRows` :1470, `LanguageSection` :1519, `SkillRows` + `InterestRows` :1493 | see Slots |

The card's peers have hosts of their own, which the host mounts once (they are not members of this one): `ContactRowsHostProvider` (`useHomeDial`, `saveRecordSidecar`, `noteServedVersion`, `PhoneValue`, `SkillPickerSheet`, `SkillDepthNote`, `SocialLogo`, `socialPlatformName`, `HeldVisibilitySwitch`, `AddedByLine`), `StakeholderSetFieldsHostProvider` (`changeRecordFactItems`), `StakeholderContactHeaderHostContext` (with **the real** `useContactLabels` of `contact-labels` and **the same** `useHolderOriginLine` that `contact-card-slots` exports: the header and the body must get one hook), `OneCardHostContext` (the place members; with none the Address group never folds into "you have the same" for a holder who has an address of the person), `OtherLinkedRecordsHostContext`, `AddedByHostContext`, `AdderCardHostProvider`, the field pickers of `field-row` (absent: a text box for the time zone and the contact language), and one setting, `setMyNetProfileUrl` of `own-card-state` (the "Edit in MyNet" link). `test/app.tsx` mounts all of them over the provider `stakeholder-card-hosts-gilbplatform`.

## Slots

Each slot is called with the props the source passed its component, and nothing is drawn around its result but what the source drew.

| Slot | When it is called | Props | Absent |
|---|---|---|---|
| `renderAddress` | the person has an address section and the record has its own address | `title legacyText vaultId recordEntityUri principal canEdit` | nothing is drawn |
| `renderEmployment` | the same, for employment | `title recordId recordEntityUri vaultId edgeKey servedEdges servedReady canEdit onSaved` | nothing is drawn |
| `renderLanguages` | inside the skills block | `vaultId principal recordEntityUri canEdit contactTag writeContact` (`writeContact(tag)` writes the contact-language tag through the card's own save) | nothing is drawn **and the contact-language row stays as a plain row** |
| `renderSkillsAndInterests` | the person has a skill section and the record has its own address | `{ skills, interests }`: `skills` are the props of `ContactRows kind="skill"`, `interests` are `vaultId principal recordEntityUri canEdit` | **the plain `ContactRows kind="skill"`**: the skills, with no "About this skill" note and no interests |
| `renderRecordPicture` | the holder's vault is known and the record has a photo or a photo field | `vault person { id entityUri photoRef name canEdit } onSaved` (wide header adds `shape size cssSize initials`; the band adds `size`) | the header shows their photo, or the initials |
| `renderBandIcon`, `renderTypeDescription` | the non-wide band | `typeId typeName facts className`; `ownDoes typeUri specTypeName` | nothing |
| `renderAttachments` | the record is not optimistic | `recordId vaultId recordEntityUri canWrite recordFacts` | nothing |

**The keep list.** An autosave sends the card's own facts and keeps every other fact of the record. The keys of all four sections (`contactSections`), the sidecar key, the online-card link and the set's own facts are in the keep list whether or not the host draws the section. A save of the given name with every slot absent sends the name and nothing else of the facts (`StakeholderRecordCard.keepList.test.tsx`; seven mutants of the keep list are killed by it).

## What it writes

The card makes one write of its own: the autosave, `PATCH /lws/r/<id>` with `If-Match: <the version it read>`, merge-patch body of the changed facts (and the party-name rule: a person held under the legacy label is renamed under `a:name` only). Through its peers it also writes: the contact sections (`saveRecordSidecar`), Link / Unlink of the online card (`one-card`), a reference added or removed (`stakeholder-set-fields`), the kind chips and "+ Relation" (`contact-labels`), My Note and Where / How we met (`contact-annotation`). In memory it pins a record after a 403 (`entity-write-access`). It writes nothing when a card is opened.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `GET /lws/r/<id>` | the record read (`record-detail-reads`), and once more after a 412 | the node of the record's door (its own address when a cache knows it, else the vault named; never the base address) |
| `PATCH /lws/r/<id>` | the autosave (`record-update`) | the record's own node (`record.entityUri`) |
| the master's field sets, kinds, term documents | `stakeholder-card-vocabulary`, `term-slots` | the ontology origin, anonymous, once per session |
| `GET <base>/base/t/<Type>`, `/base/a/<slug>` | `veda-labels` | the platform's base address, with a Bearer when one is formed; a failure shows the master's label |
| `GET /base/find-by-attribute` | `related-children`, `held-notes` | the node of the vault asked |
| the online-card, connections and annotation routes | `one-card`, `person-connections`, `contact-annotation` | as their own READMEs say |

## Differences from GilbApp

1. **Content placement only.** No `full` or `actions`: no Tags section, no Type (retype), Add field, Details, Access, Share, Folder or Delete, and the right pane's larger band picture is not drawn.
2. **No generic editor.** GilbApp draws its generic editor while the master has not said what a record is: a Person whose master read hangs shows an editable (or read-only) Name box there. This card draws the header, the state's own line (`stakeholder-fields-state`) and, while the master is read, one status line ("Reading the fields of this card…"), and **no field**. Four source cases changed with it (`stakeholderCard.c214`: fields not known yet; a label-only Person with the master answering 503; a Person holding `a:name` with the master hanging; a Person in the same window), rewritten in `StakeholderRecordCard.states.test.tsx`.
3. **Person cards.** A record that is not a stakeholder kind (a note, a task), a Plan card and an **organization** get "This card draws the card of a person only." No `OrgCardGroups`, no logo. A ready stakeholder kind that is neither a person nor an organization draws as in GilbApp (the Details group).
4. **The four sections are slots** (above); absent, Address, Employment and Languages are not drawn, Skill is the plain skills section, and the contact-language row stays visible when there is no Languages slot (GilbApp hid it because its Languages section showed it).
5. **No photo editor, no attachments, no type icon or description** unless the host gives the slot.
6. **The door** is a prop; no read without one. GilbApp read the shell's selection.
7. **Dropped branches:** the file branch, the online-person branch (`?ons=`), the "Select a record" branch, the name-only card of "Added by" (`NameOnlyCard`), the address lock (`ADDRESS_LOCK_ON`, always off).
8. **`recordWriteAllowed` is called with the session's refusal** (`isEntityWriteDenied(id)`, the fourth argument of `record-write`'s function); GilbApp's function read it from a module set.
9. **The not-returned sentence** names the vault asked by looking it up in the shell's `vaults` (GilbApp fell back to `contentScope.readVault`).
10. **The label hook** for fields that point at records (`useRefLabel`) is a host member mounted by the card.
11. **The dynamic import** of the label prefetch is a static import of `veda-labels`; `ExtraFact` and `FieldEditor` are exported by their files.

## Changes in 0.1.1

Package metadata only; no source or test change. The unit's `devDependencies` gain `modes-label`, which the provider `stakeholder-card-hosts-gilbplatform` 0.4.0 imports (the tests mount every host over that provider, so they install its peers), and the lockfile is refreshed. The peer ranges are unchanged. The tests still build this card's host themselves (`test/app.tsx`); they do not depend on `stakeholder-record-card-host-gilbplatform`, which is this card's ready-made host for a taker.

## Changes in 0.1.2

- devDependencies only: the units `one-card` 0.2.0 now needs (`flag-choice`, `language-fetch-pool`, `flag-source`, `flag-image`, `language-entry`, `language-row`), so the installed card resolves them in the tests. The peer `one-card` is now `^0.2.0`. The install line is the output of `peers.mjs` again. No source or test changed.

## Where it came from

GilbApp `src/components/records/RecordDetail.tsx` at a703b3ed78e612e2cab77e94876ce9bce109d5a3, the ranges listed in `unit.json`, and `src/lib/base/recordVault.ts` lines 104-117. About 1,120 of the 3,041 lines are kept as written (comments naming a cycle, ruling, agent, date or ticket are removed; the others are kept), 180 are replaced by slot calls, 1,179 are dropped. The stripped range compare (comments and imports removed, word by word) shows only the named changes: `recordFacts.ts`, `ExtraFact.tsx`, `FieldEditor.tsx`: 0 words removed from the source, one added (`export`); the body: the dropped ranges, the slot calls and the edits listed in `unit.json`.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-record-card`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-record-card` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-name <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/header-layout <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-row <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/own-card <path-to-the-library>/units/person-name <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/photo-term <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/record-write <path-to-the-library>/units/entity-write-access <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/sheet-history <path-to-the-library>/units/add-information <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/tag-carrier <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/person-field-row <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/veda-labels <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/other-linked-records <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/stakeholder-set-fields <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/own-card-state <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/record-update <path-to-the-library>/units/related-children <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-labels <path-to-the-library>/units/contact-card-slots <path-to-the-library>/units/contact-rows <path-to-the-library>/units/stakeholder-record-card
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind v4 utility classes with arbitrary values over CSS variables, in this unit and in the units it draws; add `@source` for the unit and its peers. This unit reads `--ink --ink-soft --ink-faint --ink-ghost --accent --serif --surface --line --line-2 --warn --focus --r-sm --r-md`; the peers read more (`--sel --good --surface-hi --r-lg …`; see `card-group`, `one-card`, `add-information`, `stakeholder-contact-header`).

## Tests

**269 tests in 26 files, all passing** (`npm test`; `README` counts equal the run). Re-run with `npm test`; the host-agnostic check is `npm run check:host-agnostic`.

- **Ported: 164 tests from 163 cases of the source's 221** (`StakeholderRecordCard.<name>.test.tsx`, one per source file: `stakeholderCard.c214` 18, `s8cardlook` 15, `s5dOneCard` 16, `s5bheader` 17, `s5fNoOnlineCard` 11, `s5fTester60` 2, `s13online` 14, `s10iter1header` 11, `s10iter1drawer` 7, `s10iter1focus` 4, `s4placement` 6, `ui2LessIsMore` 8, `s14labelsWiring` 5, `c214bn` 6, `c214bnNick` 5, `ownCard.o1` 19; one source case runs for two widths). They are the source files with the imports re-pointed at the units and the app's mocks taken out; the case bodies are the source's. The page around the card is `test/app.tsx`: a `ShellContext` the tests fill, a `RecordDetail` that draws the card of the selected record, and every host the peers ask for, over the provider `stakeholder-card-hosts-gilbplatform` (fixtures: the package's own fixture master and fixture platform, copied into `test/`). Four modules the source mocked are not: the header's relations spy and the held-languages store (the cases that needed them are listed), and `./Attachments`, `./TypeChooser`, `workingSet`, `dpop`, `fileHooks` and `relations` (no longer in the card). `vi.mock` remains in two files, `s14labelsWiring` and `ownCard.o1`, for `contact-card-slots`, as the source mocked `./ContactCardSlots`.
- **Changed: 4 cases** (`stakeholderCard.c214`: fields not known yet; a label-only Person with the master answering 503; a Person holding `a:name` with the master hanging; a Person in the same window) assert what the source's generic editor showed; their rewrite for this card is in `StakeholderRecordCard.states.test.tsx` (see Differences from GilbApp).
- **Listed, not ported: 18** (the table `CASE-TABLE-HC22.md` of the handback names each with its reason): the Languages section (2), the contact-language display and the time-zone picker, which need the host's field pickers (4), the skill note and Interests (2), two that need the generic body while the kinds are not known (2), the Interests read errors of `s4placement` (1), the header's internal relations spy (1), and `isOwnCardIn` / the finding, which `own-card-state` tests itself (6).
- **Out: 36** (not the person card): an Organization record or body (9), a non-person type's name rule or the generic editor (7), a retype (5), the list's rows (12), Details (2), the right pane (1).
- **New: 105.** `StakeholderRecordCard.door.test.tsx` 9 (the read is addressed at the vault named; a known address decides; with no door nothing is read and the line says so; a listed record is drawn with no read; the not-returned sentence names the vault asked); `keepList` 10 (below); `guard` 13 (the shell's guard, framed grants by principal and by short web id, a record that turns read only while it is typed in, a 403 pins the record, a 412 is read again and rebased, any other failure is said, the wide header's controls); `autosave` 10 (the debounce, a save in flight queues the next edit with the version it returned, leaving and hiding flush, a record read again under a typed draft, a set with no name field); `slots` 14 (each slot's props, absent slots, the picture, the band, attachments, the holding vault); `states` 9; `host` 4; `recordFacts` 16; `unambiguousVaultOfRecord` 7; `hostAgnostic` 13.
- **The keep list** (`keepList`): while a name is being typed, the sections' writers land an address, employment edges and skills on the record; the save that follows must take none of them away, with every slot absent, with each slot given alone, with all four given, with each key alone, and on the retry after a 412.
- **Mutants: 51** (`mutate.mjs`, the specification and results are in the handback folder): 48 killed, 3 equivalent (the set's own kept facts: the card has no editor in the one state where they matter; `stakeholderLocked`: nothing is drawn in the state it locks; the read-only line `reason ?? ENTITY_READ_ONLY_REASON`, the same words for every input). Seven aimed at the keep list (6 killed, 1 equivalent), nine at the write guard and `canWrite` path (7 killed, 2 equivalent), seven at the door refusal (all killed).
- The harness has no clock waits except the autosave's own debounce; every other wait is Testing Library's `waitFor`.

