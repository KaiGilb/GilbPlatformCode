# stakeholder-contact-header

Draws a stakeholder's header with circle chips, kind chips and the vault photo.

## What this is

Draws a stakeholder's header with circle chips, kind chips and the vault photo.

Four files of the app, each whole, and one constant, with six members for the host. `StakeholderContactHeader` mounts the shared `ContactHeader` (unit `contact-header`) and hands it the data: the holder (the vault the record is held in) with its picture, name and kind in words; the circles the holder placed the person in; the Where / How we met line; their name and photo when their online card is shared, else the record's own; the chain-link badge; the relation chips; and "+ Relation", which opens the kind chooser.

- `StakeholderContactHeader(props)`: the header. Props: `holderVault` (a `ReachableVault`), `ownVaultId`, `viewer`, `principal`, `canEdit`, `record` (`{ id, entityUri, typeUri }`), `ownName`, `kind` (`{ kind, ancestors }` or null), `kindLabel`, `personCard` (the resolver's `PersonCard` or null), `onlineCard` (the card controller or null), `ownPicture` (draws the record's own picture editor, or null) and `ownCard` (the record is the holder's own: no Where / How we met line, no relations, no "+ Relation"). Draws a status line under the header when an add or remove did not happen, and the kind chooser when "+ Relation" is pressed.
- Data helpers: `contactImageType(kind)` (the first of the kind and its is-a ancestors that is a person, else the kind), `isOwnVault(vault, ownVaultId)`, `holderCaption(vault, ownVaultId)` ("Me", or "<type> vault", or "Vault"), `holderPersonName(vault, fromCard)`, `holderFaceKey(vaultId)`, `useHolderFace(vault)`, `useHolderPersonName(vault)` and `HolderImage`.
- `useHeaderRelations(args)`: the reads behind the relation chips. Answers `{ relations, canAdd, chooserOpen, openChooser, closeChooser, labels }`. `predicateCurieKey(ref)`. Re-exports `USER_VOCAB_KEY`, `readHeaderVocab` and `VocabUnreadableError` of `contact-kind-catalogue`.
- `PersonPlacementChips({ card })`: the circles as a read-only band, with `PLACEMENT_BAND_TITLE` and `PLACEMENT_CHIP_HELP`.
- `ContactKindChip`, `ContactKindChips`, `ContactKindChooser` and the type `ChipMeaning`: the kind-of-contact chips with a chooser dialog. A chip means `"access"` (a circle membership) or `"label"` (a label for the holder's own knowing); the adapter says which and gives the help sentence. `GILBAPP_CHIP_HELP` is the app's sentence.
- The host: `StakeholderContactHeaderHost`, `StakeholderContactHeaderHostContext`, `useStakeholderContactHeaderHost()` and the types of its members.

## What this is not

- Not the shared header itself (`contact-header`), nor navigation, search or a write of its own. The one write the header offers, "+ Relation", goes through the host's `useContactLabels().add`: the unit holds no write.
- Not the card body, nor the My Note and Where / How we met boxes (`ContactCardSlots` of the app: only the sentence `GILBAPP_CHIP_HELP` is here), nor the hook that reads or writes the labels (`useContactLabels`, a host member).
- Not an image loader: the photos come from the host (`discoverVaultProfilePhoto`, `loadPhotoObjectUrl`, `loadGranteeFace`).

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-contact-header`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-contact-header` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-row <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header
```

Of those, this unit imports from thirteen: `online-card` (`cardName`, the type `OnlineCardController`), `person-connections` (`displayPlacements`, the types `PersonCard`, `ResolveOutcome`), `contact-header` (`ContactHeader`, `contactInitials`, the types `ContactHeaderSlotImage`, `ContactHeaderRelation`), `stakeholder-ui-kit` (`imageShapeOf`), `one-card` (`useOnlineCardState`), `contact-kind-model` (`placementChip`, `chipText`, `edgesToVault`, `headerRelations`, and types), `contact-kind-catalogue` (`USER_VOCAB_KEY`, `readHeaderVocab`, `VocabUnreadableError`, `readPredicateCurie`), `contact-annotation` (`annotationsFit`), `vault-list` (`vaultLabel`), `lws-vault-sets` (`typeLocalName`), `plan-record-hooks` (the type `ReachableVault`), `relation-role` (the type `RecordRelation`) and `remove-control` (`RemoveControl`); and from the third-party `@tanstack/react-query`, `react` and `react-dom`. The install line is long because those units have peers of their own (`one-card` alone brings most of them, for the one hook `useOnlineCardState`).

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```tsx
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import {
  StakeholderContactHeader,
  StakeholderContactHeaderHostContext,
  type StakeholderContactHeaderHost,
} from "@kaigilb/gilbplatformcode-stakeholder-contact-header";

setBaseOrigin("https://platform.example.test"); // once, at start-up
setTermOrigin("https://ontology.platform.example.test"); // once, at start-up

declare const host: StakeholderContactHeaderHost; // your six members, see below
declare const queryClient: QueryClient;

export const Header = () => (
  <QueryClientProvider client={queryClient}>
    <StakeholderContactHeaderHostContext.Provider value={host}>
      <StakeholderContactHeader
        holderVault={vault}
        ownVaultId={ownVaultId}
        viewer={principal}
        principal={principal}
        canEdit
        record={{ id: "06abc", entityUri: "https://home.platform.example.test/base/e/06abc", typeUri: "https://ontology.platform.example.test/base/t/Person" }}
        ownName="Ann Larsen"
        kind={{ kind: "https://ontology.platform.example.test/base/t/Person", ancestors: [] }}
        kindLabel="Person"
        personCard={null}
        onlineCard={null}
        ownPicture={null}
      />
    </StakeholderContactHeaderHostContext.Provider>
  </QueryClientProvider>
);
```

## What the host must supply

- The origins: `setBaseOrigin(origin)` of `base-origin` and `setTermOrigin(origin)` of `term-origin`, once at start-up (the peers read them when a call is made).
- A React Query `QueryClientProvider` above the header.
- `StakeholderContactHeaderHost`, given by `StakeholderContactHeaderHostContext.Provider`. With no provider, the header throws "The stakeholder contact header needs a StakeholderContactHeaderHostContext.Provider above it." All six are required (the unit reads and shows; none writes). Keep the object the same between renders where you can; the three hooks are called on every render, in the order the source called them.
  - `discoverVaultProfilePhoto(vaultEntityUri, vaultId)`: finds the holder vault's profile photo reference and the name on the owner's own card, `{ photoRef, personName? }`. Replaces `discoverVaultProfilePhoto`, GilbApp `src/lib/base/vaultProfilePhoto.ts` line 269, called at `StakeholderContactHeader.tsx` line 89 with the vault's entity and id, in the query function of the holder's face. Called once per holder vault per session.
  - `loadPhotoObjectUrl(photoRef, door)`: fetches the photo bytes with the signed-in credential and answers an object URL, or null. Replaces `vaultProfilePhoto.ts` line 437, called at `StakeholderContactHeader.tsx` line 90 only when the discovery found a reference, with the vault id as the door.
  - `loadGranteeFace(principal, viewer)`: their photo, read with the holder's credential through the rung-gated route; an object URL or null. Replaces `src/lib/base/granteeFace.ts` line 108, called at `StakeholderContactHeader.tsx` line 150 in the query function of their face, only when their online card is ready and shares a photo.
  - `useHolderOriginLine(args)`: a hook. The Where / How we met text of the card (`{ origin, loading }`), the same read as the card's own group so that the two share one request. Arguments: `vaultId`, `ownVaultId`, `recordEntityUri`, `linkedParty`, `linked`, `linkedLookupFailed`, `linkAnswer`. Replaces `ContactCardSlots.tsx` line 156, called at `StakeholderContactHeader.tsx` line 215 on every render of the header.
  - `useContactLabels(args)`: a hook. The record's kind chips and the lists to add from, with `add`. Arguments: `vaultId`, `ownVaultId`, `subject`, `principal`, `typeUri`, `kindVault`, `enabled`, `needOffers`. Returns the members of the app's `ContactLabelsState` the header reads: `chips`, `offered`, `offersLoading`, `catalogueNote`, `actError`, `add`, `entryPredicates`. Replaces `src/lib/contact/useContactLabels.ts` line 139, called at `useHeaderRelations.ts` line 62 on every render of the relations hook. The chooser's pick goes through `add`; the unit writes nothing else.
  - `useRelations(id, at)`: a hook. The record's relations by reverse lookup, `{ data }`. Replaces `src/lib/base/relationHooks.ts` line 14 (the app: `staleTime: 15_000`, disabled for a null or temporary id, the key of `relationsKey(id, at)` shared with the relations section and the graph), called at `useHeaderRelations.ts` line 101.
- Styles: the unit has no stylesheet of its own. Its classes are Tailwind v4 utilities with arbitrary values over the app's CSS variables, so the host runs Tailwind with `@source "<path>/units/stakeholder-contact-header/src";`. The variables it uses: `--ink`, `--ink-soft`, `--ink-faint`, `--accent`, `--paper`, `--surface`, `--line`, and the connection colours `--color-connection-personal-bg`, `--color-connection-personal-border`, `--color-connection-pro-bg`, `--color-connection-pro-border` (each with a literal fallback). The header block itself (`contact-header`) ships its own style sheet. `data-testid` values: `contact-header-holder-image`, `contact-header-relation-note`, `person-placement-band`, `person-placement-chip`, `person-placement-help`, `contact-kind-chip`, `contact-kind-add`, `contact-kind-help`, `contact-kind-note`, `contact-kind-chooser`, `contact-kind-chooser-help`, `contact-kind-chooser-note`, `contact-kind-option`, `contact-kind-none`.

## Kept as in production

The four queries with `staleTime: Infinity` are kept exactly, with their keys (the app shares the keys):

- `["s5b-holder-face", vaultId]`: `staleTime: Infinity`, `gcTime: Infinity`, `retry: false`, `refetchOnWindowFocus: false`; enabled when the vault has an id.
- `["s5b-their-face", viewer ?? "", principal ?? ""]`: `staleTime: Infinity`, `retry: false`, `refetchOnWindowFocus: false`; enabled when a principal is given.
- `["s5c-predicate-curie", ref]` (`predicateCurieKey`): `staleTime: Infinity`, `gcTime: Infinity`, `retry: 2`, `refetchOnWindowFocus: false`; one per distinct predicate a kind chip names.
- `USER_VOCAB_KEY`, `["s5c-user-link-plane"]` (of `contact-kind-catalogue`): `staleTime: Infinity`, `gcTime: Infinity`, `retry: false`, `refetchOnWindowFocus: false`; enabled once a kind names a predicate or a relation edge is stored.

No `localStorage` or `sessionStorage` key is used by the unit.

## Module state

None. The unit holds no module-level variable or cache (grep of `let`, `new Map`, `new Set` at module scope: none; `new Map` is built inside a memo). It is not a singleton peer. The state it relies on is in the units it reads (`contact-kind-catalogue`'s caches, `lws-relations`' vocabulary cache, `term-origin`, `base-origin`), each of which must exist once in an app.

## Changes in 0.1.1

- `annotationsFit` is imported from `contact-annotation` and the private copy in `useHeaderRelations.ts` is deleted: one function, one unit. The two were compared first (printed from the source with comments removed): 38 words each, 0 diff lines, and both are token-equal to the app's `contactAnnotation.ts:66`. The peer `contact-annotation` (^0.1.0) is new; it brings no unit that the install line did not already hold, except itself. The unit's host-agnostic script (`scripts/check-host-agnostic.mjs`) allows the new import. Nothing else changed: the tests are the 0.1.0 tests, unchanged.

## Changes from production

Named, and only these (also in `unit.json`):

1. The imports are the peers' (above).
2. The six host members. Before: `const state = await discoverVaultProfilePhoto(vault.entity, vault.vaultId);` After: `const state = await host.discoverVaultProfilePhoto(vault.entity, vault.vaultId);`. The same for `loadPhotoObjectUrl`, `loadGranteeFace`, `useHolderOriginLine`, `useContactLabels` and `useRelations`. Four functions begin with `const host = useStakeholderContactHeaderHost();`.
3. `HeaderRelationsState.labels`: before `ReturnType<typeof useContactLabels>`, after `ContactLabelsState` (the structural subset declared in `stakeholderContactHeaderHost.ts`).
4. `annotationsFit`: in 0.1.0 a private function of `useHeaderRelations.ts`, the app's tokens without `export` (it was `contactAnnotation.ts` line 66); since 0.1.1 it is imported from `contact-annotation`, which holds the same function (see "Changes in 0.1.1").
5. `GILBAPP_CHIP_HELP` moves in from `ContactCardSlots.tsx` line 33 (`src/gilbappChipHelp.ts`).
6. Comments are generic.

No optional host member: the files import no app UI component (`ContactHeader` and `RemoveControl` are units). No origin is held at load, so no setting unit changed.

## Do not

- Do not change the four `staleTime: Infinity` queries or their keys: the holder's face is read once per vault per session, and a changed key reads it again on every card.
- Do not call the host hooks conditionally or move them: they run on every render, where the source called its hooks.
- Do not wire `useHolderOriginLine` to a read of its own: it must be the card's own annotation read so that the header and the group share one request.
- Do not install a second copy of `contact-kind-catalogue` or `lws-relations`: the vocabulary is read once through them.

## Wrong readings

- "The header writes a relation." "+ Relation" opens the chooser and the pick goes to the host's `useContactLabels().add`; the unit writes nothing.
- "The circles are shown for any vault." They are drawn only when the card is seen from the holder's own vault (`isOwnVault`); seen from a company's or a project's vault they are not drawn.
- "The chain-link badge says the person's card is open to you." The badge shows when the resolver links the record or when the record carries one link (`a:sameAs`), even when the card cannot be read; the caption says which ("online card", or "linked, not open to you now").
- "`holderCaption` reads the vault's name." It reads the vault's type: "Me" for the holder's own vault, else "<local name of the type> vault", else "Vault".
- "A chip that names a circle is a relation." Only kinds on the relationship axis are read for a predicate; circle labels are not.

## Changes in 0.1.2

- devDependencies only: the units `one-card` 0.2.0 now needs (`flag-choice`, `language-fetch-pool`, `flag-source`, `flag-image`, `language-entry`, `language-row`), so the installed card resolves them in the tests. The peer `one-card` is now `^0.2.0`. The install line is the output of `peers.mjs` again. No source or test changed.

## Changes in 0.1.3

- Peer range only: `one-card` 0.3.0 (a skill of theirs is named, not addressed) is the release it is installed with. Peers: `one-card` is now `^0.3.0`. devDependencies gained `skill-uri-label`, `term-name-text`, so the installed units resolve in the tests. The install line is the output of `peers.mjs` again. No source or test of this unit changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/StakeholderContactHeader.tsx` (whole, 303 lines) to `src/StakeholderContactHeader.tsx`;
- `src/components/records/useHeaderRelations.ts` (whole, 140 lines) to `src/useHeaderRelations.ts`;
- `src/components/records/PersonPlacementChips.tsx` (whole, 47 lines) to `src/PersonPlacementChips.tsx`;
- `src/components/mynet/ContactKindChips.tsx` (whole, 275 lines) to `src/ContactKindChips.tsx`;
- `src/components/records/ContactCardSlots.tsx` lines 32 to 33 (`GILBAPP_CHIP_HELP`) to `src/gilbappChipHelp.ts`: the rest of that file is the card's slots, which need held notes and is not a unit.

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded); the numbers are token counts.
- `cardName` (76) and `OnlineCardController` (104) of `online-card` are the gilb-stakeholders originals; `PersonCard` (43) and `displayPlacements` (129) of `person-connections`; `ContactHeader` and `contactInitials` (120) of `contact-header` (all 20 declarations); `imageShapeOf` (43) of `stakeholder-ui-kit`; `useOnlineCardState` (105) of `one-card`; `placementChip` (63), `chipText` (22), `edgesToVault` (119), `headerRelations` (411) of `contact-kind-model`; `USER_VOCAB_KEY`, `readHeaderVocab` (47), `VocabUnreadableError` (24) and `readPredicateCurie` (157) of `contact-kind-catalogue`; `RemoveControl` (155) of `remove-control`; `ReachableVault` (59) of `plan-record-hooks`.
- `vaultLabel` of `vault-list` takes `{ name?: string | null; vaultId: string }` where the app's takes `ReachableVault` (a subtype of it); the body tokens are the same (132 = 132).
- `typeLocalName` is in three units. `lws-vault-sets`' is the app's `recordPlane.ts` function token for token (93 = 93) and is the one taken. `type-curie`'s and `named-type`'s are 97-token rewrites; run with the app's on 20,000 strings (CURIEs, `/base/t/` addresses, empty, a broken percent-encoding) they differ on none.
- `useRelations` is held only by `plan-stakeholder-io` (42 peers), which this unit does not take; it is a host member.

`src/index.ts` and `src/stakeholderContactHeaderHost.ts` are new.

## Tests

`src/*.test.ts*` (set-up in `test/`, not shipped). Hosts are `example.test` hosts, the people Ann, Ben, Cy and Dee. A fake host (`test/fakeHost.tsx`) stands for the app's six members: plain functions over data, and a real query for `useRelations`. No wall-clock waits: `waitFor` on a condition only.

- Ported from GilbApp: `StakeholderContactHeader.s5b.test.ts` 5 of 5 (`StakeholderContactHeader.data.test.ts`); `StakeholderContactHeader.s5c.test.tsx` 8 of 8 (`StakeholderContactHeader.relations.test.tsx`: the six `vi.mock`s are the fake host; the fixture is the master's answer with the example ontology host); `ContactKindChips.s8labels.test.tsx` 13 of 13 (`ContactKindChips.test.tsx`: imports only). `toHaveTextContent` is `textContent` containing the text (no `jest-dom`); the discovery fake answers `{ photoRef, personName }` (the unit reads no more).
- New: `StakeholderContactHeader.test.tsx` (36: the data helpers, the missing provider, the holder's face with `discoverVaultProfilePhoto` and `loadPhotoObjectUrl` called with their arguments and not called without a reference, the kept query options and key, their face with `loadGranteeFace`, the Where / How we met arguments in every state, the caption and badge, the image shape, the circles, the own picture, the chooser, the own card); `useHeaderRelations.test.tsx` (24 runs of 17 cases: exports, the "+ Relation" rule in eight cases, `useContactLabels` and `useRelations` arguments, when the vocabulary and each term are read and with which options); `PersonPlacementChips.test.tsx` (5); `exports.test.ts` (3); `hostAgnostic.test.ts` (4 cases, 13 runs).

Left out, with reasons: the page-level tests of the app that draw the whole record page with the header in it (`RecordDetail.s5bheader.test.tsx`, `RecordDetail.s4placement.test.tsx`, `RecordDetail.ownCard.o1.test.tsx`, `RecordDetail.s14labelsWiring.test.tsx`) and `ContactCardSlots.s8labels.test.tsx` (the slots of the card body): they go through the app's whole page. `lib/contact/headerRelations.s5c.test.ts` tests `headerRelations`, which is `contact-kind-model`'s.
