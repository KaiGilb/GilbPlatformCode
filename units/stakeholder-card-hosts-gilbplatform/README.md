# stakeholder-card-hosts-gilbplatform

The ready-made GilbPlatform host for the Stakeholder cards: one provider that sets the platform's origins and the session, supplies every host the online stakeholder card needs, and holds the platform pieces and the peer hosts the held stakeholder record card is built from, so they draw, read, add and edit with no host object written.

## What this is

The ready-made GilbPlatform host for the Stakeholder cards: one provider that sets the platform's origins and the session, supplies every host the online stakeholder card needs, and holds the platform pieces and the peer hosts the held stakeholder record card is built from, so they draw, read, add and edit with no host object written.

You mount `StakeholderCardGilbPlatformProvider` once, with the platform's origins, the signed-in `SessionCredential` and a few other values. Inside it two cards draw:

- `OnlineStakeholderCard` (the card of a person from the holder's circles who has no record) draws its header and its rows and offers "+ Add your own".
- `StakeholderRecordCard` (the card of a person the holder keeps a record of, from `stakeholder-record-card`) draws inside this provider too, through its own host unit, `stakeholder-record-card-host-gilbplatform` (this provider does NOT import the card). After "+ Add your own" your page opens it: the provider tells `onOpenRecord` the record and the vault it was made in (or, for a record the holder already held, the vault the online card's find named).

The provider:

1. Sets, before any child renders and in this order: the base origin, the ontology origin, the system vault hosts, the own-card host labels, the optional settings (the profile address `mynetProfileUrl` among them), the session (`setLwsAuth(lwsAuthFromSession(session))`) and the type key. This is the order of `plan-card-hosts-gilbplatform`. An app that mounts both providers with the same props sets each singleton twice to the same value.
2. Makes a React Query client with the app's defaults (`staleTime` 30 s, no refetch on focus, `retry` 1), or uses yours.
3. Asks the photo term once, when it mounts (`createPhotoTermResolver` of `photo-term`, one per origin, with the provider's `origin` as the origin of the master, as the app passes its base origin).
4. Mounts six contexts for the online card and the standalone Org units. Three are the online stakeholder card's: the card's own (`OnlineStakeholderCardHostContext`), the contact header's (`StakeholderContactHeaderHostContext`) and the one card's (`OneCardHostContext`); the other three hosts the card needs are members of the first: `doors`, `person` and `vocabulary`. Three are the standalone Org units': the Employees group's (`OrgEmployeesHostContext` of `org-employees`, which `org-hierarchy` also reads), the mark's (`OrgMarkHostContext` of `org-mark`) and the pickers' query hook (`PickerQueryContext` of `record-picker`, which `org-hierarchy` reads).
5. Mounts what the held card needs from other units (0.4.0): the label hook of the fields that point at records (`RefLabelContext` of `entity-ref-value`), the hosts of the card's peers (`ContactRowsHostProvider` of `contact-rows`, `StakeholderSetFieldsHostProvider`, `OtherLinkedRecordsHostContext`, `AddedByHostContext`, `AdderCardHostProvider`), and `StakeholderCardPlatformContext`, from which the host unit builds the card's own host (`useStakeholderCardPlatform()`: the shell, the photo keys, the label hook, `persistVocabulary`).

The hosts are the same objects for the provider's lifetime; the props that change are read at the time of each call.

One factory per host is exported too, for an app that wants to build a host itself: `createOnlineStakeholderCardHost`, `createStakeholderContactHeaderHost`, `createOneCardHost`, `createStakeholderListDoorsHost`, `createPersonCreateHost`, `createCardVocabularyHost`, (0.2.0) `createCardReferencesHost`, `createOrgMarkHost`, `createOrgEmployeesHost` and `createPickerQuery`, and (0.4.0) `createContactRowsHost`, `createAdderCardHost`, `createAddedByHost` and `createOtherLinkedRecordsHost`. Each returns exactly the interface of the unit that owns it. `card-references` takes its host as an argument of its two remove functions, not by a context, so the provider mounts nothing for it: call `createCardReferencesHost()` where you call `removeCardReference`.

### The vault list

The card needs the vaults the holder reaches, with the landing flag on one of them. The provider builds them the way GilbApp's `useVaults` did (`reachable-vaults`): the session's set is the membership, decorated by `GET /lws/vaults` when that answers, and lean (no entity, no landing flag) while the answer is out or has failed. They are read under GilbApp's own query key, `["base", "vaults", <principal>]`, so an app that already reads them shares the entry. Without a landing row the card cannot find the holder's own vault: its header is not drawn and "+ Add your own" is not offered. That is how GilbApp behaves too.

### The shell and the write guard (0.4.0)

`useShell` answers the online card and, through `StakeholderCardPlatformContext`, the held card. Besides the session, the vault list and `openRecordFromList`, it carries what the held card reads: `session.vault.shortWebId` (when the sign-in has one), `contentScope.readVault` and `readVaultId` (the vault on screen when the holder's set holds it, else the vault flagged as the holder's landing vault, else none; never the first row), and `writeGuard`, `{ allowed, reason }`, a statement about THAT vault's own write grant: allowed when its modes include write, else refused with the reason "You hold read only on <vault>, so nothing can be saved here."; with no vault open the reason is "Checking which vaults you can reach…" while the set is being found, else "No vault is open, so there is nowhere to save. Choose a vault first." The held card's every edit control is gated on it. The words and the rule are GilbApp's (`AppShell.tsx` 471-472 and 503-516). The platform still re-checks each entity: the guard is the vault-level floor.

### The members

| Host | Member | Supplied by |
|---|---|---|
| `OnlineStakeholderCardHost` | `useShell` | this unit (`src/shell.ts`): the session of the credential, the vault list above, the content scope, the write guard, your `onOpenRecord` |
| | `refreshOnlineStakeholders` | your prop; default nothing |
| | `photoReadKeysSync` | the photo-term resolver's `peek()?.readKeys ?? []` |
| | `doors`, `person`, `vocabulary` | the three factories below |
| `StakeholderListDoorsHost` | `requestsSent` | inline `() => 0` |
| | `heldRecordFreshMs` | inline `15_000` |
| | `heldRecordOf`, `useRecordsBeingDeleted` | inline copies (token-equal to GilbApp) |
| `PersonCreateHost` | `adderCardOf` | `adderCardOf` of `adder-card` (since 0.4.0; the inline copy is gone): it finds the holder's own card, and makes a basic one in the landing vault when there is none (`ensureVaultSelfCard` of `vault-profile-photo`) |
| | `rememberCreatedIn` | `rememberCreatedIn` of `record-detail-reads` (since 0.4.0) |
| `CardVocabularyHost` | `masterKindReader` | `masterKindReader` of `plan-stakeholder-io` |
| | `persistVocabulary` | your prop, when given |
| `StakeholderContactHeaderHost` | `useRelations` | `useRelations` of `plan-stakeholder-io` |
| | `discoverVaultProfilePhoto`, `loadPhotoObjectUrl` | your props; defaults are those of `vault-profile-photo`, the first over the photo term's read keys |
| | `loadGranteeFace` | your prop; default is that of `grantee-face` |
| | `useHolderOriginLine`, `useContactLabels` | your props; since 0.4.0 the defaults are the real hooks: `useHolderOriginLine` of `contact-card-slots` (the SAME function the held card's slots call, so the header and the body share one read) and `useContactLabels` of `contact-labels` |
| `OneCardHost` | `isGeoEntityId` | inline, over your `geoOrigin` |
| | `placeClaimsKey`, `placeClaimsStaleMs` | inline (`["mynet", "place-claims", vaultId]`, `60_000`) |
| | `listPlaceClaimsInVault`, `claimsAbout`, `claimFieldText`, `loadPlaceNames` | your props; the card never calls them, and the defaults find nothing |
| `CardReferencesHost` (an argument, no context) | `changeRecordFactItems` | `changeRecordFactItems` of `record-fact-items`, from `createCardReferencesHost()` |
| `OrgMarkHost` (`OrgMarkHostContext`) | `downloadFileOutcome` | `downloadFileOutcome` of `file-download-outcome` |
| `OrgEmployeesHost` (`OrgEmployeesHostContext`) | `readResources` | `readResources` of `vault-resources` (since 0.4.0; the inline copy is gone), six in flight |
| | `photoReadKeys` | the photo term's, shared with the header and the card (one ask for 60 s) |
| | `useSheetHistory`, `dropStaleSheetEntry` | those of `sheet-history` |
| | `RecordFace` | your prop, optional, fixed at mount; absent: the row draws no face and still shows the name and the titles |
| `PickerQueryContext` (a hook) | `usePickerQuery` | inline copy of the picker's `useQuery` call, with `retry: false` as the source's |
| `StakeholderCardPlatform` (`StakeholderCardPlatformContext`, 0.4.0; read with `useStakeholderCardPlatform()`) | `useShell` | the shell above |
| | `photoReadKeys` | the photo term's keys, async, from the resolver the provider holds: the same function as the header's and the Employees group's (one ask for 60 s) |
| | `photoReadKeysSync` | the resolver's `peek()?.readKeys ?? []` |
| | `useRefLabel` | `src/refLabel.ts`: the hook of the `entity-ref-value` example (a hit in the loaded list, else one read at the record's own node, else the address); also mounted as `RefLabelContext` |
| | `persistVocabulary` | your prop, when given |
| `ContactRowsHost` (`ContactRowsHostProvider`) | `useHomeDial`, `saveRecordSidecar`, `noteServedVersion`, `PhoneValue`, `SkillPickerSheet`, `SkillDepthNote`, `SocialLogo`, `socialPlatformName`, `HeldVisibilitySwitch`, `AddedByLine` | those of `home-dial`, `record-sidecar-save`, `phone-value`, `skill-picker-sheet`, `social-logo` and `added-by`, from `createContactRowsHost()` |
| `StakeholderSetFieldsHost` (`StakeholderSetFieldsHostProvider`) | `changeRecordFactItems` | `createCardReferencesHost()` |
| `OtherLinkedRecordsHost` | `useShell` | the shell's `vaults` |
| `AddedByHost` | `useShell` | the shell's `openRecordFromList` (your `onOpenRecord`) |
| `AdderCardHost` (`AdderCardHostProvider`) | `useSession` | the session query the shell already holds, read passively (`enabled: false`: it never fetches or mints a session) |

## Changes in 0.4.0

Minor: the provider holds what the held card needs from other units. The held card's own host is NOT here: it is `stakeholder-record-card-host-gilbplatform`, which imports this provider and `stakeholder-record-card` (this provider imports neither, so there is no dependency cycle with the record card's tests). The online card behaves as before, except where a line below says so.

- **The shell grows (named changes).** `session.vault.shortWebId` (when the sign-in has one), `writeGuard` (`{ allowed, reason }` from the read vault's modes) and `contentScope.readVault` (with `readVaultId`). `readVaultId` was the `viewedVaultId` prop as given (possibly null); it is now the id of the read vault: the vault on screen when the holder's set holds it, else the landing vault (GilbApp's `selectedVault ?? landingVault`). The online card does not read it. `contentScope.reach` stays null.
- **`StakeholderCardPlatformContext` and `useStakeholderCardPlatform()`** (new exports, with the types `StakeholderCardPlatform`, `PlatformShell` and `WriteGuard`, and `useRefLabel`): the shell hook, `photoReadKeys` (async) and `photoReadKeysSync` from the resolver the provider already holds, the label hook, and `persistVocabulary`. The host unit builds the held card's host from them.
- **`useRefLabel`** is the example hook of `entity-ref-value` (`src/refLabel.ts`), mounted as `RefLabelContext` and exported.
- **The sub-hosts the held card's peers need are mounted**: `ContactRowsHostProvider`, `StakeholderSetFieldsHostProvider`, `OtherLinkedRecordsHostContext`, `AddedByHostContext` and `AdderCardHostProvider`. The field pickers and the place members stay absent (defaults).
- **`useHolderOriginLine` and `useContactLabels` default to the real hooks** (`contact-card-slots`, `contact-labels`), where they defaulted to "no line, no chips". This applies to the ONLINE card's header too, and it is intended: it is closer to GilbApp, whose header always had the real ones. The online card reaches only the disabled branch of both (it has no record address), so it draws and asks as before (its tests are unchanged). Pass your own only if you mean to break the sharing of the header and the held card's slots.
- **`settings.mynetProfileUrl`** (new, optional): the address of the profile editor, set through `setMyNetProfileUrl` of `own-card-state`. The held card's own-card band throws when none is set; the host unit therefore draws a sentence and no card in that case.
- **`onOpenRecord(id, door?)`**: the second argument is the vault the provider knows for the record (`knownVaultOf`): the vault a create of this session wrote it into, or, since 0.4.3, the vault the online card named when "+ Add your own" opened a record the holder already held (the card's `rememberVaultOf`); otherwise the call is `onOpenRecord(id)` as before.
- **The inline copies are gone (one symbol, one unit).** `adderCardOf`, `NO_OWN_VAULT_SAYS`, `NoOwnVaultError`, `landingVaultOf`, `nameFromEmail` are `adder-card`'s; `readResources` (and its `getResource`) is `vault-resources`'; `createdInVaultKey`, `rememberCreatedIn` and `CREATED_IN_VAULT_HEAD` are `record-detail-reads'`. `src/adderCard.ts` is deleted; the export `NO_OWN_VAULT_SAYS` is kept (re-exported from `adder-card`). The comment-stripped compares are in "Where it came from".
- **Peers:** added `adder-card`, `added-by`, `contact-card-slots`, `contact-labels`, `contact-rows`, `entity-ref-value`, `home-dial`, `main-tag`, `modes-label`, `other-linked-records`, `own-card-state`, `phone-value`, `record-detail-reads`, `record-sidecar-save`, `skill-picker-sheet`, `social-logo`, `stakeholder-set-fields`, `vault-resources`; dropped `lws-vault-sets`, `plan-self-source`, `resource-id` and `vault-namespace` (nothing here imports them now). The install line is the output of `peers.mjs` again.
- **Tests:** the 139 of 0.3.2 stay, with these adapted: `adderCard.test.ts`, `inline.test.ts` and `hosts.test.tsx` import the moved symbols from their units (the cases are unchanged); the export list of `hosts.test.tsx` has the new exports; the content-scope case of `provider.test.tsx` expects the read vault (above). New: `shell.test.tsx` (16), `heldHosts.test.tsx` (the peers' hosts, the label hook, the profile address, the platform context, the shared header hooks, the door) and a second case in `example.test.tsx`. The held card drawn inside the provider is tested in the host unit.

## Changes in 0.3.2

- devDependencies only: `contact-annotation`, the new peer of `stakeholder-contact-header` 0.1.1. The install line is the output of `peers.mjs` again: it now holds `contact-annotation`, and also `adder-card`, `held-notes`, `kind-relation`, `stated-by` and `vault-resources`, which the line had not yet listed since 0.3.1. No source or test change.

## Changes in 0.3.1

Package metadata only; no source or test change. The unit's `devDependencies` gain `held-notes` and the units of its peer tree, and the lockfile is refreshed (no third-party version changes), because `org-employees` 0.2.1 imports `subjectSpellings` and `inVault` from `held-notes`. The peer ranges of this unit are unchanged.

## What this is not

- Not the card: `OnlineStakeholderCard` is in `online-stakeholder-card`. This unit only supplies what it needs.
- Not the held card: `StakeholderRecordCard` is in `stakeholder-record-card`, and its host is `stakeholder-record-card-host-gilbplatform`. Not a host for the Stakeholders list or the other Stakeholder units (see "Units this provider does not host yet"). It does host `card-references`, `org-mark`, `org-employees` and `org-hierarchy`, which stand alone.
- Not a router: opening a record is your page's act (`onOpenRecord`).
- Not the Plan cards' provider. It can stand beside `PlanCardsGilbPlatformProvider` with the same props.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-card-hosts-gilbplatform` prints. The line below includes `online-stakeholder-card`, the card this unit hosts:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/geo-origin <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-row <path-to-the-library>/units/modes-label <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/org-mark <path-to-the-library>/units/own-card <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/phone-value <path-to-the-library>/units/photo-term <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/sheet-history <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/social-logo <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/grantee-face <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/record-sidecar-save <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/other-linked-records <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/added-by <path-to-the-library>/units/stakeholder-set-fields <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/own-card-state <path-to-the-library>/units/plan-stakeholder-io <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/online-stakeholder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-labels <path-to-the-library>/units/contact-card-slots <path-to-the-library>/units/contact-rows <path-to-the-library>/units/org-employees <path-to-the-library>/units/skill-picker-sheet <path-to-the-library>/units/stakeholder-card-hosts-gilbplatform
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The closure is 125 units besides this one. Of these, 45 are not in the closure of `online-stakeholder-card` (the held card and its peers, and the standalone Org units); `org-hierarchy` is a dev dependency only (the tests draw it); the provider imports nothing of it.

## Styling

The units this provider draws ship no style sheet (`contact-header` aside): they draw with Tailwind v4 utility classes over the host's CSS variables. A taker runs Tailwind v4 with the installed units' sources in its `@source` scan (for example `@source "../node_modules/@kaigilb/*/src/**/*.{ts,tsx}";`, since installed copies in `node_modules` are not scanned on their own) and defines the variables the units read (`--ink`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--accent`, `--accent-ink`, `--paper`, `--surface`, `--surface-hi`, `--surface-sunken`, `--line`, `--line-2`, `--sel`, `--good`, `--warn`, `--bad`, `--focus`, `--r-sm`, `--r-md`, `--r-lg`, `--serif`); without it the photos draw at their natural size and the layout collapses. The held card reads the variables its README lists (`stakeholder-record-card`, and the peers it names). `apps/stakeholder-card-taking-app/styles/app.css` is a working example for both cards.

## Example

The one complete wiring, with every prop: the online card, and the page that is told the record and its door after "+ Add your own" (draw that record with `HeldStakeholderCard` of the host unit). It is type-checked with the unit and rendered by `src/example.test.tsx` (`test/example.tsx`). Every value that names a place is a placeholder; yours are your own.

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
  // Your page's own state: the record the card opened after "+ Add your own", and the vault it was made in (its door), when the provider knows it.
  // Draw it with the held card of `stakeholder-record-card-host-gilbplatform` (`HeldStakeholderCard recordId vaultId`); this unit draws only the online card.
  const [opened, setOpened] = useState<{ id: string; door: string | undefined } | null>(null);
  return (
    <StakeholderCardGilbPlatformProvider
      origin="https://example.test" //                                       required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //             required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //               required: hosts besides the origin's family that may be read at their own address (they never get your credential)
      systemHostLabels={["id", "ontology"]} //                               required: first labels of the platform's own hosts
      session={session} //                                                   required: signs every request
      geoOrigin="https://geo.example.test" //                                required: the origin of the shared world catalogue
      viewedVaultId={null} //                                                optional: the vault your screen shows; absent, the holder's landing vault
      refreshOnlineStakeholders={() => {}} //                                optional: draw your online list again (called before a record is opened)
      onOpenRecord={(id, door) => setOpened({ id, door })} //                optional: open a record in your page; door is the vault a create of this session wrote it into, when known
      queryClient={myClient} //                                              optional: your own client (its defaults are yours); absent, the provider makes one
      persistVocabulary={() => true} //                                      optional: whether the card vocabulary is kept on this device
      discoverVaultProfilePhoto={async () => ({ photoRef: null })} //        optional: finds the photo of a vault's profile; absent, the unit's own
      loadPhotoObjectUrl={async () => null} //                               optional: loads a photo as an object URL; absent, the unit's own
      loadGranteeFace={async () => null} //                                  optional: loads the face of a person who shares one with the viewer; absent, the unit's own
      useHolderOriginLine={undefined} //                                     optional HOOK: absent, the one of contact-card-slots, which the held card's slots call too (keep it)
      useContactLabels={undefined} //                                        optional HOOK: absent, the one of contact-labels
      listPlaceClaimsInVault={async () => []} //                             optional: the four place members of the one card (the cards never call them)
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
        mynetProfileUrl: "https://mynet.example.test/profile", //            optional: the profile editor's address, for the held card's own-card band
      }}
    >
      {opened ? <p>Opened {opened.id}{opened.door ? ` in ${opened.door}` : ""}</p> : <OnlineStakeholderCard principal={principal} placementMode="content" />}
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
| `children` | What to draw: `OnlineStakeholderCard`, and the held card of the host unit. |

Optional:

| Prop | What it does | Default |
|---|---|---|
| `viewedVaultId` | The vault your screen shows. The shell's read vault is that vault when the holder's set holds it, else the landing vault; the held card's write guard is that vault's. Read at each render. | `null` (the landing vault) |
| `refreshOnlineStakeholders` | Draws your online list again. The card calls it before it opens a record. Read at each call. | nothing |
| `onOpenRecord` | Opens a record of the holder's by its id in your page (GilbApp's `openRecordFromList`). Since 0.4.0 the second argument is the record's door, the id of the vault a create of this session wrote it into, when the provider knows it: pass it on as `vaultId` of `StakeholderRecordCard`. Read at each call. | nothing: the card stays in place after "+ Add your own" |
| `queryClient` | A client you own. It is used as it is; its defaults are yours. | the provider makes one with the app's defaults |
| `persistVocabulary` | Whether the card vocabulary is kept on this device. Passed to the vocabulary host. | kept |
| `discoverVaultProfilePhoto`, `loadPhotoObjectUrl`, `loadGranteeFace` | The photo members of the header. Read at each call. | the units': `vault-profile-photo` (the first over the photo term's keys) and `grantee-face` |
| `useHolderOriginLine` | A hook: the "Where / How we met" line. Fixed at mount. | `useHolderOriginLine` of `contact-card-slots` (since 0.4.0; the held card's slots call the same one) |
| `useContactLabels` | A hook: the kind chips. Fixed at mount. | `useContactLabels` of `contact-labels` (since 0.4.0) |
| `listPlaceClaimsInVault`, `claimsAbout`, `claimFieldText`, `loadPlaceNames` | The four place members of the one card. The online stakeholder card never calls them. Read at each call. | find nothing |
| `RecordFace` | A component: the face of a record in the Employees group's rows (`org-employees`). Fixed at mount. | none: no face |
| `settings` | `mynetProfileUrl` (since 0.4.0): the address of the profile editor, an absolute http or https address with no user name or password, for the "Edit in MyNet" link of the holder's own card (`setMyNetProfileUrl` of `own-card-state`; any other value throws that unit's TypeError at mount). The band is drawn only on the holder's OWN card and reads the address when it draws: with none set it throws, naming the setter, so give it when the holder may open their own card. `localRigHosts`, `ontologyApiOrigin`, `ontologyApiOriginRaw`, `minOntologyQuery`, `vocabTypeBatchRevisions`, `publicCorpusOrigin`: the optional platform settings, as `plan-card-hosts-gilbplatform` takes them. `dpopProofOrigin` (since 0.3.0): the identity host that `origin` forwards to. A request sent to `origin` is signed for that host (path kept, query dropped); a request sent to a vault host is signed for that vault host. Set it only when `origin` is an apex that a front door forwards to the identity host (the server compares a proof with the host it received). Never a vault host. | the units' defaults |

## What the host must supply

Nothing besides these props: this unit is the host. Every member of the host interfaces is in the table above; a member that is a prop has a default. The page around the cards supplies only what is a page's: which record is shown (`onOpenRecord`), the Tailwind scan and the CSS variables ("Styling"), and, for the held card, the `mynetProfileUrl` setting.

## Requests and their servers

Every request of the online card and of the provider's own parts, and the server it goes to; the held card's own requests (record read, autosave, relation, notes) are in the host unit's README. "The node" is the node of the vault that holds the record: the vault's subdomain of the platform (`record.entityUri`, or the vault asked for), which the platform answers for that vault only. The platform's apex (`origin`) answers only the lines marked so.

| Request | Made by | Server |
|---|---|---|
| `POST /lws/vault/<vaultId>/c` | "+ Add your own" (`person-create`) and held-claim writes | the node of the vault written |
| `POST /lws/vault/<vaultId>/selfcard` | the holder's basic own card, when she has none | the node of her landing vault |
| `GET /lws/vaults` | the vault list (`reachable-vaults`) | the apex |
| `GET /base/a/profilePhoto` | the photo term (`photo-term`) | the apex |
| `GET /base/a/<slug>`, `/base/t/<Type>`, `/base/vocab?status=all` | `veda-labels` (the held card's labels) | the apex, with a Bearer when one is formed; a failure shows the master's label (a known question: see "Not yet proven live") |
| `GET /base/vocab?status=all&linkPlane=user` | the relation write (`lws-relations`) | the apex (or `settings.ontologyApiOrigin`) |
| the master's terms, kinds and field sets | `term-slots`, `stakeholder-card-vocabulary`, `contact-kind-catalogue` | the ontology origin, anonymous |
| `GET /base/connect/public-card`, `audience-rung/members`, `profile-photo` | the online card (`stakeholder-list-reader`) | the apex |
| every other host | nothing | a request to a host outside the platform's family carries no credential |


## Differences from GilbApp

- **"+ Add your own" makes the holder's own card, as GilbApp does (0.2.0).** In 0.1.0 a holder with no card of their own was refused with `NO_OWN_CARD_SAYS`; that sentence is gone, and so is its export. `adderCardOf` is now GilbApp's whole (token-equal, see "Where it came from"; since 0.4.0 it is the one of `adder-card`): with no landing vault it refuses with `NO_OWN_VAULT_SAYS`; with a card it answers the card; with none it makes a basic one in the landing vault only (`ensureVaultSelfCard` of `vault-profile-photo`: `POST /lws/vault/<vaultId>/selfcard`, signed with DPoP, named by the sign-in email when one is given, else by the vault's label), reads it back, drops the finding so the next ask finds the card, and answers its address. The three refusals the source still makes keep the source's words: "Your own vault could not be addressed, ...", "Your own card could not be made, ... (cause)" and "Your own card was made but could not be read back, ...". Three adds at once make one card.
- **Photos are the units' (0.2.0).** `discoverVaultProfilePhoto` and `loadPhotoObjectUrl` come from `vault-profile-photo`, `loadGranteeFace` from `grantee-face`; your props still override them. The discovery's host has the photo term's read keys (the app's `photoReadKeys`: one ask shared for 60 s, the last answer that worked when the master fails, else none with the source's warning). It has no `noteVaultPicture`: that is the app's note of which vaults have a picture, and the card needs none. `tellIfKeysChanged`, the app's tell to its synchronous readers, is not taken: this unit's synchronous read is the resolver's `peek()`.
- **Held notes (0.4.0).** `useHolderOriginLine` and `useContactLabels` default to the real hooks of `contact-card-slots` and `contact-labels`, as in GilbApp. The online card reaches the disabled branch of both. The value of GilbApp's hook in its disabled branch is still `defaultUseContactLabels` for `createStakeholderContactHeaderHost()` used alone (see "Not measured").
- **The content scope has no `reach`.** The shell's `contentScope` is `{ readVault, readVaultId, reach: null }`. In GilbApp `reach` is the session vault's row in the reachable set; the card's `ownVaultIdOf` reads it as the holder's own vault's row. With `reach` null, `ownVaultIdOf` falls back to the vault flagged as landing in the decorated list, which is the holder's own. The held card reads `reach` the same way and `readVault` not at all.
- **`onOpenRecord` is yours.** The card opens a record after a create through `openRecordFromList`. Without `onOpenRecord` nothing opens: the card stays in place and the new card is not shown until you open it. The door (0.4.0) is the second argument, when known.
- **The online list is yours.** `refreshOnlineStakeholders` draws your online Stakeholders list again. No unit holds that list, so the default is nothing.
- **The request meter is off.** GilbApp counted requests by wrapping the page's `fetch`, which a library does not do. `requestsSent` is `() => 0`, so the reader's per-screen request budget starts from 0.
- **Held-address place members.** The four place members default to finding nothing. This is exact for the online stakeholder card, which passes no address to the one card. The held card with them absent never folds the Address group into "you have the same" for a holder who has an address of the person; it needs the MyNet place libraries.
- **The held card's differences** from GilbApp's (pickers, slots, `holdingVaultOf`, place members) are in the README of `stakeholder-record-card-host-gilbplatform`.
- **The standalone units' hosts (0.2.0).** `RecordFace`, the face of a record in the Employees group, is the one member of those hosts that is yours: it is GilbApp's `RecordFace` component, in no unit, and the unit lets a host leave it out. The rest is the units'.

## Units this provider does not host yet

0.2.0 hosts the standalone Org units whose hosts a unit now holds: `card-references` (a factory: it takes its host as an argument), `org-mark`, `org-employees` and `org-hierarchy` (which reads the Employees host's `useSheetHistory` and `dropStaleSheetEntry`, the mark's host and the pickers' query hook; the provider's query client serves its `useQuery`). Each is drawn in this unit's tests inside the provider alone.

Hosted since 0.4.0, for the held card's peers: `contact-rows`, `stakeholder-set-fields`, `other-linked-records`, `added-by` and `adder-card`. The held card itself is hosted by `stakeholder-record-card-host-gilbplatform`. Not mounted by this provider: `stakeholder-find`.

## Not yet proven live

This unit is proven against a fake platform in its tests. The live check in the test vault, under a person's sign-in, is still owed. It must show:

1. **The decorated vault list.** `GET /lws/vaults` answers with the landing flag on the holder's own vault, and the session's `vault.id` equals one of its `vaultId` values. Without that the header and the add act are not offered (the lean rows have no landing flag).
2. **The header.** The holder's vault and name on the left, the circle chips, the person's name and initials on the right.
3. **The photos (0.2.0).** The holder's vault photo is drawn when the vault has one (discovery finds it by the photo term's keys, the bytes come with the signed read), and the person's photo when their online card shares one.
4. **The card body.** The person's rows, marked as theirs, in the order of the person kind.
5. **One add.** "+ Add your own" with an own card makes the person's card in the holder's own vault, links it, and calls `onOpenRecord` with its id.
6. **One add with no own card (0.2.0).** The same act for a holder with no card makes the basic card first (`POST …/selfcard`, 201), then the person.
7. **The standalone units (0.2.0).** An organization card draws its Employees, its Units and a logo through the provider's hosts; Back closes the full-list sheet.
8. **The held card (0.4.0).** See the host unit's README; proven against the fake platform only.
9. **`veda-labels` asks the apex** for `/base/a/<slug>` and `/base/t/<Type>`; the apex answers terms for the ontology only if it serves them (H2's open question).

## Not measured

- The default of `useContactLabels` against GilbApp's hook in its disabled branch: read in the source (`lib/contact/useContactLabels.ts`, `on` false, so `chips` null, `offered` empty, `offersLoading` false, `catalogueNote` null, `actError` null, no entry predicates), not run. The source's `add` is never reached by this card; the default answers false.
- The photo term's resolver against the private `gilb-photo` package it was cut from.
- Whether `session.vault.id` equals a `vaults[].vaultId` on the live platform (see above).
- The photos and the self-card door against the live platform: the fake platform answers `POST …/selfcard` and `/files/<id>` as the source's tests read them, not as the platform does.

## Module state

- `src/photoTerm.ts`: one photo-term resolver per origin, kept for the life of the module (the app's `photoTerm` was one for the page). `__resetPhotoTermResolvers()` forgets them; it is a test seam, never called by product code.
- `adder-card`: a `WeakMap` of the findings and makings in flight, per query client (it was `src/adderCard.ts` before 0.4.0).
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
- "`contentScope.reach` is the viewed vault." Here it is null; the vault on screen is `readVault` (`readVaultId`).
- "The write guard is the platform's check." It is the vault-level floor; the platform re-checks every entity and a 403 shows on the card.
- "The online card now draws kind chips and the held-note line." It does not: it has no record address, so both hooks answer nothing for it, as before.

## Changes in 0.4.1

- devDependencies only: the units `one-card` 0.2.0 now needs (`flag-choice`, `language-fetch-pool`, `flag-source`, `flag-image`, `language-entry`, `language-row`), so the installed card resolves them in the tests. The peer `one-card` is now `^0.2.0`. The install line is the output of `peers.mjs` again. No source or test changed.

## Changes in 0.4.2

- Peer ranges only: `contact-rows` 0.2.0, `one-card` 0.3.0 and `skill-picker-sheet` 0.1.2 (a skill is shown by its name, never its address) are the releases it is installed with. Peers: `contact-rows` is now `^0.2.0`; `one-card` is now `^0.3.0`; `skill-picker-sheet` is now `^0.1.2`. devDependencies gained `skill-uri-label`, `term-name-text`, so the installed units resolve in the tests. The install line is the output of `peers.mjs` again. No source or test of this unit changed.

## Changes in 0.4.4

- The provider also sets the origin of the shared place catalogue once (`setGeoOrigin` of the new peer `geo-origin`, from the `geoOrigin` prop), in the same step as the other origins, and `setupKey` now includes `geoOrigin`, so a changed `geoOrigin` is applied. Nothing visible changes: no unit reads the catalogue's origin yet. The inline `isGeoEntityId` of the one card host stays; a test pins that it agrees with `geo-origin`'s on the same inputs. A malformed `geoOrigin` now throws the setter's error (`geo-origin: ...`) at the first render, as a malformed `origin` already did. New peer: `geo-origin` `^0.1.0`.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`. This unit is new composition code, not an extraction. The few expressions it copies from GilbApp are in `src/inline.ts` and `src/photoTerm.ts`, each cited `path:line` in a comment and listed in `unit.json`; the shell's write guard and read vault (0.4.0) are `src/shell.ts`, and the label hook (0.4.0) is `src/refLabel.ts`:

- `src/lib/base/recordHooks.ts` line 449 (`HELD_RECORD_FRESH_MS`), 456-462 (`heldRecordOf`), 2609-2630 (`useRecordsBeingDeleted`). Since 0.4.0 lines 2836-2845 (`createdInVaultKey`, `rememberCreatedIn`) are `record-detail-reads`'.
- `src/lib/mynet/place/usePlaceClaims.ts` lines 50-52 (`placeClaimsKey`, `PLACE_CLAIMS_STALE_MS`).
- `src/lib/mynet/geo/baseGeo.ts` lines 61-64 and 82-84 (`isGeoEntityId`, over the `geoOrigin` prop).
- `src/lib/base/photoTerm.ts` lines 19-22 and 74-76 (the resolver and `photoReadKeysSync`), and since 0.2.0 lines 32, 37-41 and 48-64 (`photoReadKeys`).
- `src/components/records/orgCard/OrgRecordPicker.tsx` lines 144-150 (the pickers' query hook).
- `src/components/AppShell.tsx` lines 471-472 (`readVault`) and 503-516 (`writeGuard`), `src/components/records/EntityRefValue.tsx` lines 18-46 (`useResolvedRefLabel`, by way of the `entity-ref-value` README example), `src/main.tsx` lines 72-76 (the query defaults).
- No longer here (0.4.0): `src/lib/base/adderCard.ts` (now `adder-card`), `src/lib/mynet/place/lws.ts` lines 57-71 and 164-170 (now `vault-resources`) and `recordHooks.ts` 2836-2845 (now `record-detail-reads`).

Token comparison (comment-stripped, the declaration against the app's): `heldRecordOf` 94/94, `useRecordsBeingDeleted` 162/162, `placeClaimsKey` 19/19, `PLACE_CLAIMS_STALE_MS` 5/5, `HELD_RECORD_FRESH_MS` 5/5. `isGeoEntityId` differs by construction: it takes the prefix from the `geoOrigin` prop. `askPhotoReadKeys` (73 against 83 tokens) differs by the resolver being a parameter and by `tellIfKeysChanged` being left out; `photoReadKeys` is shared per resolver, not per module.

**The 0.4.0 replacement of the inline copies, measured before the copies were deleted** (comment-stripped, one token per line, the inline declaration against the unit's, same file layout as above):

| Inline (removed) | Unit | Tokens (inline / unit) | Result |
|---|---|---|---|
| `NO_OWN_VAULT_SAYS`, `NoOwnVaultError`, `landingVaultOf`, `nameFromEmail`, `making`, `readFinding`, `findOrMake`, `adderCardOf` | `adder-card` | 6/6, 23/23, 39/39, 119/119, 21/21, 53/53, 160/160, 175/175 | token-equal (the unit's comments differ) |
| `readResources` | `vault-resources` | 91/91 | token-equal |
| `getResource` | `vault-resources` | 114/69 | differs (below) |
| `CREATED_IN_VAULT_HEAD`, `createdInVaultKey`, `rememberCreatedIn` | `record-detail-reads` | 9/9, 20/20, 49/49 | token-equal |

`getResource` differs in one way only: the unit's version also answers `etag` (`rec.etag ?? null`, null for a 404), and has `resourceOf` as a function where the inline copy had it inlined. What the provider's only caller, `readResources`, reads of it is `{ doc, gone, typeUri }`, and for those three the two return the same values for a record (`rec.served?.facts ?? rec.facts`, `false`, `rec.typeUri` when set) and for a 404 (`{}`, `true`, none). The unit's `readResources` is token-equal to the inline one, so no behaviour changes; the cases of `inline.test.ts` for `readResources` (order, `gone`, six in flight, a failed read rejecting) run unchanged against the unit's function.

Named changes, and only these:

1. `isGeoEntityId` is the app's test over `geoOrigin + "/base/e/"`, the origin a prop with its trailing slashes dropped (the source's `GEO_ORIGIN`); no host is named.
2. The photo-term resolver's origin is the provider's `origin` prop, where the app's was `BASE_ORIGIN`; one resolver per origin.
3. `useShell` is built from the credential's session, the `useVaults` of `reachable-vaults` and the props above, where the app's came from its shell context. (0.4.0) It carries `shortWebId`, `writeGuard` and `readVault` as `AppShell.tsx` builds them, from the viewed vault prop and the vault list.
4. Comments: cycle, ticket and person tags are removed or reworded; no code changed.
5. (0.2.0) The photo term's read keys are `photoReadKeysOf(resolver)`: the source's function over the resolver it is given, one shared ask per resolver. The standalone Org units' hosts are the units' members and one inline copy (`usePickerQuery`).
6. (0.4.0) The label hook is the `entity-ref-value` example, not run from the app; the sub-hosts are the units' own members.

Tests (`src/*.test.ts*`, 172): `card.test.tsx` 22 (the online card inside the provider alone: header, rows, signed reads, refusal, actions pane, decorated and lean vault lists, the add with an own card, the add with NO own card, a card that cannot be made, the add of a person already held, the credential gate, the missing provider, the header's photos, the held-note and place defaults and spies); `shell.test.tsx` 16 (the write guard's words and rule, the read vault, the shell inside the provider, `shortWebId`); `heldHosts.test.tsx` 16 (the peers' hosts, the label hook, the profile address, the platform context and the photo keys, the header's shared hooks, the door passed to `onOpenRecord`); `provider.test.tsx` 34; `hosts.test.tsx` 19; `standalone.test.tsx` 10; `adderCard.test.ts` 16 (now against `adder-card`); `inline.test.ts` 14; `photoTerm.test.ts` 11; `both.test.tsx` 2; `example.test.tsx` 2; `hostAgnostic.test.ts` 10 (copied). The world is `test/world.ts`: a fake `fetch` over the master and platform fixtures of `person-create` (copied into `test/`), the connect routes of the card, the self-card door, a file route, a fake `SessionCredential` and the options the taking app uses (`bareSession`, `vaultsHold`, `vaultRows`). The held card is drawn inside this provider in the host unit's tests.

Mutation checks (0.4.0, on the new code, against these tests): 32 mutants, all killed (the first run left one alive, the label of a failed read; a case was added and it died): the write guard 10 (never refuses, the pending and not-pending reasons swapped, the sentence cut, the modes not lower-cased, a reason on the allowed guard, the set's pending state dropped, the undefined test, the landing vault's guard, the vault named by its address, the read mode as the test), the read vault 3 and the short web id 2, the door passed to `onOpenRecord` 5 (never passed, looked up for another id, put before the id, an empty door, the callback read once), the shared `useHolderOriginLine` and `useContactLabels` instance 4 (none, another instance, the developer's ignored, chips another instance), the platform context 3 (not mounted, sync photo keys, `persistVocabulary` never given), the peers' hosts 3, the profile address 1 and the label hook 2.
