# one-card

Draws a stakeholder card as one merged card per person, with the holder's rows and the person's rows in one frame.

## What this is

Draws a stakeholder card as one merged card per person, with the holder's rows and the person's rows in one frame.

The body of a person card and the pieces it stands on. When the record is linked to the person's online card, their published rows are placed in the card's own groups, shaded and marked with the chain link; the holder's rows stay plain; the foot says "Connected to their online card." with a quiet Unlink. When the record is not linked, it is the same body with one source: the card's own groups and editors as they are, and a foot with the Find ("Find their online card").

- `OneCardBody(props)`: the body. `props.controller` is the card's online card controller (null: the card's own groups alone); `children` are the card's own groups. It draws the status line of their card while it is not ready ("Loading their online card…", busy, unavailable, sign in again, cannot be opened, an organization's card) with "Try again" for busy and unavailable; the places of their card that are geo addresses are taken off the card and handed to the Details panel (`publishTheirPlaces`). Its props are `OneCardBodyProps`: `controller`, `labelFor`, `searchName`, `canWrite`, `fieldOrder`, `servedFacts`, `skillPredicate`, `groupOf`, `skip`, `order`, `personCard`, `addressPredicate?`, `addressVaultId?`, `addressSubject?`, `recordUri?`, `children`.
- `OneCardOwnGroups({ labelFor })`: the groups of their card that the card draws nowhere else, each a group of its own.
- `isTheirPlaceGroup(host, group, groupOf)`: whether a group of their card is a place group (every value of theirs is a geo address, and the card draws it in no group of its own).
- `NoOnlineCardFoot({ controller, state, searchName, canWrite })` and `GlobeIcon`: the foot of a card with no online card, and the Find it opens (name search, each person with the contact points they publish, "This is them: connect"). Esc closes the Find from every state of the foot.
- `ConnectedMarker({ connected })`: the small "Connected" marker a list row shows.
- `useOnlineCardController({ enabled, record, vaultId, holder, canWrite })`: ONE controller per open card (record, holder, vault, write right), made only for a record read whole; a link write forgets the list's kept finds, the shared resolver answer, and reads the record again.
- `useOnlineCardState(controller)`: the controller's state as a React value; one `load()` when the card opens.
- `usePersonCard({ controller, recordUri, holder, ownVaultId })`: the person card resolver for one open card; reads nothing for a record that is not linked.
- `noteConnected`, `connectedKnown`, `useConnected`, `__resetConnectedRecords`: the session's memory of which records are connected (see "Module state").
- `publishTheirPlaces`, `useTheirPlaces`, `__resetTheirPlaces`, the type `TheirPlaceGroup`: the places the open card hands to the Details panel (see "Module state").
- `ONLINE_CARD_LINK_KEY` ("sameAs"), `isOnlineCardLinkKey`, `onlineCardLabelFor`, `useOnlineCardLabelFor`: the words a field of their card is shown with, and the one fact key the card keeps to itself.
- `ownAddressOf(host, claim, places)`, `useHeldAddresses(enabled, vaultId, subject)`: the holder's held addresses of this person, as the merge takes them.
- `OneCardHostContext`, `useOneCardHost`, and the types `OneCardHost`, `PlaceClaim`, `GeoPlace`, `PlaceTextTerm`: the host (see "What the host must supply").

Test ids: `one-card`, `one-card-status`, `one-card-retry`, `one-card-error`, `one-card-find-foot`, `one-card-find-error`, `online-card-find`, `online-card-find-open`, `online-card-find-input`, `online-card-find-submit`, `online-card-find-cancel`, `online-card-find-error`, `online-card-find-empty`, `online-card-find-cut`, `online-card-candidates`, `online-card-candidate`, `online-card-candidate-contact`, `online-card-connect`, `connected-marker`; and those of `OneCardFoot` of `one-card-rows`.

## What this is not

- Not the merge: which rows are theirs, yours or the same is `mergeOneCard` of `one-card-merge`, and the placing of the rows in the card's groups is `one-card-context`. This unit draws the body and runs the card's controller.
- Not a writer of their card: nothing of theirs is written into the record. The only write is the link itself (`a:sameAs`, one PATCH of the holder's own record), through the controller's Connect and Unlink.
- Not a reader of the list's rows: a list row carries no link, so the marker comes from what this session has already read (`connectedRecords`), never from a request per row.
- Not the Address group: the held addresses are observed on the vault's one shared read, which the app's Address group already makes. This unit makes no read of its own on a card open.

## How to take it

Package: `@kaigilb/gilbplatformcode-one-card`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/one-card` prints. That command prints the full install line (it is long because the peers have peers of their own). Of those, this unit imports from fifteen: `birthday-text` (`birthdayText`), `card-group` (`CardGroup`), `one-card-context` (`OneCardProvider`, `oneCardOf`, `placeOneCard`, `useOneCard`, the type `OneCardView`), `one-card-merge` (the types `OneCardField`, `OneCardGroup`, `OneCardRow`, `OwnAddress`, `AddressSpellings`, `TheirAddress`, and `theirAddressesOf`), `one-card-rows` (`OneCardFoot`), `online-card` (`createOnlineCardController`, `WORDS`, the types `OnlineCardController`, `OnlineCardState`, `OnlineCardField`), `online-card-link` (`readLink`, the type `LinkReading`), `open-popups` (`eventTargetInTopDialog`, `modalIsOpen`), `person-connections` (`displayPlacements`, the type `PersonCard`), `place-lines` (`claimPlaceIds`), `record-cache-kit` (`refreshRecordInCaches`), `stakeholder-list-doors` (`onlineCardDeps`, `bindAnchorShare`, `forgetAnchor`, `sharedAnchor`, `anchorShareOf`, `resolveRecordPersonCard`, the type `AnchorShare`), `stakeholder-list-state` (`forgetLinkedFinds`), `term-slots` (`attributeLabel`) and `vocabulary-source` (`bareForm`); and from the third-party `@tanstack/react-query` (`useQuery`, `useQueryClient`) and `react`. 0.3.3 also imports `flag-image` (`FlagImage`) directly; it is a direct peer now, and was only a devDependency before (reached through `language-row`).

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import {
  OneCardBody,
  OneCardHostContext,
  OneCardOwnGroups,
  useOnlineCardController,
  usePersonCard,
  type OneCardHost,
} from "@kaigilb/gilbplatformcode-one-card";

// Once, at start-up (the settings the peers read):
setBaseOrigin("https://platform.example.test");
setTermOrigin("https://ontology.example.test");

// Once, above every card: your MyNet place libraries as the host.
const host: OneCardHost = {
  isGeoEntityId, listPlaceClaimsInVault, claimsAbout, claimFieldText, loadPlaceNames,
  placeClaimsKey: (vaultId) => ["mynet", "place-claims", vaultId],
  placeClaimsStaleMs: 60_000,
};

function PersonCardBody(props: { record: RecordWhole; vaultId: string; holder: string; ownVaultId: string; canWrite: boolean }) {
  const controller = useOnlineCardController({ enabled: true, record: props.record, vaultId: props.vaultId, holder: props.holder, canWrite: props.canWrite });
  const personCard = usePersonCard({ controller, recordUri: props.record.entityUri ?? null, holder: props.holder, ownVaultId: props.ownVaultId });
  return (
    <OneCardBody
      controller={controller}
      personCard={personCard}
      canWrite={props.canWrite}
      searchName={nameOf(props.record)}
      fieldOrder={fieldOrderOfTheKind}
      servedFacts={props.record.served?.facts ?? null}
      skillPredicate={skillPredicate}
      labelFor={labelFor}
      groupOf={groupOfTerm}
      skip={isThePhoto}
      order={positionOf}
      recordUri={props.record.entityUri}
      addressPredicate={addressPredicate}
      addressVaultId={props.vaultId}
      addressSubject={props.record.entityUri}
    >
      {/* the card's own groups: each CardGroup of `card-group` draws the rows of theirs placed in it */}
      <OneCardOwnGroups labelFor={labelFor} />
    </OneCardBody>
  );
}

<QueryClientProvider client={queryClient}>
  <OneCardHostContext.Provider value={host}>
    <PersonCardBody {...props} />
  </OneCardHostContext.Provider>
</QueryClientProvider>;
```

## What the host must supply

One host object, `OneCardHost`, read from `OneCardHostContext` by `OneCardBody`, `useHeldAddresses` and `useTheirAddresses`. Without the provider they throw an error that names it: "The one card needs a OneCardHostContext.Provider above it." Each member is the call the app made, with the same arguments, at the same place. Two members are optional (`addressSpellings`, `readPlaceNames`); absent either one, their address is not read and the card stays as before (see "Their address (beyond the source)").

| Member | GilbApp call it replaces | When it is called |
|---|---|---|
| `isGeoEntityId(value): boolean` | `isGeoEntityId`, `lib/mynet/geo/baseGeo.ts:82` | sync; for each value of theirs of a group (trimmed), when the card decides whether to take the group off the card (`OneCardBody.tsx:70`) |
| `listPlaceClaimsInVault(vaultId): Promise<PlaceClaim[]>` | `listPlaceClaimsInVault`, `lib/mynet/place/placeClaim.ts:522` | async; the query function of the shared address read (`heldAddresses.ts:70`) |
| `claimsAbout(claims, subject): PlaceClaim[]` | `claimsAbout`, `placeClaim.ts:632` | sync; when the vault's claims arrive (`heldAddresses.ts:74`) |
| `claimFieldText(claim, term): string` | `claimFieldText`, `placeClaim.ts:263` | sync; four times for each address: `streetLine`, `addressLine1`, `addressLine2`, `postalCode` (`heldAddresses.ts:48-51`) |
| `loadPlaceNames(ids): Promise<GeoPlace[]>` | `loadPlaceNames`, `lib/mynet/geo/usePlaceNames.ts:27` | async; from an effect, when the place ids of the held addresses change (`heldAddresses.ts:81`) |
| `addressSpellings(): Promise<AddressSpellings>` (optional) | Beyond the source (Kai, 2026-11-01). Not a GilbApp call | async; once per mount of `useTheirAddresses`, when the read is enabled, the fields are in hand, and `readPlaceNames` is also present. Rejects when the spellings cannot be read. Absent: no request, their address is not drawn |
| `readPlaceNames(ids): Promise<TheirPlaceRead[]>` (optional) | Beyond the source (Kai, 2026-11-01). Not a GilbApp call | async; from an effect, one call per distinct set of place ids of their addresses, after the spellings have answered and at least one address binds a place. One answer per id, in order, never rejecting: `named` (the row), `missing` (gone), `failed` (not read). Absent: no request |
| `placeClaimsKey(vaultId): readonly unknown[]` | `placeClaimsKey`, `lib/mynet/place/usePlaceClaims.ts:50` | sync; at render (`heldAddresses.ts:69`). The app's value is `["mynet", "place-claims", vaultId]`: the key MUST be the one the app's address group reads under, or the card makes a read of its own |
| `placeClaimsStaleMs: number` | `PLACE_CLAIMS_STALE_MS = 60_000`, `usePlaceClaims.ts:52` | read at render as the `staleTime` of the shared read (`heldAddresses.ts:71`) |

There are no app UI components: `OneCardFoot` and `CardGroup` are units. The host also gives:

- `QueryClientProvider` (`useQuery` for the held addresses and for the person card; `useQueryClient` in the controller and the person card). The reads: the held addresses under the host's `placeClaimsKey(vaultId)` with `staleTime: placeClaimsStaleMs` and `enabled` only for a linked card whose online card is read; the person card under `["person-card", "record", holder, ownVaultId, recordUri, target]` with `staleTime: 0`, `gcTime: 0`, `retry: false`, `refetchOnWindowFocus: false`.
- The settings, once at start-up: `setBaseOrigin` of `base-origin` (the platform origin the controller's requests go to, read when a card is opened) and `setTermOrigin` of `term-origin` (the ontology origin `attributeLabel` asks); and the signed-in session of `lws-session-bridge` and `lws-records` (the controller's reads carry a DPoP proof; the link write is `patchRecord`).
- A card-mode provider above the card's groups when the card is managed (`CardModeProvider` of `card-mode`; see `card-group`).
- Tailwind v4 scanning this unit's `src`: `@source "<path>/units/one-card/src";`. The classes include arbitrary values such as `min-h-[36px]`, `pointer-coarse:min-h-[44px]` and `text-[color-mix(in_srgb,var(--warn)_55%,var(--ink))]`. This unit's CSS variables: `--ink`, `--ink-soft`, `--line`, `--surface`, `--accent`, `--accent-ink`, `--on-accent`, `--warn` (`OneCardFind.tsx` gives each a plain value last; `OneCardBody.tsx` uses `--ink`, `--ink-soft`, `--line`, `--surface`, `--accent` and `--warn` bare); and `--color-primary` in `ConnectedMarker.tsx`. The peers' are in their READMEs.
- React 19.

## Module state

Two stores, each one for the page's life. This unit is a singleton peer: two installed copies each hold their own, so the card would write in one and the list would read in the other, and the marker and the Details panel would stay empty. Install it once per app.

- `connectedRecords.ts:12-13`: `known`, a map of record address to whether this session has read it as connected, and its `listeners`. Written by the open card (`useOnlineCardController` notes the link at open and on every change of the controller); read by the list's rows (`useConnected`, `connectedKnown`). Empty after a reload. `__resetConnectedRecords()` empties `known` (the source's reset, kept; the listeners stay).
- `theirPlaces.ts:21-22`: `byRecord`, a map of record address to the place groups the open card took off the card, and its `listeners`. Written by the open card (`publishTheirPlaces`; an empty list clears the record, and closing the card clears it); read by the Details panel (`useTheirPlaces`). Listeners hear a real change only. `__resetTheirPlaces()` empties `byRecord` (the source's reset, kept).

No other reset exists, and the entry point exports exactly these two (a test pins it). Peers that hold state which this unit writes or reads and that must also exist once: `stakeholder-list-state` (`forgetLinkedFinds`), `stakeholder-list-doors` (the anchor shares), `one-card-context` (`OneCardContext`), `record-cache-kit`, `base-origin`, `term-origin`.

## Kept as in production

The app shares these keys, so they are not renamed:

- Query key `["person-card", "record", holder ?? "", ownVaultId ?? "", recordUri ?? "", target ?? ""]` (`usePersonCard.ts:38`), `staleTime: 0`, `gcTime: 0`, `retry: false`, `refetchOnWindowFocus: false`.
- Query key of the held addresses: the host's `placeClaimsKey(vaultId ?? "")` (the app's `["mynet", "place-claims", vaultId]`, shared with the Address group), `staleTime` the host's `placeClaimsStaleMs` (the app's 60,000), `enabled` only when read is wanted.
- The fact key `sameAs` (`ONLINE_CARD_LINK_KEY`): the record fact that holds the link.
- No `localStorage` or `sessionStorage` key.

## Changes in 0.2.0

A row of theirs on the language term (`a:languageUsed`, found by the field's term, with or without its `a:` prefix, never by the value's shape) is drawn by its name with its country's flag, as `LanguageRow` of `language-row` draws it, and no longer as the language's address. This is in both views: the linked one (`valueText` of the linked card, through `theirValueText`) and the one with a single source. Every other field is drawn as before (a birthday as a day and month, a skill by its label, any other value as served). The card makes no request of its own for this; `language-row` reads the language entry and the flag files once each (see its README). The card has no host member for it. `OneCardView.valueText` already returned a `ReactNode`; `theirValueText` (private to `OneCardBody.tsx`) now returns one too, and it is called only there.

One new peer: `language-row` ^0.1.0 (and, through it, `flag-image`, `flag-choice`, `flag-source`, `language-entry`, `language-fetch-pool`).

Tests: 171 (166 as in 0.2.0: 160 kept unchanged and 6 in `OneCardBody.languageUsed.test.tsx`; 5 new in `OneCardBody.skillName.test.tsx`).

## Do not

- Do not give the host a `placeClaimsKey` of its own: it must be the key the Address group reads under, or the card sends a request on every open.
- Do not call `useOnlineCardController` for a list row: it is for the open card, and it makes nothing until `load()`. A list never creates one.
- Do not write anything of theirs into the record: the rows of theirs have no control.
- Do not install a second copy of this unit or of a singleton peer (see "Module state").
- Do not take `servedFacts` as the facts of a list stub: pass `null` until the whole record is read, and no merge is made.

## Wrong readings

- "A failed read of the place names shows the addresses without places." It shows no held address at all: `useHeldAddresses` keeps its answer `null` until the names are read, and the read of `loadPlaceNames` has no catch, so a rejection is an unhandled rejection and the answer stays `null` for that card open. Kept as in production; a test pins it.
- "`Date.now() < online.retryAt` is a timer." It is read at render only: "Try again" is enabled when the card next draws after the platform's wait, not at the moment the wait ends.
- "`usePersonCard` asks again by itself on any change." It asks again only when the controller's state changes while the kept answer is a failed lookup; a settled answer (person, organization, none) is never asked again for the card's life.
- "`useHeldAddresses` follows a change of host." The memos list no host; a host is set once.

## Changes in 0.3.0

- Named change in `src/OneCardBody.tsx` (`skillText`, new, used by the linked view's `valueText`): a skill of theirs is shown by its name. The master's label when there is one; else the catalogue name in the term's address (`referentNameOf` of the new peer `term-name-text`: `.../base/t/StreetWelding` is "Street Welding"); else, for any other address, the word "A skill"; text that is not an address (a free-text skill) is its own name. Before: the label, else the last part of the address, else the address. The `languageUsed` and birthday paths are unchanged.
- New peer: `term-name-text` ^0.1.0 (and through it `skill-uri-label`, `term-origin`). The ontology origin must be set (`setTermOrigin`), as the held card's units already need.
- New test file `src/OneCardBody.skillName.test.tsx` (5 cases). Mutation checks of `src/OneCardBody.tsx`: 6 mutants (the source's last-part fallback back, any other address shown as the address, a free-text skill replaced by the word, the term address's name not used, the master's label ignored, a storage address taken as text), 6 killed.

## Their address (beyond the source)

Beyond the source (Kai, 2026-11-01). An address of theirs arrives as separate fields of the online card. `useTheirAddresses(enabled, fields)` asks the host for the spellings (`addressSpellings`), groups the fields with `theirAddressesOf` of `one-card-merge`, then asks once for the names of the distinct place ids (`readPlaceNames`) and orders each address's named places with `orderPlaces` (the same finest-first sort a held address uses: city, then regions joined `", "`, then a country-typed last place).

The state is honest:

- `off` — the read is not enabled, `fields` is null, or the host lacks either member. No request is made, and the card stays as before.
- `reading` — the spellings have not answered, or an address binds places and the names have not answered. Nothing is handed back half-named. Once the spellings are known, `reading` carries `rest` (the same fields a `ready` read leaves out) so the raw part rows can leave before the names. Before the spellings answer, `reading` has no `rest`.
- `failed` — the spellings rejected, so it is not known which fields are address parts. This is never `ready` with no addresses: "no address" must not come from a failed read.
- `ready` — `addresses` (each `TheirAddress` plus `city`, `region`, `country`, `countryId`, and that address's own `unread` and `gone`), `loose` (the address parts the server named no address for) and `rest` (the input fields minus every field that went into an address: a label whose `sourceEntity` is one of those addresses, and a part whose predicate is one of the five part spellings and whose `composite` is one of those addresses, including a duplicate the grouping ignored). Loose parts and every other field stay in `rest`, in the order they were given. `off` and `failed` do not carry `rest`.

`unread` counts the places of that address that were not read: a `failed` answer, a named row with an empty label, or an id the answer left out (including a stub that returns `[]` for the ids it was asked — that is "not read", not "no place"). `gone` counts `missing` (the catalogue answered 404). A rejection of `readPlaceNames` itself, which the member must not do, is the same as every id `failed`: `ready`, the text lines kept, every place `unread`, and the rejection is handled. Drawing the row is the next section.

## Their address on the card (beyond the source)

Beyond the source (Kai, 2026-11-01). For a linked card whose online card is ready and whose `addressPredicate` is set, `OneCardBody` calls `useTheirAddresses` (the hook is unconditional, like `useHeldAddresses`; it is not enabled otherwise). When that read is `ready`, the merge is built from `online` with `fields: rest` and from `theirAddresses` mapped to `TheirAddressInput` (`parts` is street, line1, line2, postalCode, city, region, country). The row is not the plain address line. `TheirAddressLines` draws the filled lines the way `compactLines` of `address-card-parts` does (copied, not imported): street, address line 1, address line 2, then the postal code and the city joined with a space, then the region and the country joined with ", ". The country's flag (`FlagImage` of `flag-image`) is on that last line only, and only when the country name is non-empty. `flag-image` is a direct peer as of 0.3.3; before that it was only a devDependency, reached through `language-row`. Places that were not read are said in the row, in the words of `unreadNotes` of `address-card-parts` (copied): "N more place(s) not read right now" when the address has a city, region or country, otherwise "N place(s) not read right now", and "N place(s) no longer in the catalogue". If there are no lines and no notes, the block draws nothing and the row's label still shows.

While `reading` and the spellings are already known (`rest` is present), the merge is built from `rest` and no `theirAddresses`, so the raw part rows are already gone, and one status line is shown. While `reading` before the spellings answer, and when the read `failed`, the card is exactly as before (the same online card, no `theirAddresses`) and that status line is shown. `off` and `ready` do not show it, and a host missing `addressSpellings` or `readPlaceNames` stays `off`. The line is `their-address-status`, directly under the one-card status, inside the one-card container: "Reading their address…" while reading, "Their address could not be read right now." when the spellings failed. It never says there is no address.

The place groups handed to Details are still taken from the merged card. An address's places are no longer among them, because their `claimPlace` fields were consumed into the address. A loose place still is.

`orderPlaces` is pure and exported. `ownAddressOf` calls it; the held-address behaviour is unchanged.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, each file whole to the file of the same name, copied by script:

- `src/components/records/OneCardBody.tsx` (241 lines), `OneCardFind.tsx` (298), `ConnectedMarker.tsx` (21), `heldAddresses.ts` (95); `src/lib/base/onlineCard/connectedRecords.ts` (44), `theirPlaces.ts` (56), `useOnlineCardController.ts` (67), `useOnlineCardState.ts` (20), `usePersonCard.ts` (63), `onlineCardLabels.ts` (49).

`src/index.ts` and `src/oneCardHost.ts` are new.

**Merged units compared and taken** (token for token, comments and imports excluded; the app's declaration compared with the unit's):
- Same: `bareForm` (22 tokens), `birthdayText` (75), `displayPlacements` (129), `PersonCard` (43), the declarations of `mergeOneCard.ts` and `controller.ts` (every one), `readLink` (194), `LinkReading` (33), `OneCardFoot` (the whole file `OneCardRows.tsx`), `CardGroup` (860) and the other declarations of its file, the 18 declarations of `oneCard.tsx`, the 6 of `layers.ts`, `refreshRecordInCaches` (78) with `putRecordInCaches` (109), `listsHolding` (135) and `recordsKey` (49), the 28 declarations of `linkedAnswers.ts` (`forgetLinkedFinds` 38), `attributeLabel` (41), and of `personCard.ts` all the declarations but one.
- Same except a declared seam: `onlineCardDeps` and `personCardPlatform` (`BASE_ORIGIN` is `baseOrigin()`, a setting read at the call); `attributeDoc`, behind `attributeLabel` (`GILBVEDA_MASTER_ORIGIN` is `termOrigin()`).
- `claimPlaceIds` of `place-lines`: 72 tokens each; the unit types its parameter `PlaceLineClaim` and names its lambda parameter `candidate` where the app has `PlaceClaim` and `f`. Measured on 5000 random claims: 0 differ.
- The record cache: `record-cache-kit` holds an equal `refreshRecordInCaches`, so the controller imports it and the host has no member for it.

**Changes from production** (a token comparison of every file with its source, comments and imports excluded: 0 hunks in `OneCardFind.tsx` (1,782 tokens), `ConnectedMarker.tsx` (77), `connectedRecords.ts` (216), `theirPlaces.ts` (335), `useOnlineCardController.ts` (349), `useOnlineCardState.ts` (106), `usePersonCard.ts` (433) and `onlineCardLabels.ts` (315); 4 in `OneCardBody.tsx` (1,631 to 1,647); 12 in `heldAddresses.ts` (711 to 743); all below):

1. The imports are the peers' (listed in "How to take it"); `ONLINE_CARD_WORDS as W` of `gilb-stakeholders` is `WORDS as W` of `online-card` in `OneCardFind.tsx` and `ConnectedMarker.tsx`.
2. The host (RuleGhsHostSeam). `OneCardBody.tsx`, before: `export function isTheirPlaceGroup(group, groupOf)` with `isGeoEntityId(r.value.trim())`; after: `isTheirPlaceGroup(host: OneCardHost, group, groupOf)` with `host.isGeoEntityId(r.value.trim())`; `OneCardBody` begins with `const host = useOneCardHost();` and calls `isTheirPlaceGroup(host, g, props.groupOf)`.
3. `heldAddresses.ts`, before: `ownAddressOf(claim, places)`, `claimFieldText(claim, "streetLine")` (and `"addressLine1"`, `"addressLine2"`, `"postalCode"`), `placeClaimsKey(vaultId ?? "")`, `listPlaceClaimsInVault(vaultId!)`, `PLACE_CLAIMS_STALE_MS`, `claimsAbout(q.data, subject!)`, `loadPlaceNames(ids)`, `ownAddressOf(c, ...)`; after: `ownAddressOf(host, claim, places)`, `host.claimFieldText(claim, ...)`, `host.placeClaimsKey(vaultId ?? "")`, `host.listPlaceClaimsInVault(vaultId!)`, `host.placeClaimsStaleMs`, `host.claimsAbout(q.data, subject!)`, `host.loadPlaceNames(ids)`, `ownAddressOf(host, c, ...)`; `useHeldAddresses` begins with `const host = useOneCardHost();`.
4. The types `PlaceClaim` and `GeoPlace` are declared in `oneCardHost.ts` as the structural subsets the unit reads (the app's are MyNet interfaces); `PlaceTextTerm` is the four terms.
5. Comments made generic (cycle, step, tester, design-note and ruling tags, dates, person and app names removed; the example geo address in `theirPlaces.ts` reworded). No origin constant is evaluated at load in these files, so none was changed.

**Tests (160).** Ported from the app, same inputs and expectations (hosts to `example.test`, person names to Ann and Ben; ticket and tester tags removed from titles; no clock waits): `OneCardFind` 32 in 4 files (13, 9, 8, 2; the brief counted 32), `heldAddresses` 3, `useOnlineCardController` 10 cases (6 + the 4 cases of two `it.each`; 8 `it` calls), `usePersonCard` 2. In `useOnlineCardController` the app's `refreshRecordInCaches` and `patchRecord` mocks are mocks of `record-cache-kit` and `lws-records`, and the origin is `setBaseOrigin`; the app's test of the list-forget used the list's real door over a stubbed fetch, and here the same two claims (a link write forgets the kept finds, and keeps what was deleted) are proved on the kept answers of `stakeholder-list-state` directly, because the door is not part of this unit. Added (113): a fake host (`test/fakeHost.tsx`) and a real controller over a fake platform (`test/rig.ts`); pins for the exports, for each host member (arguments, order, when), for the module state (a write seen by a second reader; reset clears), for `OneCardBody` (both feet, statuses, places taken off, host missing), for `ownAddressOf`, `useHeldAddresses`, `onlineCardLabels`, `usePersonCard`, and the host-agnostic check. Left out: the tests of the pages that draw the card (`RecordDetail.s5dOneCard`, `RecordDetail.ui2LessIsMore`, `AddressRows.oneCardMerge.s5e`, `RecordGridRow.s13online`, `CardGroup.oneCard.s5d`): they go through the app's whole page or its stubbed network.
