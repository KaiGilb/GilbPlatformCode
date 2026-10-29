# stakeholder-card-vocabulary

Reads and keeps the vocabulary the Stakeholder card needs from the ontology master: the field sets per kind and the reference rules, as query options a page can share.

## What this is

Reads and keeps the vocabulary the Stakeholder card needs from the ontology master: the field sets per kind and the reference rules, as query options a page can share.

Plain functions and types, no React, no credential. The kinds and the field sets are read once per app session and held; a second card makes no master read. No kind and no field is named in the unit: they are the master's answers.

- `readStakeholderCardVocabulary(source, kindReader?)`: reads the kinds first, on their own (so a master without the carrier selector still tells a stakeholder kind from any other type), then the field sets on that kind set. Gives a `StakeholderCardVocabulary`: `kindNames` (each once, served order), `kindsComplete`, `fieldSets` (or `null`), `fieldSetsRefusal` (the package's own words when the field sets are not known yet, never "no fields"), `roleLabel`, `createShortcuts` and `shortcutSteps`. A failed kinds read rejects. A "not known yet" refusal of the field sets is an answer; any other failure is rethrown. Without a `kindReader` it makes a memory-only one over `source`, for this call alone.
- `cardMasterSource(fetchImpl?)`, `masterFetch(inner?)`, `CARD_CARRIER_PAGE_SIZE` (400): the master as the card reads it. `masterFetch` passes the request init on, so the `cache: "no-cache"` the readers ask for reaches the network. The carrier read is asked for 400 per page (the master held 320 carriers of `a:fieldOf` on 2026-10-22, so one request, not four); past 400 the reader still follows `next`.
- `stakeholderCardVocabularyQuery(host, fetchImpl?)`: the one set of query options for the session reading: `staleTime: Infinity`, `gcTime: Infinity`, `retry: false`, `retryOnMount: false`, `refetchOnMount: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`; `placeholderData` is the stored copy; `queryFn` reads, stores and gives the reading. With a `fetchImpl` of its own the host's reader is a memory-only one over it.
- `referenceReadingQuery(fieldSets, fetchImpl?)`: the options for what the reference pickers show: `staleTime: KIND_SET_MAX_AGE_MS` (10 minutes), `gcTime: Infinity`, `retry: false`; through the page's shared kind and type-tree readers, or memory-only readers over `fetchImpl`.
- `stakeholderCardVocabularyQueryKey()`, `stakeholderReferenceReadingQueryKey()`: the two query keys. They are functions because they name the ontology origin, which the app sets after this module loads (see "What the host must supply").
- `readStoredCardVocabulary(force?, storeKey?, host?)`, `storeCardVocabulary(reading, force?, storeKey?, host?)`: the last reading kept on this device (`localStorage`) and shown at once as a placeholder while the session's own read runs. Only a reading with field sets is stored. A missing, full or damaged store costs only the warm start.
- Types: `StakeholderCardVocabulary`, `CardVocabularyHost`.

## What this is not

- Not the master reader, the kinds, the field sets or the reference reading: those are the peers `vocabulary-source`, `stakeholder-kinds`, `stakeholder-field-sets` and `holder-reference`.
- Not React Query: the options are plain objects (`as const`); the unit imports no query library. A page passes them to `useQuery`.
- Not the card's rules over a reading (which fields show, how a name is saved): that is `stakeholder-card-model`.
- Not the Plan card's vocabulary: the Plan card reads a look-alike of its own.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-card-vocabulary`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-card-vocabulary` prints:

```sh
npm install <path-to-the-library>/units/record-sync <path-to-the-library>/units/term-origin <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess` and `noImplicitOverride`, as `holder-reference` does, because the peers' source is type-checked with it.

## Examples

```ts
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { stakeholderKindReader } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { stakeholderCardVocabularyQuery, type CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

setTermOrigin("https://ontology.platform.example.test"); // once, at start-up

const host: CardVocabularyHost = {
  masterKindReader: (fetchImpl) => stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test", ...(fetchImpl ? { fetchImpl, store: null } : {}) }),
};
// in a component: useQuery(stakeholderCardVocabularyQuery(host))
```

## What the host must supply

- The ontology origin: `setTermOrigin(origin)` of `term-origin`, once at start-up. Every function here reads `termOrigin()` when it is called, and throws the setting's error when it is unset. The three values the app built when its module loaded (the two query keys and the storage key) are functions for that reason.
- `CardVocabularyHost`, passed to `stakeholderCardVocabularyQuery(host, fetchImpl?)` (and its `persistVocabulary` to `readStoredCardVocabulary` and `storeCardVocabulary` as the last argument):
  - `masterKindReader(fetchImpl?)`: the kind reader of the page. Replaces `masterKindReader(fetchImpl ? masterFetch(fetchImpl) : undefined)`, GilbApp `src/lib/base/stakeholderCard.ts` line 198 (calling `src/lib/base/stakeholderKinds.ts` line 68). With a fetch of its own, a memory-only reader over it; without, the page's shared reader. Called each time the query function runs.
  - `persistVocabulary?()`: whether the last reading is kept on this device. Replaces `import.meta.env?.MODE !== "test"`, GilbApp `src/lib/base/stakeholderCard.ts` line 168 (a value read once when the module loaded). Optional: a host without it persists, as production does. It is asked at each read and store, so a test runner can turn the copy off.
- A `localStorage` for the device copy. Without one the unit works and keeps nothing.
- A fetch for master reads (the global `fetch` unless you pass one).

## Module state

None of its own. The unit is plain functions. It reads two settings that hold state and must exist once in an app: `term-origin` (the origin) and the page's shared kind reader of `stakeholder-kinds` (what `host.masterKindReader` returns without a fetch). Two installed copies of either break behaviour: the second would not see the origin the app set, or would read the kinds a second time.

## Do not

- Do not change the storage key. The device copy is kept under `gilbapp.cardVocabulary.v1.<origin>` (the origin is `termOrigin()` at the time of the call). The name is the app's and is kept so a copy stored by the app stays readable; a unit that renamed it would silently drop every device's warm start.
- Do not keep the two query keys in a module constant: they depend on the origin, which is set after this module loads.
- Do not read an absent `fieldSets` as "no fields". It is "not known yet", and `fieldSetsRefusal` says so.
- Do not fill `roleLabel` or the shortcut labels with a word of your own. They are the master's, or `null`.
- Do not install a second copy of `term-origin`.

## Wrong readings

- "The reading is read once per session." It is read once per query lifetime: the options keep it forever (`staleTime: Infinity`, `gcTime: Infinity`), so a page that mounts a second query cache reads again.
- "The stored copy is always shown first." It is shown only when the host's `persistVocabulary` allows (or none is given) and a copy with a kind list and field sets is stored; otherwise `placeholderData` gives `undefined`.
- "`kindsComplete: false` means no kinds." It means the listing was not whole; `kindNames` is a floor.
- "A refused field-set read rejects." It does not: it gives `fieldSets: null` and the refusal in `fieldSetsRefusal`. A failed kinds read does reject.
- "`force` on the device copy overrides a missing store." It overrides only the host's `persistVocabulary`; with no `localStorage` the read gives `undefined` and the write does nothing.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/stakeholderCard.ts` lines 55-212 and 697-720 to `src/stakeholderCardVocabulary.ts`. The brief for this unit named 698-720; line 697 is the doc comment of the line-698 constant and is taken with it.

**Merged units compared and taken.** Every imported symbol is imported from a merged unit; none is copied. Each declaration was compared with the source (token for token, comments and imports excluded): `vocabulary-source` (`masterSource`, `VocabularyUnavailableError`, `TermFetch`, `VocabularySource`; vs `gilb-stakeholders` `source.ts` and `terms.ts`), `stakeholder-kinds` (`createStakeholderKindReader`, `KIND_SET_MAX_AGE_MS`, `StakeholderKindReader`, `kindDescendants`; vs `kindReader.ts` and `kinds.ts`), `stakeholder-field-sets` (`resolveFieldSets`, `StakeholderFieldSets`; vs `fieldSets.ts`) and `holder-reference` (`readReferenceVocabulary`; vs `holderReference.ts`), all at `gilb-stakeholders` `0a261488be7c98d1ac5d79887c966a445b8928bd`: every declaration is the same. `term-origin` is the setting for the ontology origin (it replaces the app's `GILBVEDA_MASTER_ORIGIN`). The app's `masterKindReader` (`stakeholderKinds.ts` line 68) is not taken: the library's `plan-stakeholder-io` holds a copy that differs from it only in reading `termOrigin()`, but importing that unit would install 42 units for a twelve-line function, so it is a host member.

Named changes, and only these (22 differences in the code tokens, all below):

1. the imports (source lines 25-53 of the whole file) are five imports of the peers above;
2. the interface `CardVocabularyHost` is added and exported; its comments name the app call each member replaces;
3. `GILBVEDA_MASTER_ORIGIN` (the app's constant for the ontology origin) is `termOrigin()` at its three uses inside functions (`cardMasterSource`, the default reader of `readStakeholderCardVocabulary`, the `vedaOrigin` option of `referenceReadingQuery`);
4. three module-load constants that held the origin become functions that read it when called:
   - `export const STAKEHOLDER_CARD_VOCABULARY_QUERY_KEY = ["gilb-stakeholders", "card-vocabulary", GILBVEDA_MASTER_ORIGIN] as const;` is `export function stakeholderCardVocabularyQueryKey() { return ["gilb-stakeholders", "card-vocabulary", termOrigin()] as const; }`;
   - `export const STAKEHOLDER_REFERENCE_READING_QUERY_KEY = ["gilb-stakeholders", "reference-reading", GILBVEDA_MASTER_ORIGIN] as const;` is `export function stakeholderReferenceReadingQueryKey() { return ["gilb-stakeholders", "reference-reading", termOrigin()] as const; }`;
   - `const CARD_VOCABULARY_STORE_KEY = \`gilbapp.cardVocabulary.v1.${GILBVEDA_MASTER_ORIGIN}\`;` (not exported) is `function cardVocabularyStoreKey(): string { return \`gilbapp.cardVocabulary.v1.${termOrigin()}\`; }`; its use as the default of `storeKey` in the two device-copy functions is `cardVocabularyStoreKey()`. The string is kept as it is;
   - the uses of the two query-key constants in the options are calls: `queryKey: stakeholderCardVocabularyQueryKey()` and `queryKey: stakeholderReferenceReadingQueryKey()`;
5. the env value `const DEVICE_COPY = import.meta.env?.MODE !== "test";` (line 168) is removed; its two uses `if (!DEVICE_COPY && !force)` are `if (!(host?.persistVocabulary?.() ?? true) && !force)`, and `readStoredCardVocabulary` and `storeCardVocabulary` take a fourth and third optional argument `host?: Pick<CardVocabularyHost, "persistVocabulary">` after `storeKey`;
6. `stakeholderCardVocabularyQuery(fetchImpl?: TermFetch)` is `stakeholderCardVocabularyQuery(host: CardVocabularyHost, fetchImpl?: TermFetch)`; inside, `masterKindReader(fetchImpl ? masterFetch(fetchImpl) : undefined)` is `host.masterKindReader(...)` with the same argument, `storeCardVocabulary(v)` is `storeCardVocabulary(v, false, undefined, host)` and `placeholderData: () => readStoredCardVocabulary()` is `readStoredCardVocabulary(false, undefined, host)`;
7. comments that name a cycle, a ticket, an agent, a person, a ruling or the host app are reworded; no code changed. No string literal carries a tag.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts): `test/support.ts` and `test/fixtureReference.ts` are the same files as in `holder-reference` (`gilb-stakeholders` `test/fixtureMaster.ts` and `test/fixtureReference.ts`), `test/memoryStorage.ts` is new (a fresh in-memory `localStorage` for each test). Ported from GilbApp `src/lib/base/` at the same commit: `stakeholderCard.carrierPage.sp2c.test.ts` 6 of 6 (here `carrierPage.test.ts`; the tests set `term-origin` where the app's constant was) and `stakeholderCard.storedVocabulary.c214e1.test.ts` 3 of 3 (`storedVocabulary.test.ts`; `localStorage` is a fresh in-memory store for each test). New: `stakeholderCardVocabularyPinned.test.ts` (30: the export list; the origin read at call time and its error when unset; `masterFetch`; the reading with its kinds, shortcut steps, refusal and rethrow; the device copy and the host's `persistVocabulary`; both query-option sets; the page size). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: the third `stakeholderCard.*.test.ts` file (8 tests of the card's rules, not of the reading: they go with `stakeholder-card-model`).
