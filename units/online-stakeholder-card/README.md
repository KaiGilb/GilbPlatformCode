# online-stakeholder-card

Draws the read-only card of a person from the holder's circles who has no record, and offers to make the holder's own card of them.

## What this is

Draws the read-only card of a person from the holder's circles who has no record, and offers to make the holder's own card of them.

**This is the entry unit for the stakeholder card**: the whole standalone card of a person who is in the holder's circles but has no record in the holder's vaults (a person opened from the Stakeholders grid by their principal). It is one component, `OnlineStakeholderCard`, and the other units draw its lines. It is read only: opening it writes nothing. "+ Add your own" is its one write act, and it goes through the units that already write (`person-create` makes the record, `online-card`'s controller links it, `lws-records` removes what a failed link left).

The lines of the card, in order, and the unit that draws each:

| Line | Drawn by |
|---|---|
| The header: the holder's vault on the left joined to the person on the right, the circle chips, the person's photo, the chain-link badge, the kind chips | `stakeholder-contact-header` (with `contact-header`) |
| The body: one group per field of their card, in the kind's order (nickname directly under the family name), marked "Theirs" | `one-card` (`OneCardBody`, `OneCardOwnGroups`) |
| "+ Add your own" and its failure line | `add-your-own` (`AddYourOwnButton`); the line is this unit's |
| The refused line ("This person is not one of your stakeholders.") and the actions pane | this unit |

What this unit adds to those lines: the person-card read (the holder's circles read once per session, so a person not in them reads nothing), the controller of their card (read once per open, nothing can be written through it), the order of the groups, and the "+ Add your own" act in full: find a record the holder already holds of the person, else make one in the holder's own vault, link it (`a:sameAs`), tried twice, and open it; when the link cannot be made the new record and its tag are removed again.

- `OnlineStakeholderCard({ principal, placementMode })`: `principal` is the person; `placementMode` is where the card is drawn: `"content"` (the Card view's centre), `"full"` (the detail pane) or `"actions"` (the pane beside the Card view, which says that nothing of their card can be changed there).
- The message constants `CHECK_FAILED`, `LINK_FAILED_REMOVED`, `LINK_FAILED_KEPT(name)`, `SAVE_FAILED`, `REMOVE_FAILED(name)`, `LINK_FAILED_TAG_KEPT(name)` and `NOT_A_STAKEHOLDER`, as the app says them.
- The host: `OnlineStakeholderCardHost`, `OnlineStakeholderCardHostContext`, `useOnlineStakeholderCardHost()` and the type `OnlineStakeholderCardShell`.

## What this is not

- Not the card of a person who has a record (the stakeholder card with autosave is the app's `RecordDetail` and is in no unit).
- Not the Stakeholders grid or its online list: the unit calls the host's `refreshOnlineStakeholders` after it made a card; the list itself is in no unit.
- Not a ready-made host: this unit gives the types and the context, not a provider for an app. A ready-made provider is a separate unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-online-stakeholder-card`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/online-stakeholder-card` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-row <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/own-card <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/online-stakeholder-card
```

Of those, this unit imports from seventeen: `online-card` (`createOnlineCardController`, `cardName`), `person-connections` (`resolvePersonCard`), `pick-or-create` (`PartialCreateError`), `vocabulary-source` (`bareForm`), `one-card-merge` (the type `OneCardGroup`), `add-your-own` (`AddYourOwnButton`), `stakeholder-contact-header` (`StakeholderContactHeader`), `one-card` (`OneCardBody`, `OneCardOwnGroups`, `useOnlineCardState`, `useOnlineCardLabelFor`), `plan-self-source` (`ownVaultIdOf`), `stakeholder-list-doors` (`canonicaliserFor`, `personCardPlatform`, `sessionConnections`, `onlineCardDeps`, `heldVaultsOwnFirst`, `linkedRecordsOf`, the type `StakeholderListDoorsHost`), `stakeholder-list-state` (`newestLinkedId`, `screenRecordLinkedTo`, `forgetLinkedFinds`, `isDeletedLinkedRecord`), `stakeholder-card-model` (`stakeholderCardState`, `fieldOfTerm`, `termName`), `stakeholder-card-vocabulary` (`stakeholderCardVocabularyQuery`, the type `CardVocabularyHost`), `person-create` (`recordPerson`, `afterRecordPerson`, `pickerReadingQuery`, `recordableKinds`, the type `PersonCreateHost`), `lws-vault-sets` (`idFromEntityUri`, `idFromUri`), `lws-records` (`deleteRecord`) and `plan-record-hooks` (the type `ReachableVault`); and from the third-party `@tanstack/react-query` and `react`. The install line is long because those units have peers of their own.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

A minimal host app mounts the card like this. It lists every provider and every setting the card needs: the query client, the card's own host, the host of the contact header and the host of the one card (both are contexts), and the three settings. The same text is `test/example.tsx`, which is type-checked and rendered by the tests.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { OneCardHostContext, type OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import { StakeholderContactHeaderHostContext, type StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { OnlineStakeholderCard, OnlineStakeholderCardHostContext, type OnlineStakeholderCardHost, type OnlineStakeholderCardShell } from "@kaigilb/gilbplatformcode-online-stakeholder-card";

// Once, at start-up and sign-in.
setBaseOrigin("https://platform.example.test");
setTermOrigin("https://ontology.example.test");
setLwsAuth({
  bearerHeaderFor: async () => ({}), // your sign-in: see `lws-session-bridge`
  dpopReadAuth: async () => ({}),
  dpopWriteAuth: async () => ({}),
  invalidateDpop: () => {},
  tokenManager: { getSession: async () => ({ principal: "https://ann.platform.example.test/vault", vault: null, vaults: [] }), invalidate: () => {} },
});

// 1. Your app shell, as a hook (the card calls it first, on every render).
const useYourShell = (): OnlineStakeholderCardShell => ({
  session: { principal: "https://ann.platform.example.test/vault", vault: { entity: "https://ann.platform.example.test/vault/e/self" } },
  vaults: [], // every vault the holder can reach (`ReachableVault`)
  contentScope: { reach: null }, // the holder's own vault's row, when you have it
  openRecordFromList: (id) => void window.history.pushState(null, "", `/records/${id}`),
});

// 2. The card's own host: the shell, the list refresh, the photo term, and the three hosts the card passes to its peers.
const cardHost: OnlineStakeholderCardHost = {
  useShell: useYourShell,
  refreshOnlineStakeholders: () => {}, // draw your online list again
  photoReadKeysSync: () => [], // the photo term's read keys now, each with its `a:` prefix
  rememberVaultOf: () => {}, // OPTIONAL: remember the vault of an existing record just before openRecordFromList(id), so your page can pass it on as the record's door
  doors: { requestsSent: () => 0, heldRecordFreshMs: 15_000, heldRecordOf: () => null, useRecordsBeingDeleted: () => new Set<string>() }, // `stakeholder-list-doors`
  person: { adderCardOf: async () => "https://ann.platform.example.test/vault/e/self", rememberCreatedIn: () => {} }, // `person-create`
  vocabulary: { masterKindReader: () => { throw new Error("give the page's kind reader"); } }, // `stakeholder-card-vocabulary`
};

// 3. The hosts of the two peers that read theirs from a context.
const headerHost: StakeholderContactHeaderHost = {
  discoverVaultProfilePhoto: async () => ({ photoRef: null }),
  loadPhotoObjectUrl: async () => null,
  loadGranteeFace: async () => null,
  useHolderOriginLine: () => ({ origin: null, loading: false }),
  useContactLabels: () => ({ chips: [], offered: { circleLabel: [], relationshipKind: [] }, offersLoading: false, catalogueNote: null, actError: null, add: async () => true, entryPredicates: new Map() }),
  useRelations: () => ({ data: [] }),
};
const oneCardHost: OneCardHost = {
  isGeoEntityId: () => false,
  listPlaceClaimsInVault: async () => [],
  claimsAbout: () => [],
  claimFieldText: () => "",
  loadPlaceNames: async () => [],
  placeClaimsKey: (vaultId) => ["place-claims", vaultId],
  placeClaimsStaleMs: 60_000,
};

const queryClient = new QueryClient();

export const OnlineCard = ({ principal }: { principal: string }) => (
  <QueryClientProvider client={queryClient}>
    <OnlineStakeholderCardHostContext.Provider value={cardHost}>
      <StakeholderContactHeaderHostContext.Provider value={headerHost}>
        <OneCardHostContext.Provider value={oneCardHost}>
          <OnlineStakeholderCard principal={principal} placementMode="content" />
        </OneCardHostContext.Provider>
      </StakeholderContactHeaderHostContext.Provider>
    </OnlineStakeholderCardHostContext.Provider>
  </QueryClientProvider>
);
```

## What the host must supply

Settings, once at start-up (the peers read them when a call is made, and throw a sentence that names a missing one):

- `setBaseOrigin(origin)` of `base-origin`, the platform origin.
- `setTermOrigin(origin)` of `term-origin`, the ontology origin.
- `setLwsAuth(host)` of `lws-session-bridge`, the signed-in session (the card's reads carry a DPoP proof; the link write and the delete are signed through it).

Providers, above the card:

- A React Query `QueryClientProvider`.
- `OnlineStakeholderCardHostContext.Provider` with `OnlineStakeholderCardHost`. Without it the card throws "The online stakeholder card needs a OnlineStakeholderCardHostContext.Provider above it."
- `StakeholderContactHeaderHostContext.Provider` with the six members of `stakeholder-contact-header` (a **context**: the header reads it).
- `OneCardHostContext.Provider` with the seven members of `one-card` (a **context**: `OneCardBody` reads it).
- A card-mode provider is NOT needed: the card is not a managed card.

`OnlineStakeholderCardHost`, every member required (the unit writes nothing through them except the lists' refresh). Each is the call the app made, with the same arguments, at the same place:

| Member | What it is | App call it replaces |
|---|---|---|
| `useShell()` | A HOOK, called first in the card's body, on every render, never conditionally. Answers `OnlineStakeholderCardShell`: `session` (the card reads `principal` and `vault.entity`; undefined: not signed in), `vaults` (every vault the holder reaches), `contentScope.reach` (the session vault's row, or null) and `openRecordFromList(id)` | `useShell()`, `components/ShellContext.ts:412`, called at `OnlineStakeholderCard.tsx:86` |
| `refreshOnlineStakeholders()` | Asks every mounted online list to draw again. Sync, no arguments. Called when an existing card of the person is opened, after a failed link was cleaned up, and after a card was made and linked, each time before the record is opened | `refreshOnlineStakeholders()`, `components/records/onlineStakeholders.ts:302`, called at `OnlineStakeholderCard.tsx:189`, `:244`, `:249` |
| `rememberVaultOf?(recordId, vaultId)` | OPTIONAL, since 0.1.5. Remembers the vault of an existing record of the holder's for the session. Called just before `openRecordFromList(id)` when "+ Add your own" opens a record the holder already holds and its vault is known (the store's find names it, or the screen's row does). A host without it opens the id alone, and the held card refuses to read it ("which vault holds this card is not known") | none: GilbApp's list caches attribute the record to its vault |
| `photoReadKeysSync()` | The photo term's read keys now (empty while not known, never "no photo"), each with its `a:` prefix. Sync. Called on every render; the groups of those keys are not drawn | `photoReadKeysSync()`, `lib/base/photoTerm.ts:74`, called at `OnlineStakeholderCard.tsx:136` (it reads the app's module memo of the photo term) |
| `doors` | The `StakeholderListDoorsHost` of `stakeholder-list-doors`, passed as the first argument of `linkedRecordsOf`. That function reads `heldRecordFreshMs` only; give the same object your Stakeholders list uses | `linkedRecordsOf(holder, vaults, members)`, called at `OnlineStakeholderCard.tsx:180` (it took no host) |
| `person` | The `PersonCreateHost` of `person-create` (`adderCardOf`, `rememberCreatedIn`), passed as the first argument of `recordPerson` and `afterRecordPerson` | `recordPerson(deps, input)` at `:203`, `afterRecordPerson(qc, made)` at `:243` and `:248` (they took no host) |
| `vocabulary` | The `CardVocabularyHost` of `stakeholder-card-vocabulary` (`masterKindReader`, optionally `persistVocabulary`), passed to `stakeholderCardVocabularyQuery` | `stakeholderCardVocabularyQuery()` at `:131` (it took no host) |

How each peer takes its host: `stakeholder-contact-header` and `one-card` read a **context**; `stakeholder-list-doors`, `person-create` and `stakeholder-card-vocabulary` take it as an **argument**, so this unit's host carries them as members (`doors`, `person`, `vocabulary`), as `stakeholder-find`'s host does. The other peers need no host.

Options the app used: none beyond those below. The sets for `doors` are the ones your Stakeholders list gives `useStakeholderListReader` (`heldRecordFreshMs: 15_000`).

Styles: the unit has no stylesheet of its own. Its classes are Tailwind v4 utilities with arbitrary values over the app's CSS variables, so the host runs Tailwind with `@source "<path>/units/online-stakeholder-card/src";` (and for each unit the card draws, as for any UI unit). The variables the unit itself uses: `--ink`, `--ink-soft`, `--ink-faint`, `--warn`. `data-testid` values: `online-stakeholder-card`, `online-stakeholder-actions`, `online-stakeholder-refused`, `online-stakeholder-add-error`.

## Kept as in production

The hook order. The card calls, in this order and on every render, before any early return: the host's context (`useOnlineStakeholderCardHost`), `host.useShell`, `useQueryClient`, `useQuery` (the person card), `useMemo` (the controller), `useEffect` (the controller's dispose), `useOnlineCardState`, `useQuery` (the card vocabulary), `useOnlineCardLabelFor`, `useRef` (the add guard), `useState` (adding), `useState` (the add error). The refused line and the actions pane are returned after all of them. A host hook called a different number of times, or later, fails the tests in `host.test.tsx`.

The person-card query, kept exactly: key `["person-card", "principal", holder ?? "", ownVaultId ?? "", principal]`, `staleTime: 0`, `gcTime: 0`, `retry: false`, `refetchOnWindowFocus: false`, enabled only with a holder and an own vault. This is the only query key the unit makes itself. The keys of the peers it uses are theirs: the card vocabulary's (`stakeholderCardVocabularyQueryKey()`), the picker reading's (`pickerReadingQueryKey()`), the circles read's (`connectionsKey(holder, ownVaultId)`, `["person-card", "connections", holder, ownVaultId]`).

The messages, verbatim (pinned in `messages.test.ts`): `CHECK_FAILED`, `LINK_FAILED_REMOVED`, `LINK_FAILED_KEPT`, `SAVE_FAILED`, `REMOVE_FAILED`, `LINK_FAILED_TAG_KEPT`, `NOT_A_STAKEHOLDER`.

No `localStorage` or `sessionStorage` key is used by the unit.

## Module state

None of its own: the unit holds no module-level variable or cache (the constants `PERSON` and `ONLINE_ROW_TYPE` are strings). The state it relies on is in the units it reads, each of which must exist once in an app: `stakeholder-list-state` (the kept find answers, the deleted and ended ids and the screen's links: the card forgets the finds after it made a card and keeps the deleted ids), `stakeholder-list-doors` (the canonicalisers and anchor shares), and the settings of `base-origin`, `term-origin` and `lws-session-bridge`. Two installed copies of `stakeholder-list-state` would split the card's "never a deleted record" check from the list's.

## Changes in 0.1.2

- devDependencies only: `contact-annotation`, the new peer of `stakeholder-contact-header` 0.1.1, so the installed header resolves it in the tests. The install line is the output of `peers.mjs` again (it now holds `contact-annotation`). No source or test change.

## Changes from production

Named, and only these (also in `unit.json`; the comment-stripped diff against the app's file shows nothing else):

1. The imports are the peers' (below).
2. `ONLINE_ROW_TYPE`: before `import { ONLINE_ROW_TYPE, refreshOnlineStakeholders } from "./onlineStakeholders";` after `const ONLINE_ROW_TYPE = "t:Person";` (private, the same literal, after `PERSON`).
3. The host. The component begins with `const host = useOnlineStakeholderCardHost();` before the source's first statement. Before / after:
   - `useShell()` becomes `host.useShell()`;
   - `refreshOnlineStakeholders()` becomes `host.refreshOnlineStakeholders()` (three calls);
   - `photoReadKeysSync()` becomes `host.photoReadKeysSync()`;
   - `stakeholderCardVocabularyQuery()` becomes `stakeholderCardVocabularyQuery(host.vocabulary)`;
   - `linkedRecordsOf(holder!, ...)` becomes `linkedRecordsOf(host.doors, holder!, ...)`;
   - `recordPerson({ reading ... }, { vault ... })` becomes `recordPerson(host.person, { reading ... }, { vault ... })`;
   - `afterRecordPerson(qc, made)` becomes `afterRecordPerson(host.person, qc, made)` (two calls).
4. Comments are generic (cycle, ticket and agent tags and names removed).
5. 0.1.1: `skillPredicate` is the skill field's write key (`fieldOfTerm(fields, "skill")?.writeKey ?? null`, as the record card passes it), not `null`: a skill of theirs draws by its name, not its address, in a group titled with the field's label.

`deleteRecord`, `idFromEntityUri` and `idFromUri` are the peers' own and take no host. No origin is held at load in this file, so no setting unit changed.

## Do not

- Do not call the host's hooks conditionally or move them: the card calls `useShell` first, on every render, where the source called it.
- Do not give `person`, `doors` or `vocabulary` a fresh object on every render if you can help it: the vocabulary query is made from `vocabulary` on every render.
- Do not make "+ Add your own" write anything on open: the card reads, and the host's `refreshOnlineStakeholders` only redraws a list.
- Do not install a second copy of `stakeholder-list-state`.

## Wrong readings

Kept as the app has them (RuleGhsKeepQuirks), for the owner:

- "A card that was made and linked is always opened." When the lists cannot be read again after the make (`afterRecordPerson` rejects), the card says the error and does NOT open the record, though it is made and linked; the lists are not asked to redraw. The failed-link path swallows the same rejection instead.
- "The link is tried until it works." It is tried twice. A throw of the write and an error state of the controller are the same failure.
- "A person already held is found by name." It is found by the link (`a:sameAs`) only: the screen's loaded record first, else the store's find over every held vault.
- "The name of the new card is the one shown." It is `cardName` of their card, trimmed, or empty when their card is not read; the failure line trims it again.

## Changes in 0.1.3

- devDependencies only: the units `one-card` 0.2.0 now needs (`flag-choice`, `language-fetch-pool`, `flag-source`, `flag-image`, `language-entry`, `language-row`), so the installed card resolves them in the tests. The peer `one-card` is now `^0.2.0`. The install line is the output of `peers.mjs` again. No source or test changed.

## Changes in 0.1.4

- Peer range only: `one-card` 0.3.0 (a skill of theirs is named, not addressed) is the release it is installed with. Peers: `one-card` is now `^0.3.0`. devDependencies gained `skill-uri-label`, `term-name-text`, so the installed units resolve in the tests. The install line is the output of `peers.mjs` again. No source of this unit changed. One test (`OnlineStakeholderCard.skillName.test.tsx`) changed: its skills are term addresses of the ontology origin the test sets, and it expects the names in words ("Evolutionary Project Management"), where it expected the last part of the address ("EvolutionaryProjectManagement").

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/OnlineStakeholderCard.tsx` (whole, 334 lines) to `src/OnlineStakeholderCard.tsx`.

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded); the numbers are token counts.
- Equal: `PartialCreateError` (106) of `pick-or-create`; `bareForm` (22) of `vocabulary-source`; `cardName` (76) and `createOnlineCardController` (1689) of `online-card`; `resolvePersonCard` (361) of `person-connections`; `OneCardGroup` (39) of `one-card-merge`; `AddYourOwnButton` (124) of `add-your-own`; `OneCardOwnGroups` (148), `useOnlineCardState` (105) and `useOnlineCardLabelFor` (198) of `one-card`; `ownVaultIdOf` (118) of `plan-self-source`; `canonicaliserFor` (51), `sessionConnections` (64) and `heldVaultsOwnFirst` (64) of `stakeholder-list-doors`; `newestLinkedId` (50), `screenRecordLinkedTo` (35), `forgetLinkedFinds` (38) and `isDeletedLinkedRecord` (35) of `stakeholder-list-state`; `stakeholderCardState` (206) of `stakeholder-card-model`, and `fieldOfTerm` (93) and `termName` (78) of the same unit's `termFields.ts`; `recordableKinds` (105) of `person-create`; `idFromEntityUri` (39) and `idFromUri` (39) of `lws-vault-sets`.
- Equal except the named seam of that unit: `personCardPlatform` and `onlineCardDeps` (`BASE_ORIGIN` is `baseOrigin()`), `linkedRecordsOf` (the `host` argument and `host.heldRecordFreshMs`), `OneCardBody` (the host read), `recordPerson` and `afterRecordPerson` (the `host` argument), `pickerReadingQuery` (`pickerReadingQueryKey()`), `stakeholderCardVocabularyQuery` (the `host` argument and `stakeholderCardVocabularyQueryKey()`), `deleteRecord` (`"DELETE"` to the auth seam).
- `idFromEntityUri` and `idFromUri` are also in `id-tail` (aliases of `slashTail`, a rewrite). The two were run against the app's on 20,000 strings (empty, `/`, entity URIs, a trailing slash, a query, a hash, a broken percent-encoding): 0 differences for `id-tail` and for `lws-vault-sets`. `lws-vault-sets` is taken: it is token-equal, and a peer already.
- In no unit and not pure: `useShell`, `refreshOnlineStakeholders` and `photoReadKeysSync` (host members). In a fragment: `ONLINE_ROW_TYPE` (`onlineStakeholders.ts:257`), an inline named copy.

`src/index.ts` and `src/onlineStakeholderCardHost.ts` are new.

## Tests

`src/*.test.ts*` (set-up in `test/`, not shipped). Hosts are `example.test` hosts, the people Ann, Ben and Cy. A fake host (`test/world.tsx`) stands for the app's members and records what it was called with; the fake peers (`test/mocks.ts`) replace the create, the delete and the link write, the card vocabulary and the spy on the kept finds, as the app's `vi.mock`s did. The app's two auth modules are the fake auth host of `test/support.ts`. No wall-clock waits: `waitFor` and `findBy` on a condition, and a gate (a promise the test releases) where the app waited a fixed time.

- Ported from GilbApp, 52 of 52 (counted by `it` calls; the seam map said 52): `OnlineStakeholderCard.c214bnNick.test.tsx` 2, `OnlineStakeholderCard.m3f.test.tsx` 25, `OnlineStakeholderCard.s118.test.tsx` 22 (the app's `s118.agenttester`; the same cases as `m3f` without three that came later), `OnlineStakeholderCard.s120.test.tsx` 3 (the app's `s120.agenttester`). The 24 `vi.mock`s of the four files are: the two auth modules (the fake auth host), `recordPerson` (`person-create`), `records` (`lws-records`), `stakeholderCard` (`stakeholder-card-vocabulary`), `onlineStakeholders` (the host's `refreshOnlineStakeholders`) and `linkedAnswers` (`stakeholder-list-state`'s spy). Changes: the stub `ShellContext` is the fake host's `useShell`; `MemoryRouter` is dropped (the card draws no route); `VITE_BASE_ORIGIN` is `setBaseOrigin`; the fixed 300 and 400 ms waits (a refused card reads nothing) wait for the refused line instead, and the one that waited for a held circles read waits for the read to arrive; the 50 ms delay of a slow create is a gate; the `findBy` timeouts of 6000 ms are the defaults.
- New: `host.test.tsx` 20 (the missing provider and its message; the order of the hooks: `useShell` first, then the vocabulary query, then the photo keys, once each on every render, also for the refused line and the actions pane, and no hook added or dropped when the session comes and goes; `useShell` as a hook of its own; the shell's session, `openRecordFromList` called once after the refresh; `refreshOnlineStakeholders` with no argument, once, on each of its three paths and on none of the failing ones, and the order create, link, lists, refresh, open; `photoReadKeysSync` drops a group, drops the `a:` prefix and is read on every render; `doors`, `person` and `vocabulary` given as the host's own objects, first), `behaviour.test.tsx` 26 (the three placements; the kept person-card query key and options, and that it is off without a session or an own vault; which vault is the holder's own: the content scope's row, the landing vault, the session vault's root; when "+ Add your own" is offered; what the create and the link are given; the clean-up at each address; the failure words of each path), `exports.test.ts` 3, `messages.test.ts` 7 (every message constant, verbatim), `example.test.tsx` 2 (the README example renders, and is the README's block), and the host-agnostic check `hostAgnostic.test.ts` 13 runs.

Total: 123 tests in 10 files (52 ported + 71 new).
- Left out: none of the four files; the page-level tests of the app that draw the card inside the whole page (`RecordDetail` and the Stakeholders grid) go through the app's page and are not this unit's. The README's consumer compile (a fresh app from the install line) is not part of the tests here.
