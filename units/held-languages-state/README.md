# held-languages-state

The state of a held card's languages: the rows, and add, flag, remove, mark and make private.

## What this is

The state of a held card's languages: the rows, and add, flag, remove, mark and make private.

`useHeldLanguages(vaultId, subject, principal, contact)` returns the `LanguagesState` the languages card is drawn from, for a person card HELD in a vault (no rung: a local card's languages are never found by the network).

- **Rows**: every language claim about the person the platform returns, whoever stated it, one row per entry (the viewer's own claim is the row shown). `own` says the viewer stated it: only those can be flagged, removed or made private by them. A read that fails is said (`error`), never shown as "no languages". `noOwnVault`: the viewer has no card of their own to state a language with, so none is offered.
- **Acts**, each after the one before it on the same language has settled, each planning on a fresh read and true only when the read-back carries what was asked: `add(info)` (one create; a language in exactly one country starts with that country's flag), `listLegacy` (is `add`), `setFlag(row, country | null)` (one PATCH per own claim for the entry, carrying only the flag), `remove(row, marked)` (one DELETE per own claim), `setPrivate(row, bool)` (one PATCH with If-Match of the tier and subject, or both null).
- **The contact language** is the record's own `a:contactLanguage`, one tag. `contact = { tag, write }`: `write` is the record's own save. `markContact` writes the entry's tag once; `clearContact` and the removal of the marked language write `""` once. The mark is an intent (`useMarkIntent`): an act that finishes touches the mark only when it is still the tag that act's entry put there. With `write: null` (a record with no such field) nothing is written and the acts say `false`.
- `useMarkIntent`, `ownsMark`, and the types `LanguageRow`, `LanguagesState`.

**The guarantee.** Reading writes nothing: mount, render, idle and a change of the stored tag make zero writes and never call `contact.write`. The record's save is called only by `markContact`, `clearContact` and the removal of the marked row, on the user's act. A claim PATCH carries a null only for the key the user cleared ("No flag", "Make shared").

## What this is not

- Not the rules of the claims: `held-language` composes, reads and writes them.
- Not the card: `language-section` draws it.
- Not a writer of the record: `contact.write` is the caller's.

## How to take it

Package: `@kaigilb/gilbplatformcode-held-languages-state`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/held-languages-state` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-order <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/language-search <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/held-language <path-to-the-library>/units/held-languages-state
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Held language claims through `held-language` (create, PATCH of the flag, DELETE) and `held-notes` (the private mark), each on a call of `add`, `setFlag`, `remove` or `setPrivate`. The record's contact tag through `contact.write`, on `markContact`, `clearContact` and the removal of the marked row. Nothing on mount, render, idle or a change of the stored tag.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| the per-person find of held claims, and each claim read | the rows, and the read before and after an act (`held-notes`) | the vault's own host |
| the master's term reads | the vocabulary (`held-language`) | the ontology origin |
| `POST`, `PATCH`, `DELETE` of claims | the acts, through `held-language` and `held-notes` | the vault's own host |

## Examples

```tsx
import { useHeldLanguages } from "@kaigilb/gilbplatformcode-held-languages-state";

const state = useHeldLanguages(vaultId, recordEntityUri, principal, { tag: contactTag, write: writeContact });
state.rows; // one per language
await state.add(info);
```

## What the host must supply

A `QueryClientProvider` (React Query 5), the adder-card host (`adder-card`), the session and the platform origin the record doors need, and the term origin.

## Module state

None of its own (`held-notes` keeps the act chains; `held-language` the vocabulary).

## Do not

- Do not call `contact.write` from an effect: the unit calls it only on the user's act.
- Do not show a read error as an empty list.
- Do not offer an add when `noOwnVault` is true.

## Wrong readings

- "Removing the marked language always clears the mark." It clears it only if the mark is still that entry's when the removal ends.
- "`add` writes at once." It first reads fresh, and says true only when the read-back carries the claim.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/lib/mynet/languages/languagesState.ts` (the types), `useMarkIntent.ts` and `src/lib/mynet/heldnote/useHeldLanguages.ts`. Each file compared whole with its comments and imports stripped: 0 differing lines (1,432 words).

## Tests

44 tests in 6 files (`npx vitest run`): ported 5 (`useMarkIntent` 3 from the source's `useLanguageInfos.s8fix`; the two cases of `heldPrivate.sb1b` "SB1b-1 a language", re-based to read the PATCH on the wire); new 25 (`useHeldLanguages.test.tsx` 24: the guarantee that reading writes nothing, the rows, add, the flag with the exact bodies and the single null, remove and the mark that moved, the contact tag; plus the unkept mark in `useHeldLanguages.sb1b.test.tsx`), `exports.test.ts` 1, `hostAgnostic.test.ts` 13. The real peers run over a fake platform at the level of `fetch` (`test/`).

Mutation checks: 19 mutants of `src/useHeldLanguages.ts` and `src/useMarkIntent.ts` (a write on render, the same flag written again, a flag on one claim only, removal always or never clearing the mark, others' claims removed, a moved mark overwritten, adds not serialised, mark and clear saying yes with no field, the flag defaulting to the first country, a read error not said, every claim own, one entry as several rows, the put mark not remembered, a private mark not checked, an intent lost on re-render, a blank mark owned), 19 killed.
