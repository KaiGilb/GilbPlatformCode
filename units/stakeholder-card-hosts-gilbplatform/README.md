# stakeholder-card-hosts-gilbplatform

The ready-made GilbPlatform host for the Stakeholder entry card: one provider that sets the platform's origins and the session and supplies every host the online stakeholder card needs, so it draws, reads and adds with no host object written.

## What this is

The ready-made GilbPlatform host for the Stakeholder entry card: one provider that sets the platform's origins and the session and supplies every host the online stakeholder card needs, so it draws, reads and adds with no host object written.

You mount `StakeholderCardGilbPlatformProvider` once, with the platform's origins, the signed-in `SessionCredential` and a few other values. Inside it `OnlineStakeholderCard` (the card of a person from the holder's circles who has no record) draws its header and its rows and offers "+ Add your own". The provider:

1. Sets, before any child renders and in this order: the base origin, the ontology origin, the system vault hosts, the own-card host labels, the optional settings, the session (`setLwsAuth(lwsAuthFromSession(session))`) and the type key. This is the order of `plan-card-hosts-gilbplatform`. An app that mounts both providers with the same props sets each singleton twice to the same value.
2. Makes a React Query client with the app's defaults (`staleTime` 30 s, no refetch on focus, `retry` 1), or uses yours.
3. Asks the photo term once, when it mounts (`createPhotoTermResolver` of `photo-term`, one per origin, with the provider's `origin` as the origin of the master, as the app passes its base origin).
4. Mounts six contexts. Three are the online stakeholder card's: the card's own (`OnlineStakeholderCardHostContext`), the contact header's (`StakeholderContactHeaderHostContext`) and the one card's (`OneCardHostContext`); the other three hosts the card needs are members of the first: `doors`, `person` and `vocabulary`. Three are the standalone Org units': the Employees group's (`OrgEmployeesHostContext` of `org-employees`, which `org-hierarchy` also reads), the mark's (`OrgMarkHostContext` of `org-mark`) and the pickers' query hook (`PickerQueryContext` of `record-picker`, which `org-hierarchy` reads). The hosts are the same objects for the provider's lifetime; the props that change are read at the time of each call.

One factory per host is exported too, for an app that wants to build a host itself: `createOnlineStakeholderCardHost`, `createStakeholderContactHeaderHost`, `createOneCardHost`, `createStakeholderListDoorsHost`, `createPersonCreateHost`, `createCardVocabularyHost`, and (0.2.0) `createCardReferencesHost`, `createOrgMarkHost`, `createOrgEmployeesHost` and `createPickerQuery`. Each returns exactly the interface of the unit that owns it. `card-references` takes its host as an argument of its two remove functions, not by a context, so the provider mounts nothing for it: call `createCardReferencesHost()` where you call `removeCardReference`.

### The vault list

The card needs the vaults the holder reaches, with the landing flag on one of them. The provider builds them the way GilbApp's `useVaults` did (`reachable-vaults`): the session's set is the membership, decorated by `GET /lws/vaults` when that answers, and lean (no entity, no landing flag) while the answer is out or has failed. They are read under GilbApp's own query key, `["base", "vaults", <principal>]`, so an app that already reads them shares the entry. Without a landing row the card cannot find the holder's own vault: its header is not drawn and "+ Add your own" is not offered. That is how GilbApp behaves too.

### The members

| Host | Member | Supplied by |
|---|---|---|
| `OnlineStakeholderCardHost` | `useShell` | this unit (`src/shell.ts`): the session of the credential, the vault list above, the content scope, your `onOpenRecord` |
| | `refreshOnlineStakeholders` | your prop; default nothing |
| | `photoReadKeysSync` | the photo-term resolver's `peek()?.readKeys ?? []` |
| | `doors`, `person`, `vocabulary` | the three factories below |
| `StakeholderListDoorsHost` | `requestsSent` | inline `() => 0` |
| | `heldRecordFreshMs` | inline `15_000` |
| | `heldRecordOf`, `useRecordsBeingDeleted` | inline copies (token-equal to GilbApp) |
| `PersonCreateHost` | `adderCardOf` | GilbApp's, whole: it finds the holder's own card, and makes a basic one in the landing vault when there is none (`ensureVaultSelfCard` of `vault-profile-photo`) |
| | `rememberCreatedIn` | inline copy (token-equal) |
| `CardVocabularyHost` | `masterKindReader` | `masterKindReader` of `plan-stakeholder-io` |
| | `persistVocabulary` | your prop, when given |
| `StakeholderContactHeaderHost` | `useRelations` | `useRelations` of `plan-stakeholder-io` |
| | `discoverVaultProfilePhoto`, `loadPhotoObjectUrl` | your props; defaults are those of `vault-profile-photo`, the first over the photo term's read keys |
| | `loadGranteeFace` | your prop; default is that of `grantee-face` |
| | `useHolderOriginLine`, `useContactLabels` | your props; defaults answer no line and no chips |
| `OneCardHost` | `isGeoEntityId` | inline, over your `geoOrigin` |
| | `placeClaimsKey`, `placeClaimsStaleMs` | inline (`["mynet", "place-claims", vaultId]`, `60_000`) |
| | `listPlaceClaimsInVault`, `claimsAbout`, `claimFieldText`, `loadPlaceNames` | your props; the card never calls them, and the defaults find nothing |
| `CardReferencesHost` (an argument, no context) | `changeRecordFactItems` | `changeRecordFactItems` of `record-fact-items`, from `createCardReferencesHost()` |
| `OrgMarkHost` (`OrgMarkHostContext`) | `downloadFileOutcome` | `downloadFileOutcome` of `file-download-outcome` |
| `OrgEmployeesHost` (`OrgEmployeesHostContext`) | `readResources` | inline copy of GilbApp's (token-equal), over `readRecord`, `mapWithConcurrency` (six in flight), `idFromResourceUri` and `entityUriInVault` |
| | `photoReadKeys` | the photo term's, shared with the header and the card (one ask for 60 s) |
| | `useSheetHistory`, `dropStaleSheetEntry` | those of `sheet-history` |
| | `RecordFace` | your prop, optional, fixed at mount; absent: the row draws no face and still shows the name and the titles |
| `PickerQueryContext` (a hook) | `usePickerQuery` | inline copy of the picker's `useQuery` call, with `retry: false` as the source's |

## Changes in 0.3.2

- devDependencies only: `contact-annotation`, the new peer of `stakeholder-contact-header` 0.1.1. The install line is the output of `peers.mjs` again: it now holds `contact-annotation`, and also `adder-card`, `held-notes`, `kind-relation`, `stated-by` and `vault-resources`, which the line had not yet listed since 0.3.1. No source or test change.

## Changes in 0.3.1

Package metadata only; no source or test change. The unit's `devDependencies` gain `held-notes` and the units of its peer tree, and the lockfile is refreshed (no third-party version changes), because `org-employees` 0.2.1 imports `subjectSpellings` and `inVault` from `held-notes`. The peer ranges of this unit are unchanged.

## What this is not

- Not the card: `OnlineStakeholderCard` is in `online-stakeholder-card`. This unit only supplies what it needs.
- Not a host for the record card, the Stakeholders list or the other Stakeholder units (see "Units this provider does not host yet"). It does host `card-references`, `org-mark`, `org-employees` and `org-hierarchy`, which stand alone.
- Not a router: opening a record is your page's act (`onOpenRecord`).
- Not the Plan cards' provider. It can stand beside `PlanCardsGilbPlatformProvider` with the same props.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-card-hosts-gilbplatform` prints. The line below includes `online-stakeholder-card`, the card this unit hosts:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/org-mark <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/sheet-history <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/grantee-face <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/plan-stakeholder-io <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/online-stakeholder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/org-employees <path-to-the-library>/units/stakeholder-card-hosts-gilbplatform
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The closure is 91 units besides this one. Of these, 18 are not in the closure of `online-stakeholder-card`: `card-references`, `entity-ref-value`, `file-download-outcome`, `file-words`, `grantee-face`, `org-employees`, `org-mark`, `org-terms`, `photo-term`, `plan-stakeholder-io`, `reachable-vaults`, `record-fact-items`, `record-picker`, `resource-id`, `sheet-history`, `vault-modes`, `vault-namespace` and `vault-profile-photo`. `org-hierarchy` is a dev dependency only (the tests draw it); the provider imports nothing of it.

## Styling

The units this provider draws ship no style sheet (`contact-header` aside): they draw with Tailwind v4 utility classes over the host's CSS variables. A taker runs Tailwind v4 with the installed units' sources in its `@source` scan (for example `@source "../node_modules/@kaigilb/*/src/**/*.{ts,tsx}";`, since installed copies in `node_modules` are not scanned on their own) and defines the variables the units read (`--ink`, `--ink-soft`, `--ink-faint`, `--accent`, `--accent-ink`, `--paper`, `--surface`, `--surface-sunken`, `--line`, `--warn`, `--bad`, `--serif`); without it the photos draw at their natural size and the layout collapses. `apps/stakeholder-card-taking-app/styles/app.css` is a working example.

## Example

The one complete wiring, with every prop. It is type-checked with the unit and rendered by `src/example.test.tsx` (`test/example.tsx`). Every value that names a place is a placeholder; yours are your own.

```tsx
// The one complete wiring of the Stakeholder entry card on GilbPlatform: the provider with every prop, and the card inside it. It is
// type-checked with the unit and rendered by `src/example.test.tsx`. Every value that names a place is a placeholder; yours are your own.
import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

export function StakeholderScreen({ session, principal }: {
  session: SessionCredential; // after sign-in: the SessionCredential of the sign-in unit
  principal: string; //          the person whose online card to draw (their principal)
}) {
  const [myClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <StakeholderCardGilbPlatformProvider
      origin="https://example.test" //                                       required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //             required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //               required: hosts besides the origin's family that may be read at their own address (they never get your credential)
      systemHostLabels={["id", "ontology"]} //                               required: first labels of the platform's own hosts
      session={session} //                                                   required: signs every request
      geoOrigin="https://geo.example.test" //                                required: the origin of the shared world catalogue
      viewedVaultId={null} //                                                optional: the vault your screen shows (the content scope's readVaultId)
      refreshOnlineStakeholders={() => {}} //                                optional: draw your online list again (called before a record is opened)
      onOpenRecord={(id) => void id} //                                      optional: open a record in your page; absent, the card stays in place after "+ Add your own"
      queryClient={myClient} //                                              optional: your own client (its defaults are yours); absent, the provider makes one
      persistVocabulary={() => true} //                                      optional: whether the card vocabulary is kept on this device
      discoverVaultProfilePhoto={async () => ({ photoRef: null })} //        optional: finds the photo of a vault's profile; absent, the unit's own
      loadPhotoObjectUrl={async () => null} //                               optional: loads a photo as an object URL; absent, the unit's own
      loadGranteeFace={async () => null} //                                  optional: loads the face of a person who shares one with the viewer; absent, the unit's own
      useHolderOriginLine={() => ({ origin: null, loading: false })} //      optional HOOK: the "Where / How we met" line; absent, none
      useContactLabels={() => ({ chips: null, offered: { circleLabel: [], relationshipKind: [] }, offersLoading: false, catalogueNote: null, actError: null, add: async () => false, entryPredicates: new Map() })} // optional HOOK: the kind chips; absent, none
      listPlaceClaimsInVault={async () => []} //                             optional: the four place members of the one card (the entry never calls them)
      claimsAbout={() => []}
      claimFieldText={() => ""}
      loadPlaceNames={async () => []}
      RecordFace={() => null} //                                             optional: the face of a record in the Employees group (org-employees); absent, no face
      settings={{
        localRigHosts: [], //                                                optional: bare host names of a local development rig
        ontologyApiOrigin: "https://ontology.platform.example.test", //      optional: the origin that answers the public term search
        minOntologyQuery: 3, //                                              optional: the shortest query that reaches the ontology
        vocabTypeBatchRevisions: "", //                                      optional: platform revisions that serve the batched vocabulary read
        publicCorpusOrigin: "https://corpus.example.test", //                optional: the public term corpus for a rig with no ontology
      }}
    >
      <OnlineStakeholderCard principal={principal} placementMode="content" />
    </StakeholderCardGilbPlatformProvider>
  );
}
```

## Props

Required:

| Prop | What it is |
|---|---|
| `origin` | The platform's vault origin (`https://host`, no path). Every vault address and type URI derives from it, and the photo term is read from it. A malformed one throws the setter's error. |
| `ontologyOrigin` | The origin that serves the ontology's terms (GilbVeda). |
| `systemVaultHosts` | Bare host names, besides the origin's own family, that may be read at their own address. They never receive your credential. |
| `systemHostLabels` | The first labels of the platform's own hosts on a person vault's apex (`id` for `id.example.test`), for the own-card rule. |
| `session` | The signed-in `SessionCredential`. Every request is signed with it, only for a URL inside the platform's family. |
| `geoOrigin` | The origin of the shared world catalogue (the GilbGeo vault). An address under its `/base/e/` is a catalogue row. |
| `children` | What to draw, normally `OnlineStakeholderCard`. |

Optional:

| Prop | What it does | Default |
|---|---|---|
| `viewedVaultId` | The vault your screen shows; the content scope's `readVaultId`. Read at each render. | `null` |
| `refreshOnlineStakeholders` | Draws your online list again. The card calls it before it opens a record. Read at each call. | nothing |
| `onOpenRecord` | Opens a record of the holder's by its id in your page (GilbApp's `openRecordFromList`). Read at each call. | nothing: the card stays in place after "+ Add your own" |
| `queryClient` | A client you own. It is used as it is; its defaults are yours. | the provider makes one with the app's defaults |
| `persistVocabulary` | Whether the card vocabulary is kept on this device. Passed to the vocabulary host. | kept |
| `discoverVaultProfilePhoto`, `loadPhotoObjectUrl`, `loadGranteeFace` | The photo members of the header. Read at each call. | the units': `vault-profile-photo` (the first over the photo term's keys) and `grantee-face` |
| `useHolderOriginLine` | A hook: the "Where / How we met" line. Fixed at mount. | no line |
| `useContactLabels` | A hook: the kind chips. Fixed at mount. | no chips |
| `listPlaceClaimsInVault`, `claimsAbout`, `claimFieldText`, `loadPlaceNames` | The four place members of the one card. The online stakeholder card never calls them. Read at each call. | find nothing |
| `RecordFace` | A component: the face of a record in the Employees group's rows (`org-employees`). Fixed at mount. | none: no face |
| `settings` | `localRigHosts`, `ontologyApiOrigin`, `ontologyApiOriginRaw`, `minOntologyQuery`, `vocabTypeBatchRevisions`, `publicCorpusOrigin`: the optional platform settings, as `plan-card-hosts-gilbplatform` takes them. `dpopProofOrigin` (since 0.3.0): the identity host that `origin` forwards to. A request sent to `origin` is signed for that host (path kept, query dropped); a request sent to a vault host is signed for that vault host. Set it only when `origin` is an apex that a front door forwards to the identity host (the server compares a proof with the host it received). Never a vault host. | the units' defaults |

## What the host must supply

Nothing besides these props: this unit is the host. Every member of the host interfaces is in the table above; a member that is a prop has a default.

## Differences from GilbApp

- **"+ Add your own" makes the holder's own card, as GilbApp does (0.2.0).** In 0.1.0 a holder with no card of their own was refused with `NO_OWN_CARD_SAYS`; that sentence is gone, and so is its export. `adderCardOf` is now GilbApp's whole (token-equal, see "Where it came from"): with no landing vault it refuses with `NO_OWN_VAULT_SAYS`; with a card it answers the card; with none it makes a basic one in the landing vault only (`ensureVaultSelfCard` of `vault-profile-photo`: `POST /lws/vault/<vaultId>/selfcard`, signed with DPoP, named by the sign-in email when one is given, else by the vault's label), reads it back, drops the finding so the next ask finds the card, and answers its address. The three refusals the source still makes keep the source's words: "Your own vault could not be addressed, ...", "Your own card could not be made, ... (cause)" and "Your own card was made but could not be read back, ...". Three adds at once make one card.
- **Photos are the units' (0.2.0).** `discoverVaultProfilePhoto` and `loadPhotoObjectUrl` come from `vault-profile-photo`, `loadGranteeFace` from `grantee-face`; your props still override them. The discovery's host has the photo term's read keys (the app's `photoReadKeys`: one ask shared for 60 s, the last answer that worked when the master fails, else none with the source's warning). It has no `noteVaultPicture`: that is the app's note of which vaults have a picture, and the card needs none. `tellIfKeysChanged`, the app's tell to its synchronous readers, is not taken: this unit's synchronous read is the resolver's `peek()`.
- **No held notes.** `useHolderOriginLine` and `useContactLabels` are MyNet libraries. Without your own, the header draws no "Where / How we met" line and no kind chips. The default of `useContactLabels` is the value of GilbApp's hook in its disabled branch, the only one this card reaches (see "Not measured").
- **The content scope has no `reach`.** The shell's `contentScope` is `{ readVaultId: viewedVaultId ?? null, reach: null }`. In GilbApp `reach` is the viewed vault's row; the card's `ownVaultIdOf` reads it as the holder's own vault's row. With `reach` null, `ownVaultIdOf` falls back to the vault flagged as landing in the decorated list, which is the holder's own. The card does not read `readVaultId`.
- **`onOpenRecord` is yours.** The card opens a record after a create through `openRecordFromList`. Without `onOpenRecord` nothing opens: the card stays in place and the new card is not shown until you open it.
- **The online list is yours.** `refreshOnlineStakeholders` draws your online Stakeholders list again. No unit holds that list, so the default is nothing.
- **The request meter is off.** GilbApp counted requests by wrapping the page's `fetch`, which a library does not do. `requestsSent` is `() => 0`, so the reader's per-screen request budget starts from 0.
- **Held-address place members.** The four place members default to finding nothing. This is exact for the online stakeholder card, which passes no address to the one card. A record card would need the MyNet place libraries.
- **The standalone units' hosts (0.2.0).** `RecordFace`, the face of a record in the Employees group, is the one member of those hosts that is yours: it is GilbApp's `RecordFace` component, in no unit, and the unit lets a host leave it out. The rest is the units'.

## Units this provider does not host yet

0.2.0 hosts the standalone Org units whose hosts a unit now holds: `card-references` (a factory: it takes its host as an argument), `org-mark`, `org-employees` and `org-hierarchy` (which reads the Employees host's `useSheetHistory` and `dropStaleSheetEntry`, the mark's host and the pickers' query hook; the provider's query client serves its `useQuery`). Each is drawn in this unit's tests inside the provider alone.

Not mounted by this provider, because the entry card does not use them: `contact-rows`, `stakeholder-set-fields` and `stakeholder-find`.

## Not yet proven live

This unit is proven against a fake platform in its tests. The live check in the test vault, under a person's sign-in, is still owed. It must show:

1. **The decorated vault list.** `GET /lws/vaults` answers with the landing flag on the holder's own vault, and the session's `vault.id` equals one of its `vaultId` values. Without that the header and the add act are not offered (the lean rows have no landing flag).
2. **The header.** The holder's vault and name on the left, the circle chips, the person's name and initials on the right.
3. **The photos (0.2.0).** The holder's vault photo is drawn when the vault has one (discovery finds it by the photo term's keys, the bytes come with the signed read), and the person's photo when their online card shares one.
4. **The card body.** The person's rows, marked as theirs, in the order of the person kind.
5. **One add.** "+ Add your own" with an own card makes the person's card in the holder's own vault, links it, and calls `onOpenRecord` with its id.
6. **One add with no own card (0.2.0).** The same act for a holder with no card makes the basic card first (`POST …/selfcard`, 201), then the person.
7. **The standalone units (0.2.0).** An organization card draws its Employees, its Units and a logo through the provider's hosts; Back closes the full-list sheet.

## Not measured

- The default of `useContactLabels` against GilbApp's hook in its disabled branch: read in the source (`lib/contact/useContactLabels.ts`, `on` false, so `chips` null, `offered` empty, `offersLoading` false, `catalogueNote` null, `actError` null, no entry predicates), not run. The source's `add` is never reached by this card; the default answers false.
- The photo term's resolver against the private `gilb-photo` package it was cut from.
- Whether `session.vault.id` equals a `vaults[].vaultId` on the live platform (see above).
- The photos and the self-card door against the live platform: the fake platform answers `POST …/selfcard` and `/files/<id>` as the source's tests read them, not as the platform does.

## Module state

- `src/photoTerm.ts`: one photo-term resolver per origin, kept for the life of the module (the app's `photoTerm` was one for the page). `__resetPhotoTermResolvers()` forgets them; it is a test seam, never called by product code.
- `src/adderCard.ts`: a `WeakMap` of the findings and makings in flight, per query client.
- `src/photoTerm.ts`: one shared ask of the photo term per resolver (a `WeakMap`), for 60 s.
- The units this unit hosts keep their own state: `grantee-face` (the faces, per viewer; `resetGranteeFaces()` on sign-out), `vault-profile-photo` (the photo in memory), `record-fact-items` (a queue per record), `sheet-history` and the Org units' term caches.
- The settings (`setBaseOrigin`, `setTermOrigin`, `setSystemVaultHosts`, `setSystemHostLabels`, `setLwsAuth`, `setTypeKey`) are the singletons of their own units; this unit sets them.

Install this unit once. Two copies would each keep their own resolver and findings.

## Do not

- Do not pass a vault list of your own: the provider builds it.
- Do not mount the card with no landing vault in the session's list and expect a header: see "The vault list".
- Do not call `__resetPhotoTermResolvers` from product code.
- Do not mount a second `OrgEmployeesHostContext`, `OrgMarkHostContext` or `PickerQueryContext` provider inside this one unless you mean to replace the host.

## Wrong readings

- "The add refuses when the holder has no card." It does not (0.2.0): it makes the basic card in the landing vault, as GilbApp does. It refuses only for the source's three reasons.
- "The photo of the person is drawn by my code." It is drawn by the units' loaders unless you pass your own.
- "The provider mounts a host for `card-references`." It does not: the unit takes its host as an argument; call `createCardReferencesHost()`.
- "`onOpenRecord` is the card's own navigation." It is yours; without it the card stays in place.
- "`contentScope.reach` is the viewed vault." Here it is null; the viewed vault is `readVaultId`.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`. This unit is new composition code, not an extraction. The few expressions it copies from GilbApp are in `src/inline.ts`, `src/adderCard.ts` and `src/photoTerm.ts`, each cited `path:line` in a comment and listed in `unit.json`:

- `src/lib/base/recordHooks.ts` line 449 (`HELD_RECORD_FRESH_MS`), 456-462 (`heldRecordOf`), 2609-2630 (`useRecordsBeingDeleted`), 2836-2845 (`createdInVaultKey`, `rememberCreatedIn`).
- `src/lib/mynet/place/usePlaceClaims.ts` lines 50-52 (`placeClaimsKey`, `PLACE_CLAIMS_STALE_MS`).
- `src/lib/mynet/geo/baseGeo.ts` lines 61-64 and 82-84 (`isGeoEntityId`, over the `geoOrigin` prop).
- `src/lib/base/adderCard.ts` lines 29-41, 43-55, 57-66, 68-88 and 98-110 (`adderCardOf` whole, since 0.2.0).
- `src/lib/base/photoTerm.ts` lines 19-22 and 74-76 (the resolver and `photoReadKeysSync`), and since 0.2.0 lines 32, 37-41 and 48-64 (`photoReadKeys`).
- `src/lib/mynet/place/lws.ts` lines 57-71 and 164-170 (`getResource`, `readResources`), and `src/components/records/orgCard/OrgRecordPicker.tsx` lines 144-150 (the pickers' query hook).
- `src/main.tsx` lines 72-76 (the query defaults).

Token comparison (comment-stripped, the declaration against the app's): `heldRecordOf` 94/94, `useRecordsBeingDeleted` 162/162, `rememberCreatedIn` 48/48, `createdInVaultKey` 19/19, `placeClaimsKey` 19/19, `PLACE_CLAIMS_STALE_MS` 5/5, `HELD_RECORD_FRESH_MS` 5/5, `landingVaultOf` 38/38, `readFinding` 53/53, `NoOwnVaultError` 22/22, `NO_OWN_VAULT_SAYS` 5/5, and (0.2.0) `nameFromEmail` 118/118, `findOrMake` 160/160, `adderCardOf` 174/174, `readResources` 90/90: equal. `isGeoEntityId` differs by construction: it takes the prefix from the `geoOrigin` prop. `askPhotoReadKeys` (73 against 83 tokens) differs by the resolver being a parameter and by `tellIfKeysChanged` being left out; `photoReadKeys` is shared per resolver, not per module. `getResource` (inlined `resourceOf`, no etag) is not token-equal; its behaviour is the same for what `readResources` reads.

Named changes, and only these:

1. `isGeoEntityId` is the app's test over `geoOrigin + "/base/e/"`, the origin a prop with its trailing slashes dropped (the source's `GEO_ORIGIN`); no host is named.
2. (0.1.0 only) `adderCardOf` was the find half with a refusal where the card is made. In 0.2.0 it is the source's, whole, with no change.
3. The photo-term resolver's origin is the provider's `origin` prop, where the app's was `BASE_ORIGIN`; one resolver per origin.
4. `useShell` is built from the credential's session, the `useVaults` of `reachable-vaults` and the props above, where the app's came from its shell context.
5. Comments: cycle, ticket and person tags are removed or reworded; no code changed.
6. (0.2.0) The photo term's read keys are `photoReadKeysOf(resolver)`: the source's function over the resolver it is given, one shared ask per resolver. The standalone Org units' hosts are the units' members and two inline copies (`readResources`, `usePickerQuery`).

Tests (`src/*.test.ts*`, 135): `card.test.tsx` 22 (the card inside the provider alone: header, rows, signed reads, refusal, actions pane, decorated and lean vault lists, the add with an own card, the add with NO own card (a selfcard `POST`, then the create, both with DPoP), a card that cannot be made, the add of a person already held, the credential gate, the missing provider, the header's photos drawn through the real loaders over the fake world, the held-note and place defaults and spies); `provider.test.tsx` 30 (settings and their order, what it mounts including the three Org contexts and `RecordFace`, the shell, the photo term, the required props, a changed geoOrigin); `hosts.test.tsx` 19 (the ten factories at the type level and at run time, the standalone units' hosts, `useRecordsBeingDeleted`); `standalone.test.tsx` 10 (`org-mark`, `org-employees`, `org-hierarchy` and `card-references` each drawn or called inside the provider alone); `adderCard.test.ts` 16; `inline.test.ts` 14; `photoTerm.test.ts` 11; `both.test.tsx` 2 (both providers with the same props); `example.test.tsx` 1; `hostAgnostic.test.ts` 10 (copied). The world is `test/world.ts`: a fake `fetch` over the master and platform fixtures of `person-create` (copied into `test/`), the connect routes of the card, the self-card door, a file route and a fake `SessionCredential`.
