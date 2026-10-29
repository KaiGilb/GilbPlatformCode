# plan-cards-taking-app

A small app that takes the four Plan cards and the ready-made GilbPlatform host from this repository, signs a person in, and draws, reads and saves a card in their vault, with no host object written.

## What this is

The compiled, runnable proof of the Plan-card share: one taking app for the family (Value, Function, Solution, Development Resource). It is new code, not extraction, and it is not a unit: `scripts/manifest.mjs` and the proof tools look only at `units/` and `web-units/`, and ignore `apps/`.

It has three screens and no behaviour of its own beyond choosing the screen and the card. Every read and write goes through the units: the sign-in unit signs the person in, the host unit (`plan-card-hosts-gilbplatform`) answers the fourteen host contexts, and the card units draw and save.

## How to take it (install and run)

The app installs the units from this repository with `file:` links, re-rooted from the path the units' READMEs print (`<path-to-the-library>/units/…` becomes `../../units/…`). `.npmrc` holds `install-links=true`, so the units are installed as copies: one copy of React and one of each unit, so one copy of each context and of each module's state. The line below is the output of `node scripts/peers.mjs units/plan-card-hosts-gilbplatform` (84 units, host last, in an order that installs; it includes `signin`) followed by the four whole cards (`peers.mjs` takes one unit folder, so the four cards, whose closure is inside those 84, are added to its line by hand). Third-party: `@dnd-kit/core` 6.3.1, `@tanstack/react-query` 5, `react` 19, `react-dom` 19.

```sh
npm install @dnd-kit/core@6.3.1 @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 ../../units/base-origin ../../units/base-record ../../units/card-mode ../../units/card-group ../../units/date-rules ../../units/direct-shares ../../units/entity-ref ../../units/fact-faithful ../../units/folder-part ../../units/help-doc ../../units/id-tail ../../units/entity-ref-value ../../units/narrow-total ../../units/online-card-link ../../units/open-popups ../../units/field-row ../../units/own-card ../../units/plan-button-row ../../units/plan-card-facts ../../units/qualifier-values ../../units/qualifier-value-picker ../../units/record-picker ../../units/record-sync ../../units/record-types ../../units/relation-role ../../units/remove-control ../../units/result-total ../../units/share-refusal ../../units/signin ../../units/sortable-tree ../../units/tag-client ../../units/term-origin ../../units/type-curie ../../units/plan-impacts-model ../../units/plan-source ../../units/type-key ../../units/plan-kinds ../../units/plan-links-model ../../units/description-parts-model ../../units/description-help ../../units/description-parts-view ../../units/plan-stakeholders-model ../../units/plan-stakeholder-lines ../../units/plan-tag-picker ../../units/plan-impacts ../../units/project-levels ../../units/type-name ../../units/type-picture ../../units/plan-type-level-version ../../units/type-term-popover ../../units/type-chooser ../../units/plan-tag-links ../../units/plan-type-field ../../units/value-card-model ../../units/value-card-write ../../units/value-graph-geometry ../../units/value-graph ../../units/value-line-kit ../../units/value-endpoint-line ../../units/value-illustration ../../units/value-levels-line ../../units/value-meters-line ../../units/value-qualifiers-line ../../units/value-scale-line ../../units/plan-card ../../units/vault-origin-rule ../../units/lws-session-bridge ../../units/lws-records ../../units/lws-vault-sets ../../units/ontology-reads ../../units/lws-relations ../../units/platform-fetch ../../units/main-tag ../../units/record-cache-kit ../../units/plan-levels-io ../../units/stakeholder-list-state ../../units/vault-type-census ../../units/vocabulary-source ../../units/stakeholder-kinds ../../units/working-set-store ../../units/plan-record-hooks ../../units/plan-self-source ../../units/plan-stakeholder-io ../../units/plan-card-hosts-gilbplatform ../../units/value-card ../../units/function-card ../../units/solution-card ../../units/resource-card
```

`package.json` already holds exactly these. To run:

```sh
npm ci
npm run dev
```

`npm run dev` serves the app at `http://localhost:5266`, its allocation in the dev-port map (Rule_Code_dev-ports); the port is set in `vite.config.ts` with `strictPort`, so a busy port fails instead of moving. Scripts: `dev`, `dev:live`, `build`, `test`, `typecheck`, `check:host-agnostic`.

`npm run dev:live` is for the live sign-in check against production, and is the only way to start it. Production admits only two local addresses, and 5266 is not one of them, so this script serves the app at `http://localhost:5197` (GilbApp's local address) through `vite.live.config.ts`. It first checks that 5197 is free on both IPv4 and IPv6 and stops with a message if it is not (stop GilbApp's dev server first). A page reload ends the session there, by design: the key lives in memory only.

## The three screens

1. **Settings** (first run, kept in `localStorage` under `plan-cards-taking-app.settings`, editable later through the Settings button). The platform origin of the vault (typed as `https://<vault>.<platform host>`), the ontology origin, the system vault hosts and the system host labels, and the six optional settings of the host (`ontologyApiOrigin`, `ontologyApiOriginRaw`, `publicCorpusOrigin`, `localRigHosts`, `minOntologyQuery`, `vocabTypeBatchRevisions`). Nothing is baked in: `src/` names no host. `.env.example` shows placeholders only; the app reads no environment value. Changing the platform origin while signed in signs the person out.
2. **Sign in.** The sign-in unit's card: an email, then the one-time code, then the card screen. The code is verified by `SessionCredential.signInWithCode` of `signin` (a DPoP key made in memory, no cookie). The key and the token live in memory only; nothing of the session is stored. A **Sign out** button drops the credential (`invalidate(true)`) and returns here.
3. **Card.** A field for a record's address (`<origin>/…/e/<id>`) or its id, a **Can edit** toggle (default off: read-only), and **Show card**. The record is read with `readRecord` of `lws-records` and drawn inside `PlanCardsGilbPlatformProvider` alone (the one provider; the app writes no other). The card is chosen by the record's type with `isTypeName` of `type-key` (Value, Function, Solution, Resource = Development Resource). Any other type, or a record that names none, is named in a plain sentence. The Edit control is the card mode's own (`CardModeActions` of `card-mode`, which the cards do not draw themselves and which draws nothing when the person may not write).

The props the app passes to the provider: `origin`, `ontologyOrigin`, `systemVaultHosts`, `systemHostLabels`, `settings` (when any optional value is set), `session` and `canEdit`. It passes no `queryClient`, `self`, `ownCard`, `navigate`, `createStakeholderDialog`, `renderTypeIcon` or `HelpButton`; the stakeholder lines are therefore read-only (see the host README, "Differences from GilbApp").

## What it proves

That a developer can take the four Plan cards and the ready-made host from this repository and have them draw, read and save with zero host objects written: `npm test` draws each of the four cards from a seeded record's address against a fake vault, read-only by default, lists the groups each card's README lists, sends one edit as one PATCH signed with a DPoP proof and the version the record was read at, and shows a nameless linked record by its main tag (`POST /base/tag/masters`, signed). `npm run build` compiles the app. The tests use copies of the host unit's fakes (`test/fakeVault.ts`, `test/fakeSession.ts`, each with a header naming its source).

## Proven live, and not yet

The units this app takes were checked on production on 2026-10-29 (served revision `527b612a8af8e27e1bcd730080a98bbe84588ca9`): create, read, an edit through the Value card (one `PATCH` with `If-Match` and a DPoP proof carrying `ath`), read-back, the main tag, the draw, and the end, all answered 2xx. The details are in the host unit's README, "Proven live". An ended record still answers 200, as a tombstone with `entityLifecycleState: "ended"`.

Not yet proven live: this app's own one-time-code sign-in from a browser, which needs a person to read the emailed code (`npm run dev:live`, then sign in at `http://localhost:5197`). A session adopted from the one-time-code sign-in carries no vault list (`vaults: []`), so the session-backed parts of the host (the vault rows of the shell, `ownCard`) see none; the cards read and save by the record's own address.

## Rules for a live check

A live check uses a non-production test vault the owner names. Writes go only there. No vault is ever deleted, by this app or by a check of it; a system vault is never written to by a test. The sign-in sends a real email and uses the real code; no code is read from a server log.

## Tests

`npm test` (vitest, jsdom): `src/App.test.tsx` (settings, sign-in, the four cards, edits, main tag), `src/cardFor.test.tsx` (which component draws which type, by identity: the four cards draw the same lines for the same record, so a wrong choice would not show on the page), `src/hostAgnostic.test.ts` (the host-agnostic check passes on `src/` and fails on each planted fault) and `test/ports.test.ts` (the two port pins, the scripts, and the start script's check and start). No wall-clock waits; each test starts with fresh `localStorage`, `sessionStorage` and a fresh provider (and so a fresh `QueryClient`). `npm run check:host-agnostic` runs the check alone: `src/` names no host and imports only its own modules and the packages listed in `scripts/check-host-agnostic.mjs`.
