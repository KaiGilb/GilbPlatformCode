# stakeholder-card-taking-app

A small app that takes the online stakeholder card and its ready-made GilbPlatform host from this repository, signs a person in, and draws a person from their circles as a card, with "+ Add your own", with no host object written.

## What this is

The compiled, runnable proof of the Stakeholder-card share. It is new code, not extraction, and it is not a unit: `scripts/manifest.mjs` and the proof tools look only at `units/` and `web-units/`, and ignore `apps/`.

It has three screens and no behaviour of its own beyond choosing the screen and passing props. Every read and write goes through the units: the sign-in unit signs the person in, the host unit (`stakeholder-card-hosts-gilbplatform`) answers every host the card needs, the card (`online-stakeholder-card`) draws, reads and adds, and the circles list is the read of `stakeholder-list-doors`.

## How to take it (install and run)

The app installs the units from this repository with `file:` links, re-rooted from the path the units' READMEs print (`<path-to-the-library>/units/...` becomes `../../units/...`). `.npmrc` holds `install-links=true`, so the units are installed as copies: one copy of React and one of each unit, so one copy of each context and of each module's state. The line below is the output of `node scripts/peers.mjs units/stakeholder-card-hosts-gilbplatform` (92 units, the host last, in an order that installs). `peers.mjs` takes one unit folder; the closure of the host already holds `online-stakeholder-card` and `signin`, so that one line covers all three units this app takes. Third-party: `@tanstack/react-query` 5, `react` 19, `react-dom` 19.

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 ../../units/add-your-own ../../units/addressable-slug ../../units/base-origin ../../units/base-record ../../units/birthday-text ../../units/card-mode ../../units/credential-surface ../../units/direct-shares ../../units/entity-ref ../../units/file-words ../../units/folder-part ../../units/id-tail ../../units/entity-ref-value ../../units/narrow-total ../../units/online-card-link ../../units/open-popups ../../units/org-mark ../../units/own-card ../../units/photo-term ../../units/place-lines ../../units/plan-card-facts ../../units/record-picker ../../units/record-sync ../../units/person-connections ../../units/online-card ../../units/record-types ../../units/relation-role ../../units/remove-control ../../units/resource-id ../../units/result-total ../../units/self-card ../../units/share-refusal ../../units/sheet-history ../../units/signin ../../units/stakeholder-list-reader ../../units/stakeholder-ui-kit ../../units/contact-header ../../units/term-origin ../../units/term-slots ../../units/org-terms ../../units/type-curie ../../units/type-key ../../units/plan-kinds ../../units/plan-links-model ../../units/description-parts-model ../../units/plan-stakeholders-model ../../units/vault-list ../../units/vault-modes ../../units/vault-namespace ../../units/vault-origin-rule ../../units/lws-session-bridge ../../units/grantee-face ../../units/lws-records ../../units/file-download-outcome ../../units/lws-vault-sets ../../units/ontology-reads ../../units/lws-relations ../../units/platform-fetch ../../units/stakeholder-list-state ../../units/vault-profile-photo ../../units/vault-type-census ../../units/vocabulary-source ../../units/stakeholder-kinds ../../units/stakeholder-field-sets ../../units/holder-reference ../../units/one-card-merge ../../units/one-card-rows ../../units/one-card-context ../../units/card-group ../../units/record-fact-items ../../units/stakeholder-card-vocabulary ../../units/contact-kind-model ../../units/contact-kind-catalogue ../../units/stakeholder-card-model ../../units/tag-grammar ../../units/tag-client ../../units/main-tag ../../units/pick-or-create ../../units/record-cache-kit ../../units/card-references ../../units/working-set-store ../../units/plan-record-hooks ../../units/plan-self-source ../../units/person-create ../../units/plan-stakeholder-io ../../units/org-employees ../../units/reachable-vaults ../../units/stakeholder-list-doors ../../units/one-card ../../units/stakeholder-contact-header ../../units/online-stakeholder-card ../../units/stakeholder-card-hosts-gilbplatform
```

`package.json` already holds exactly these. To run:

```sh
npm ci
npm run dev
```

`npm run dev` serves the app at `http://localhost:5267`, its allocation in the dev-port map (Rule_Code_dev-ports); the port is set in `vite.config.ts` with `strictPort`, so a busy port fails instead of moving. The config also pre-bundles the units with the automatic JSX runtime (`optimizeDeps.esbuildOptions.jsx`), because the units are installed as source and import no React, so without it the page goes blank with "React is not defined" under `vite` while `vite build` and the tests still pass. Scripts: `dev`, `dev:live`, `build`, `test`, `typecheck`, `check:host-agnostic`.

`npm run dev:live` is for the live sign-in check against production, and is the only way to start it. Production admits only two local addresses, and 5267 is not one of them, so this script serves the app at `http://localhost:5197` (GilbApp's local address) through `vite.live.config.ts`. It first checks that 5197 is free on both IPv4 and IPv6 and stops with a message if it is not (stop GilbApp's dev server first). A page reload ends the session there, by design: the key lives in memory only.

## The three screens

1. **Settings** (first run, kept in `localStorage` under `stakeholder-card-taking-app.settings`, editable later through the Settings button). The platform origin of the vault (typed as `https://<vault>.<platform host>`), the ontology origin, the world catalogue origin (`geoOrigin`), the system vault hosts and the system host labels, and the six optional settings of the host (`ontologyApiOrigin`, `ontologyApiOriginRaw`, `publicCorpusOrigin`, `localRigHosts`, `minOntologyQuery`, `vocabTypeBatchRevisions`). Nothing is baked in: `src/` names no host. `.env.example` shows placeholders only; the app reads no environment value. Changing the platform origin while signed in signs the person out.
2. **Sign in.** The sign-in unit's card: an email, then the one-time code, then the card screen. The code is verified by `SessionCredential.signInWithCode` of `signin` (a DPoP key made in memory, no cookie). The key and the token live in memory only; nothing of the session is stored. A **Sign out** button drops the credential (`invalidate(true)`) and returns here.
3. **Card.** A field for a person's principal (WebID), a **Placement** select (`content`, the default, `full` or `actions`) and **Show card**. The card is `OnlineStakeholderCard` drawn inside `StakeholderCardGilbPlatformProvider` alone (the one provider; the app writes no other). **People in your circles** lists the people the holder placed, one button each with their circle; a click fills the field. When the card opens a record after "+ Add your own", the page says in one sentence which record opened (`onOpenRecord`); the app has no record view.

The props the app passes to the provider: `origin`, `ontologyOrigin`, `geoOrigin`, `systemVaultHosts`, `systemHostLabels`, `settings` (when any optional value is set), `session` and `onOpenRecord`. It passes no `queryClient`, `viewedVaultId`, `refreshOnlineStakeholders`, `persistVocabulary`, held-note or place members (see "Differences from GilbApp" below); the photos are the units' own, which the provider supplies. The props it passes to the card: `principal` and `placementMode`.

### The circles list

The list uses the unit's export only: `sessionConnections` of `stakeholder-list-doors` (the read the card itself shares, so the holder's circles are read once), and `displayPlacements` and `placementLabel` of `person-connections` for the words. `readConnections` of `person-connections` needs a platform client and the holder's own vault id; the provider gives neither to a child, so the list takes the vault id the way the card does: `useVaults` of `reachable-vaults` over the session, and `ownVaultIdOf` of `plan-self-source`. The app adds no logic of its own to these.

## What it proves

That a developer can take the online stakeholder card and its ready-made host from this repository and have them draw, read and add with zero host objects written: `npm test` draws a seeded person's card (header with name and initials, body rows) from a typed principal against a fake platform, signing every read with a DPoP proof; sends the create of "+ Add your own" with an own card, with DPoP headers; for a holder with no own card makes the basic card first (a `POST` to the self-card door, with DPoP) and then sends the create; lists the seeded circles and fills the field on a click; and reads each prop the app passes at the provider's and the card's seam. `npm run build` compiles the app. The tests use copies of the host unit's fakes (`test/world.ts`, `test/fakeSession.ts`, `test/support.ts`, `test/fixturePlatform.ts`, `test/fixtureReference.ts`, `test/fixtureTag.ts`, `test/writableFields.ts`, each with a header naming its source): a unit's test fake cannot be imported by path, because its bare imports resolve from the unit's folder.

## Differences from GilbApp

Copied from the provider's README:

- **"+ Add your own" makes the holder's own card, as GilbApp does (host 0.2.0).** With no card of their own in the landing vault the holder gets a basic one (`POST …/selfcard`, signed), read back, and then the person is added, stated by it. With no landing vault in the list the source's sentence (`NO_OWN_VAULT_SAYS`) shows and nothing is written. (Host 0.1.0 refused with a sentence of its own, `NO_OWN_CARD_SAYS`; it is gone.)
- **Photos are the units' (host 0.2.0).** The holder's vault photo and the person's shared photo are drawn by `vault-profile-photo` and `grantee-face`, supplied by the provider; this app passes none of its own.
- **No held notes.** `useHolderOriginLine` and `useContactLabels` are MyNet libraries. Without your own, the header draws no "Where / How we met" line and no kind chips. The default of `useContactLabels` is the value of GilbApp's hook in its disabled branch, the only one this card reaches (see "Not measured").
- **The content scope has no `reach`.** The shell's `contentScope` is `{ readVaultId: viewedVaultId ?? null, reach: null }`. In GilbApp `reach` is the viewed vault's row; the card's `ownVaultIdOf` reads it as the holder's own vault's row. With `reach` null, `ownVaultIdOf` falls back to the vault flagged as landing in the decorated list, which is the holder's own. The card does not read `readVaultId`.
- **`onOpenRecord` is yours.** The card opens a record after a create through `openRecordFromList`. Without `onOpenRecord` nothing opens: the card stays in place and the new card is not shown until you open it. This app passes one that says which record opened.
- **The online list is yours.** `refreshOnlineStakeholders` draws your online Stakeholders list again. No unit holds that list, so the default is nothing.
- **The request meter is off.** GilbApp counted requests by wrapping the page's `fetch`, which a library does not do. `requestsSent` is `() => 0`, so the reader's per-screen request budget starts from 0.
- **Held-address place members.** The four place members default to finding nothing. This is exact for the online stakeholder card, which passes no address to the one card. A record card would need the MyNet place libraries.

## Not yet proven live

Nothing here has run against the real platform. The units are proven against a fake platform in their tests, and this app against the same fake. The live check, in a test vault the owner names (`npm run dev:live`, then sign in at `http://localhost:5197`), must show:

1. **The decorated vault list.** `GET /lws/vaults` answers with the landing flag on the holder's own vault, and the session's `vault.id` equals one of its `vaultId` values. Without that the header and the add act are not offered (the lean rows have no landing flag). A session adopted from the one-time-code sign-in carries no vault list (`vaults: []`), so the decorated list is also what the circles list relies on to find the holder's own vault.
2. **The header.** The holder's vault and name on the left, the circle chips, the person's name and initials on the right.
3. **The card body.** The person's rows, marked as theirs, in the order of the person kind.
4. **One add.** "+ Add your own" with an own card makes the person's card in the holder's own vault, links it, and calls `onOpenRecord` with its id (the page then names the record).

## Rules for a live check

A live check uses a non-production test vault the owner names. Writes go only there. No vault is ever deleted, by this app or by a check of it; a system vault is never written to by a test. The sign-in sends a real email and uses the real code; no code is read from a server log.

## Tests

`npm test` (vitest, jsdom), 36 tests in 4 files: `src/App.test.tsx` (12: settings, sign-in and sign-out, the card, the placement select, one add, one add with no own card yet, the circles list), `src/props.test.tsx` (4: the props the app passes to the provider and the card, read at their seam), `src/hostAgnostic.test.ts` (12: the host-agnostic check passes on `src/` and fails on each planted fault) and `test/ports.test.ts` (8: the two port pins, the scripts, and the start script's check and start). No wall-clock waits; each test starts with fresh `localStorage` and `sessionStorage` and a fresh provider (and so a fresh `QueryClient`). `npm run check:host-agnostic` runs the check alone: `src/` names no host and imports only its own modules and the packages listed in `scripts/check-host-agnostic.mjs`.
