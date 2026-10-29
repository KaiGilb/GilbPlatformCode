# stakeholder-card-hosts-gilbplatform

The ready-made GilbPlatform host for the Stakeholder entry card: one provider that sets the platform's origins and the session and supplies every host the online stakeholder card needs, so it draws, reads and adds with no host object written.

## What this is

The ready-made GilbPlatform host for the Stakeholder entry card: one provider that sets the platform's origins and the session and supplies every host the online stakeholder card needs, so it draws, reads and adds with no host object written.

You mount `StakeholderCardGilbPlatformProvider` once, with the platform's origins, the signed-in `SessionCredential` and a few other values. Inside it `OnlineStakeholderCard` (the card of a person from the holder's circles who has no record) draws its header and its rows and offers "+ Add your own". The provider:

1. Sets, before any child renders and in this order: the base origin, the ontology origin, the system vault hosts, the own-card host labels, the optional settings, the session (`setLwsAuth(lwsAuthFromSession(session))`) and the type key. This is the order of `plan-card-hosts-gilbplatform`. An app that mounts both providers with the same props sets each singleton twice to the same value.
2. Makes a React Query client with the app's defaults (`staleTime` 30 s, no refetch on focus, `retry` 1), or uses yours.
3. Asks the photo term once, when it mounts (`createPhotoTermResolver` of `photo-term`, one per origin, with the provider's `origin` as the origin of the master, as the app passes its base origin).
4. Mounts three contexts: the card's own (`OnlineStakeholderCardHostContext`), the contact header's (`StakeholderContactHeaderHostContext`) and the one card's (`OneCardHostContext`). The other three hosts the card needs are members of the first: `doors`, `person` and `vocabulary`. The hosts are the same objects for the provider's lifetime; the props that change are read at the time of each call.

One factory per host is exported too, for an app that wants to build a host itself: `createOnlineStakeholderCardHost`, `createStakeholderContactHeaderHost`, `createOneCardHost`, `createStakeholderListDoorsHost`, `createPersonCreateHost` and `createCardVocabularyHost`. Each returns an object of exactly the interface of the unit that owns it.

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
| `PersonCreateHost` | `adderCardOf` | the find half of GilbApp's (see "Differences") |
| | `rememberCreatedIn` | inline copy (token-equal) |
| `CardVocabularyHost` | `masterKindReader` | `masterKindReader` of `plan-stakeholder-io` |
| | `persistVocabulary` | your prop, when given |
| `StakeholderContactHeaderHost` | `useRelations` | `useRelations` of `plan-stakeholder-io` |
| | `discoverVaultProfilePhoto`, `loadPhotoObjectUrl`, `loadGranteeFace` | your props; defaults answer no photo |
| | `useHolderOriginLine`, `useContactLabels` | your props; defaults answer no line and no chips |
| `OneCardHost` | `isGeoEntityId` | inline, over your `geoOrigin` |
| | `placeClaimsKey`, `placeClaimsStaleMs` | inline (`["mynet", "place-claims", vaultId]`, `60_000`) |
| | `listPlaceClaimsInVault`, `claimsAbout`, `claimFieldText`, `loadPlaceNames` | your props; the card never calls them, and the defaults find nothing |

## What this is not

- Not the card: `OnlineStakeholderCard` is in `online-stakeholder-card`. This unit only supplies what it needs.
- Not a host for the record card, the Stakeholders list, the organization card or the other Stakeholder units (see "Units this provider does not host yet").
- Not a router: opening a record is your page's act (`onOpenRecord`).
- Not the Plan cards' provider. It can stand beside `PlanCardsGilbPlatformProvider` with the same props.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-card-hosts-gilbplatform` prints. The line below includes `online-stakeholder-card`, the card this unit hosts:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/plan-stakeholder-io <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/online-stakeholder-card <path-to-the-library>/units/stakeholder-card-hosts-gilbplatform
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The closure is 79 units besides this one. Of these, 6 are not in the closure of `online-stakeholder-card`: `entity-ref-value`, `photo-term`, `plan-stakeholder-io`, `reachable-vaults`, `record-picker` and `vault-modes`.

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
      discoverVaultProfilePhoto={async () => ({ photoRef: null })} //        optional: finds the photo of a vault's profile; absent, initials
      loadPhotoObjectUrl={async () => null} //                               optional: loads a photo as an object URL; absent, none
      loadGranteeFace={async () => null} //                                  optional: loads the face of a person who shares one with the viewer; absent, none
      useHolderOriginLine={() => ({ origin: null, loading: false })} //      optional HOOK: the "Where / How we met" line; absent, none
      useContactLabels={() => ({ chips: null, offered: { circleLabel: [], relationshipKind: [] }, offersLoading: false, catalogueNote: null, actError: null, add: async () => false, entryPredicates: new Map() })} // optional HOOK: the kind chips; absent, none
      listPlaceClaimsInVault={async () => []} //                             optional: the four place members of the one card (the entry never calls them)
      claimsAbout={() => []}
      claimFieldText={() => ""}
      loadPlaceNames={async () => []}
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
| `discoverVaultProfilePhoto`, `loadPhotoObjectUrl`, `loadGranteeFace` | The photo members of the header (GilbApp code in no unit). Read at each call. | no photo: initials |
| `useHolderOriginLine` | A hook: the "Where / How we met" line. Fixed at mount. | no line |
| `useContactLabels` | A hook: the kind chips. Fixed at mount. | no chips |
| `listPlaceClaimsInVault`, `claimsAbout`, `claimFieldText`, `loadPlaceNames` | The four place members of the one card. The online stakeholder card never calls them. Read at each call. | find nothing |
| `settings` | `localRigHosts`, `ontologyApiOrigin`, `ontologyApiOriginRaw`, `minOntologyQuery`, `vocabTypeBatchRevisions`, `publicCorpusOrigin`: the optional platform settings, as `plan-card-hosts-gilbplatform` takes them. | the units' defaults |

## What the host must supply

Nothing besides these props: this unit is the host. Every member of the six host interfaces is in the table above; a member that is a prop has a default.

## Differences from GilbApp (v1)

- **"+ Add your own" does not make the holder's own card.** GilbApp's `adderCardOf` finds the holder's own card in the landing vault and, when there is none, makes a basic one (`ensureVaultSelfCard`, then `POST …/selfcard`). The make half is in no unit. This version has the find half only. A holder with no own card of their own is told, in one sentence (`NO_OWN_CARD_SAYS`, exported): "You have no card of your own in your vault yet, so make your own card there first, then add this person." and nothing is written. A holder with no landing vault in the list gets the source's sentence (`NO_OWN_VAULT_SAYS`, exported). When the finding is "no card", it is forgotten (`invalidateQueries` of `ownCardFindingKey`, which GilbApp did after it made a card), so that the holder who then makes their card is not told again that they have none. The make half is a later batch.
- **No photos.** `discoverVaultProfilePhoto`, `loadPhotoObjectUrl` and `loadGranteeFace` are GilbApp code in no unit. Without your own, the header draws initials for the holder's vault and nothing of their photo. They are extracted in a later batch.
- **No held notes.** `useHolderOriginLine` and `useContactLabels` are MyNet libraries. Without your own, the header draws no "Where / How we met" line and no kind chips. The default of `useContactLabels` is the value of GilbApp's hook in its disabled branch, the only one this card reaches (see "Not measured").
- **The content scope has no `reach`.** The shell's `contentScope` is `{ readVaultId: viewedVaultId ?? null, reach: null }`. In GilbApp `reach` is the viewed vault's row; the card's `ownVaultIdOf` reads it as the holder's own vault's row. With `reach` null, `ownVaultIdOf` falls back to the vault flagged as landing in the decorated list, which is the holder's own. The card does not read `readVaultId`.
- **`onOpenRecord` is yours.** The card opens a record after a create through `openRecordFromList`. Without `onOpenRecord` nothing opens: the card stays in place and the new card is not shown until you open it.
- **The online list is yours.** `refreshOnlineStakeholders` draws your online Stakeholders list again. No unit holds that list, so the default is nothing.
- **The request meter is off.** GilbApp counted requests by wrapping the page's `fetch`, which a library does not do. `requestsSent` is `() => 0`, so the reader's per-screen request budget starts from 0.
- **Held-address place members.** The four place members default to finding nothing. This is exact for the online stakeholder card, which passes no address to the one card. A record card would need the MyNet place libraries.

## Units this provider does not host yet

The standalone units that need a host this unit does not supply:

- `card-references` (`CardReferencesHost.changeRecordFactItems`, for its two remove functions): the record-fact change queue is in no unit.
- `org-employees` (`OrgEmployeesHost.useSheetHistory`, `dropStaleSheetEntry`): the browser history code is in no unit.
- `org-mark` (`OrgMarkHost.downloadFileOutcome`): the file download is in no unit.

`contact-rows`, `stakeholder-set-fields`, `stakeholder-find` and `org-hierarchy` are not mounted by this provider either; the entry card does not use them.

## Not yet proven live

This unit is proven against a fake platform in its tests. The live check in the test vault comes next. It must show:

1. **The decorated vault list.** `GET /lws/vaults` answers with the landing flag on the holder's own vault, and the session's `vault.id` equals one of its `vaultId` values. Without that the header and the add act are not offered (the lean rows have no landing flag).
2. **The header.** The holder's vault and name on the left, the circle chips, the person's name and initials on the right.
3. **The card body.** The person's rows, marked as theirs, in the order of the person kind.
4. **One add.** "+ Add your own" with an own card makes the person's card in the holder's own vault, links it, and calls `onOpenRecord` with its id.

## Not measured

- The default of `useContactLabels` against GilbApp's hook in its disabled branch: read in the source (`lib/contact/useContactLabels.ts`, `on` false, so `chips` null, `offered` empty, `offersLoading` false, `catalogueNote` null, `actError` null, no entry predicates), not run. The source's `add` is never reached by this card; the default answers false.
- The photo term's resolver against the private `gilb-photo` package it was cut from.
- Whether `session.vault.id` equals a `vaults[].vaultId` on the live platform (see above).

## Module state

- `src/photoTerm.ts`: one photo-term resolver per origin, kept for the life of the module (the app's `photoTerm` was one for the page). `__resetPhotoTermResolvers()` forgets them; it is a test seam, never called by product code.
- `src/adderCard.ts`: a `WeakMap` of the findings in flight, per query client.
- The settings (`setBaseOrigin`, `setTermOrigin`, `setSystemVaultHosts`, `setSystemHostLabels`, `setLwsAuth`, `setTypeKey`) are the singletons of their own units; this unit sets them.

Install this unit once. Two copies would each keep their own resolver and findings.

## Do not

- Do not pass a vault list of your own: the provider builds it.
- Do not mount the card with no landing vault in the session's list and expect a header: see "The vault list".
- Do not call `__resetPhotoTermResolvers` from product code.

## Wrong readings

- "The add makes the holder's own card if there is none." It does not (v1): it tells the holder to make it first.
- "The photo of the person is drawn." Only if you give `loadGranteeFace`.
- "`onOpenRecord` is the card's own navigation." It is yours; without it the card stays in place.
- "`contentScope.reach` is the viewed vault." Here it is null; the viewed vault is `readVaultId`.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`. This unit is new composition code, not an extraction. The few expressions it copies from GilbApp are in `src/inline.ts`, `src/adderCard.ts` and `src/photoTerm.ts`, each cited `path:line` in a comment and listed in `unit.json`:

- `src/lib/base/recordHooks.ts` line 449 (`HELD_RECORD_FRESH_MS`), 456-462 (`heldRecordOf`), 2609-2630 (`useRecordsBeingDeleted`), 2836-2845 (`createdInVaultKey`, `rememberCreatedIn`).
- `src/lib/mynet/place/usePlaceClaims.ts` lines 50-52 (`placeClaimsKey`, `PLACE_CLAIMS_STALE_MS`).
- `src/lib/mynet/geo/baseGeo.ts` lines 61-64 and 82-84 (`isGeoEntityId`, over the `geoOrigin` prop).
- `src/lib/base/adderCard.ts` lines 29-41, 57-66 and 98-110 (the find half of `adderCardOf`).
- `src/lib/base/photoTerm.ts` lines 19-22 and 74-76 (the resolver and `photoReadKeysSync`).
- `src/main.tsx` lines 72-76 (the query defaults).

Token comparison (comment-stripped, the declaration against the app's): `heldRecordOf` 94/94, `useRecordsBeingDeleted` 162/162, `rememberCreatedIn` 48/48, `createdInVaultKey` 19/19, `placeClaimsKey` 19/19, `PLACE_CLAIMS_STALE_MS` 5/5, `HELD_RECORD_FRESH_MS` 5/5, `landingVaultOf` 38/38, `readFinding` 53/53, `NoOwnVaultError` 22/22, `NO_OWN_VAULT_SAYS` 5/5: equal. `isGeoEntityId` differs by construction: it takes the prefix from the `geoOrigin` prop. `adderCardOf` differs where `findOrMake` is replaced by the find half.

Named changes, and only these:

1. `isGeoEntityId` is the app's test over `geoOrigin + "/base/e/"`, the origin a prop with its trailing slashes dropped (the source's `GEO_ORIGIN`); no host is named.
2. `adderCardOf` is the find half; the make branch is a refusal with `NO_OWN_CARD_SAYS`, and the finding is forgotten when there is no card.
3. The photo-term resolver's origin is the provider's `origin` prop, where the app's was `BASE_ORIGIN`; one resolver per origin.
4. `useShell` is built from the credential's session, the `useVaults` of `reachable-vaults` and the props above, where the app's came from its shell context.
5. Comments: cycle, ticket and person tags are removed or reworded; no code changed.

Tests (`src/*.test.ts*`, 100): `card.test.tsx` 20 (the card inside the provider alone: header, rows, signed reads, refusal, actions pane, decorated and lean vault lists, the add with an own card, the add with none, the add of a person already held, the credential gate, the missing provider, the held-note and place defaults and spies); `provider.test.tsx` 28 (settings and their order, what it mounts, the shell, the photo term, the required props, a changed geoOrigin); `hosts.test.tsx` 14 (the six factories at the type level and at run time, `useRecordsBeingDeleted`); `adderCard.test.ts` 11; `inline.test.ts` 9; `photoTerm.test.ts` 5; `both.test.tsx` 2 (both providers with the same props); `example.test.tsx` 1; `hostAgnostic.test.ts` 10 (copied). The world is `test/world.ts`: a fake `fetch` over the master and platform fixtures of `person-create` (copied into `test/`), the connect routes of the card and a fake `SessionCredential`.
