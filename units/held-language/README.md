# held-language

The held language claims of a person card: compose, read, add, set the flag of, and remove one.

## What this is

The held language claims of a person card: compose, read, add, set the flag of, and remove one.

One held claim (`t:HeldPartyFieldClaim`) per (person, language), in the vault that holds the person's record. React-free; `held-languages-state` is its loading state.

- The shape: `a:heldParty` (the person's record), `a:languageUsed` (a catalogue language entry), optional `a:flagCountry` (a catalogue country), `a:statedBy` (the adder's own card) and `a:directReader` (the signed-in principal, the self read-back grant). **Never** a rung (`a:visibilityTier`) or a claim subject: those put a claim into the network find index, and `heldLanguageFacts` refuses both.
- `heldLanguageFacts(vocab, args)`: the one composer. Refuses a language that is not an entry address on the term origin (read now: the same path on a foreign origin is refused) and a flag that is not a catalogue address.
- `resolveHeldLanguageVocab()`: the spellings, asked of the ontology master by term name, kept on success only; a term the master does not name makes it throw `HeldLanguageVocabUnavailableError`.
- Reading: `toHeldLanguage`, `heldLanguagesOf` (id order), `heldLanguagesAbout(list, subject)`, `ownHeldLanguages(list, card)` (only the claims the viewer's own card stated), `dedupeHeldLanguages(list, card)` (one row per entry, the viewer's own claim first).
- Writing: `addHeldLanguage` (one create; an entry already on the card writes nothing), `setHeldLanguageFlag(vaultId, claim, country | null)` (one PATCH carrying only the flag; `null` clears it and keeps the language), `removeHeldLanguages(vaultId, claims)` (one DELETE per claim named).

## What this is not

- Not the loading state or the contact-language mark: that is `held-languages-state`.
- Not a reader of the person's claims from the vault: `held-notes` lists them (`listHeldClaimsAbout`).
- Not a drawer.

## How to take it

Package: `@kaigilb/gilbplatformcode-held-language`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/held-language` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/language-entry <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/language-search <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/held-language
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Creates, patches and deletes held language claims (`t:HeldPartyFieldClaim`) through `vault-resources`, only on the call of `addHeldLanguage`, `setHeldLanguageFlag` and `removeHeldLanguages`. A null is sent in one case: `setHeldLanguageFlag(…, null)` sends `{ flagCountry: null }`, and nothing else.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `POST /lws/vault/<vault>/c` | `addHeldLanguage` | the vault's own host |
| `PATCH /lws/r/<id>` | `setHeldLanguageFlag` | same |
| `DELETE /lws/r/<id>` | `removeHeldLanguages` | same |
| the master's term reads | `resolveHeldLanguageVocab` (through `term-slots`) | the ontology origin |

## Examples

```ts
import { addHeldLanguage, setHeldLanguageFlag } from "@kaigilb/gilbplatformcode-held-language";

const r = await addHeldLanguage({ vaultId, subject: recordUri, language: entryAddress, existing, stater: ownCard, readerPrincipal });
if (r.kind === "create") await setHeldLanguageFlag(vaultId, r.claim, countryAddress);
```

## What the host must supply

The signed-in session the record doors need (`lws-session-bridge`), the platform origin, and `setTermOrigin` (for the entry address check).

## Module state

`cached`: the resolved vocabulary (one promise; success only). `__resetHeldLanguageVocab()` forgets it, for tests.

## Do not

- Do not add a rung or a claim subject to a held language claim: a local card's language must never be found by the network.
- Do not store a language by its name or a `/base/t/` address: the entry address is what is stored.
- Do not delete a claim the viewer did not state: use `ownHeldLanguages` to choose what to remove.

## Wrong readings

- "A cleared flag deletes the language." It sends `flagCountry: null` for that claim and keeps the language.
- "The entry check is a pattern fixed when the file loads." It is built from the term origin on each call.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/lib/mynet/heldnote/heldLanguage.ts`, lines 1-241 less its imports. Compared by symbol with the comments stripped: 23 declarations, 22 with 0 differing lines; `heldLanguageFacts` differs in the one line below.

## Tests

37 tests in 3 files (`npx vitest run`): `heldLanguage.test.ts` 23, all new (the source has no test of this file alone; its cases are in the languages section's tests, which are in `language-section`, and in `heldPrivate.sb1b`, in `held-languages-state`): the composer and its refusals including the foreign origin, the vocabulary, the reading, the three writes with the exact wire bodies. `exports.test.ts` 1, `hostAgnostic.test.ts` 13. The real peers run over a fake platform at the level of `fetch` (`test/`).

Mutation checks: 16 mutants of `src/heldLanguage.ts` (the entry check dropped, or without the origin, the flag not checked, a clear sent as "", a flag set that also nulls the language, a claim subject, a duplicate add, no id order, the vocabulary not kept or a failure kept, remove deleting nothing, own claims including others', about counting a multi-party claim, the viewer's claim not first, a write with no vault), 16 killed.
