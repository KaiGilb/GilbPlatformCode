# contact-card-slots

Gives a person's record card its holder-only slots: the 'Where / How we met' line in the header and My Note in the body, from one source.

## What this is

Gives a person's record card its holder-only slots: the 'Where / How we met' line in the header and My Note in the body, from one source.

A held card (a person the holder keeps a record of) has reserved places that only the holder fills. This unit fills them, from one source:

- `contactCardSlots(args)`: the card's `CardSlots` (`card-group`): `nameAside` (the kind-of-contact chips beside the name, drawn by `ContactKindChips` of `stakeholder-contact-header` over `useContactLabels` of `contact-labels`), `myNote` and `howWeMet` (the two private groups of `contact-annotation`, "My Note" over "Where / How we met"). With no vault or no record address it returns `{}`.
- `useHolderOriginLine(args)`: the "Where / How we met" line the card's HEADER shows. It is `{ origin: string | null, loading: boolean }`, the SAME read as the body's group (the same query keys, so the two cost one request, and an edit in the group shows in the header at once). No read of its own, no write.
- `ContactCardArgs`: `vaultId` (the vault that HOLDS the record), `ownVaultId` (the signed-in holder's own vault: the annotations route reads from there), `principal`, `recordEntityUri`, `typeUri`, `canEdit`, `kindVault?` (the vault as the target of a kind), and for a record linked to a person: `linkedParty`, `linked`, `linkedLookupFailed`, `linkAnswer`.

Who the notes are about: ONE key per person (`heldNoteKey` of `person-connections`): the person's principal when the record is linked to one, else the record's address. A record that CARRIES a link never uses the record as its key: while the person is not named (being looked up, or the lookup failed) the notes are not read, cannot be written, and no box is drawn. Only a definite "not a person" (an organization) keys the notes to the record. Notes written earlier under the record of a linked person are no longer shown; they stay in the vault.

When the route is asked: only when it can matter. The held records about the contact are read first (shared with the chips); the annotations route is asked when one of them is not a chip's claim (the note records carry `a:heldParty` too), when the claims read failed, or when the record is linked to a person. A card with no record, or only chips, never pays it. What was read or written is kept for a minute.

Notes and the chips are for the holder in their OWN vault only (`annotationsFit`): on a card held in another vault the chips are read, read-only, and no note is offered.

## ONE hook for the header and the body

The header's "Where / How we met" line and the body's group must get the SAME `useHolderOriginLine`. If the header is handed a different hook (or its own copy), the line in the header disagrees with the group in the body. Hand the header host (`useHolderOriginLine` member of `stakeholder-contact-header`) THIS unit's function, and `contactCardSlots` to the card, with the same arguments. Likewise give the header host the same `useContactLabels` the chips use (`contact-labels`), under one query client.

## What this is not

- Not the chips' logic (`contact-labels`), their look (`stakeholder-contact-header`), the notes' save machine (`contact-annotation`), or the frame (`card-group`, `card-mode`).
- Not a writer of anything of its own: no membership, grant or rung, and nothing on the contact's own card. It holds no request of its own (see below).
- Not `GILBAPP_CHIP_HELP`: the chip's help line is in `stakeholder-contact-header`; this unit imports it and does not re-export it.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-card-slots`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/contact-card-slots` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-row <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-labels <path-to-the-library>/units/contact-card-slots
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes live in the units it draws (`contact-annotation`, `card-group`, `stakeholder-contact-header`); this unit has none of its own. See their READMEs for the CSS variables; add their `src` to the Tailwind scan.

## Requests and their servers

This unit sends no request of its own. The requests below are the peers', each made only on the conditions named; every vault request goes to the node of the vault that holds the record, never to the person's card host.

| Request | Made by | When this unit triggers it |
|---|---|---|
| `GET /base/find-by-attribute?attr=a:heldParty...` (the held records about the contact) | `held-notes` | whenever the card is held in the holder's own vault and has a record address; shared with the chips (one key) |
| the claim type document at the ontology master (public, no credential) | `contact-labels` | only when at least one held record exists about the contact |
| `GET /base/connect/annotations?heldParty=<key>` at the vault's node | `contact-annotation` | only with evidence (a held record that is not a chip's claim), a failed claims read, or a linked record; and only when the key is known |
| `PUT /base/connect/annotations` (JSON body with `vaultId`) at the vault's node | `contact-annotation` | the holder typing in a group (autosave, blur, page hide); the only write this unit leads to besides the chips |
| the chips' reads and writes | `contact-labels` | see its README, the sections "Requests and their servers" and `What "+ Relation" writes` |

Privacy: My Note and Where / How we met are written only to the holder's own vault, through the annotations door; the person's card address is data (the `heldParty` key), never a place a request goes. A test asserts that a write goes to the holder's vault node and to no other host, and that a card in another vault sends nothing.

## Examples

```tsx
const slots = contactCardSlots({ vaultId, ownVaultId, principal, recordEntityUri, typeUri, canEdit, kindVault, linkedParty, linked, linkAnswer });
<CardTopSlots slots={slots} />
<CardGroup kind="name" title="Name" aside={slots.nameAside}>...</CardGroup>
// the header: pass the same function and arguments
<StakeholderContactHeaderHost value={{ ...host, useHolderOriginLine, useContactLabels }}> ... </StakeholderContactHeaderHost>
```

## What the host must supply

- Everything its peers need: `setBaseOrigin` / `setSystemVaultHosts` (`base-origin`), `setLwsAuth` (`lws-session-bridge`), `setTermOrigin` (`term-origin`), a React Query `QueryClientProvider`, a `CardModeProvider` above the card, and the `AdderCardHostProvider` of `adder-card`.
- The person resolver's answer for a linked record (`linkedParty`, `linked`, `linkedLookupFailed`, `linkAnswer`), as `person-connections` gives it.
- The unit has no host members and takes no React context of its own.

## Module state

None of its own. The state is the peers': the vocabulary caches of `contact-labels`, the route capability of `contact-annotation`, the claim chains of `held-notes`. An app must have ONE copy of each. One component-level ref (`shownEmpty`) keeps an empty group mounted while the person types in it.

## Do not

- Do not give the header a different `useHolderOriginLine` from the body's.
- Do not key the notes by the record when the record carries a link, and do not draw a box while the key is unknown.
- Do not offer a note, or edit a chip, on a card that is not held in the holder's own vault.
- Do not read the annotations route for a card that shows no evidence of a note (the groups stay empty and are opened from "+ Add Information").
- Do not read the lists to add a kind from before the chooser is opened.

## Wrong readings

- "The header line reads the route again." It does not: it shares the body's query keys.
- "An empty note is not drawn." On a card the holder can write it is drawn as one line; the empty groups are listed under "+ Add Information".
- "Old notes under the record of a linked person are migrated." They are left where they are and no longer read.

## Changes in 0.1.1

- devDependencies only: the units `one-card` 0.2.0 now needs (`flag-choice`, `language-fetch-pool`, `flag-source`, `flag-image`, `language-entry`, `language-row`), so the installed card resolves them in the tests. The install line is the output of `peers.mjs` again. No source or test changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/components/records/ContactCardSlots.tsx` (210 lines, minus lines 32-33) to `src/ContactCardSlots.tsx`.

Named changes, and only these:

1. The imports are imports of units: `heldNoteKey`, `ResolveOutcome` from `person-connections`; `CardSlots` from `card-group`; `useCardMode` from `card-mode`; `HolderNoteGroup`, `annotationsFit`, `loadHolderAnnotations`, `AnnotationVaultMismatchError`, `NOTES_VAULT_UNTIED_COPY`, `HolderAnnotations` from `contact-annotation`; `ContactKindChips`, `GILBAPP_CHIP_HELP` from `stakeholder-contact-header`; `useContactLabels`, `hasAnnotationRecord`, `resolveHeldClaimType` from `contact-labels`; `NO_OWN_VAULT_SAYS` from `adder-card`; `KindVault` from `kind-relation`; `HELD_NOTES_STALE_MS`, `heldClaimsKey`, `listHeldClaimsAbout` from `held-notes`.
2. `export const GILBAPP_CHIP_HELP = ...` (source lines 32-33) is not here: the same line is `src/gilbappChipHelp.ts` of `stakeholder-contact-header`, imported (one copy). It is not re-exported from this unit.
3. The header comments are new and shorter; the comments that name a cycle, a ruling, an agent, a date, a ticket or a wiki rule are reworded with the same facts. No code changed.
4. `src/index.ts` is new and exports `contactCardSlots`, `useHolderOriginLine` and the type `ContactCardArgs`.

With comments and imports removed, the file is token-equal to the source except the one deleted line of change 2 (702 words against 682, 1 diff line: the `GILBAPP_CHIP_HELP` constant).

## Tests

84 tests in 10 files (`npx vitest run`):

- PORTED, the source's 8 files, 54 cases (55 runs: one case is a loop): `ContactCardSlots.n1bothApps` 8, `.n1noKeyNoBox.s124` 1, `.n1notAPerson.s125` 2, `.n1resolverDown.s123` 4, `.ns1noCard` 5, `.s8labels` 21, `.twoVaults.s10labels` 4, `.ui2compactNotes` 10. The source's 50 `vi.mock` statements are replaced: the peers run for real over the fake platform of `test/fakePlaceStore.ts` (the held-notes fake), the master's documents of `test/masterFetch.ts`, the relation store of `test/relationStoreFake.ts` and the viewer's own card of `test/adderCardMock.ts` (the contact-labels and held-notes fakes, copied). What is still mocked, per file: `term-slots` (the master's spellings), `listVaultRecordsPage` of `lws-vault-sets` (the typed list of own kinds), `adder-card` (the viewer's own card), and in `s8labels` the four relation doors of `lws-relations`.
- NEW `slots.test.tsx` 16: the slots are `{}` without a vault or a record and exactly three places with both; the header and the body get ONE request and an edit shows in the header at once; the header line is the origin and never the note; privacy (a write goes to the holder's vault node and no other host and nothing else is written; a card in another vault sends nothing and offers no note); the chips follow the holder's right to edit whatever the mode says; they say they are a label; no claim type is read for a card with no record; a failed claims read still asks for the notes; the box is swapped when the person changes; the read is kept per vault.
- `hostAgnostic.test.ts` 13 (the same host-agnostic check as the other units; it writes to the OS temp directory).

`test/annotationsRoute.ts` is the annotations route as a `fetch` stub (GET and PUT, one pair of fields); it stands where the source mocked `loadHolderAnnotations` and `saveHolderAnnotations`.

Left out, or changed (not portable as written):

- `ContactCardSlots.ns1noCard` (5): ADAPTED. The source mounted the Interest, Language and Organization-number sections of the app (in no unit). The same five cases run over the name-aside slot and the held-notes hook; the assertions about those three sections' controls (their add buttons, their sections being absent) are dropped.
- `ContactCardSlots.ui2compactNotes`, the two cases of "the empty note's hint is readable": CHANGED. The source resolved the hint's colour variable from GilbApp's `styles/tokens.css` and measured 4.5:1 in every theme and against three backgrounds. That stylesheet is the app's, so the contrast is the host's to measure; the two cases now pin that the hint names its colour variable (`--ink-soft`) and is never left to the browser's half-ink.
- `ContactCardSlots.s8labels` / `.ui2compactNotes`, the cases that spied on `saveHolderAnnotations` and `loadHolderAnnotations`: CHANGED. A module mock of `contact-annotation` cannot reach the save made inside that unit, so the spies are the wire stub's counts and bodies (the PUT body now carries `keepalive` as the request's flag).
- The card-level tests of the whole record screen (`RecordDetail`) and the sections beside the slots belong to the composition.

Mutation checks: 27 mutants of `ContactCardSlots.tsx`: 8 on the chips (editable outside the own vault, by a reader, outside edit mode; the no-own-vault line shown to a reader; the help line; the chip meaning; the lists read before the chooser; remove), 11 on the notes' key and read (the route asked for a card in another vault, a linked record keyed by the record, a box with no key, a linked card not always asked, the evidence rule, a failed claims read, the held type read with no claim, the box not re-keyed, written under the record, the query key without the vault), 5 on the header line and the groups (the note shown as the origin, never loading, the empty group not kept, the wrong field on My Note, the saved text landing in the wrong field), 3 on the slots and the error copy. First run: 19 killed, 8 survived: S2, S6, S17, S23, S25, S26 were real gaps (tests added, all killed); S16 (`!keyKnown` in the group's early return: with no key the query is off and the group returns null on `!data` anyway) and S27 (`!!recordEntityUri` in the chips' `enabled`: `contactCardSlots` mounts the chips only with a record address) are EQUIVALENT. Final: 25 killed, 2 equivalent.
