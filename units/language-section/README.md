# language-section

The Languages group of a held person card: the languages by name and flag, add, flag, remove, mark the contact language, make private.

## What this is

The Languages group of a held person card: the languages by name and flag, add, flag, remove, mark the contact language, make private.

Three components.

- `LanguageSection({ vaultId, principal, recordEntityUri, canEdit, contactTag, writeContact, renderCountrySearch? })`: the held card's Languages over the held store (`held-languages-state`). `writeContact` is the record's own save of its `a:contactLanguage` (null when the record has no such field); with `canEdit` false it is not handed on at all. A person with no landing vault of their own, who may edit, is not offered the group.
- `LanguagesCard({ state, editMode, renderAccess?, renderCountrySearch? })`: the card over any `LanguagesState`: one framed group; the contact language marked and first; each language with its flag (the claim's, else the language's one country, else the neutral globe); "Add languages"; "Make contact language"; the (−); a stored tag that no entry matches shown as the marked row; a failed catalogue read said once with "Try again". In the card's presentation mode: text and flags only.
- `LanguageEntryPicker({ excludeUris, onPick, onCancel })`: the search box for adding one language (after two characters), without the ones already listed.

**A language is drawn by its name, never by its address.** While its entry is read the name is "…"; read, it is the entry's own name; when the read failed, or the entry gives no name of its own, it is "A language" with the globe. Never the address, never the last part of it (a country with no flag file is named by its local id in the flag choice: that is a country, not a language).

**The country search is a slot.** `renderCountrySearch` is the host's search over all countries for the flag choice. Absent: no "Another country…" button and no search; the language's own countries and "No flag (globe)" stay.

**The guarantee.** An absent `renderLanguages` slot runs no HC19b code and writes nothing. With the slot present, mount, render, idle and a `canEdit` change make zero writes. The record's autosave never carries a null or "" for a field the section did not own and the user did not touch. A held-claim PATCH carries a null only for the key the user cleared (No flag; Make shared). Clearing the marked contact language writes `""` to that one field, on the user's act.

## What this is not

- Not the host slot: `stakeholder-record-card-host-gilbplatform` supplies `renderLanguages` and mounts `LanguageSection`.
- Not the rules of the claims (`held-language`) or their state (`held-languages-state`).
- Not a country search (a slot), and not the viewer's row of the online card (`language-row`).

## How to take it

Package: `@kaigilb/gilbplatformcode-language-section`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/language-section` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/flag-chooser <path-to-the-library>/units/language-order <path-to-the-library>/units/language-row <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/picker-box <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/language-search <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/added-by <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/held-language <path-to-the-library>/units/held-languages-state <path-to-the-library>/units/language-section
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Through `held-languages-state` (held language claims; the private mark) and `writeContact` (the record's contact tag), each only on the user's act: adding, choosing or clearing a flag, removing, marking, making private or shared. Nothing on mount, render, idle or a change of `canEdit`.

## Requests and their servers

None of its own. The reads of `held-languages-state`, `language-entry` (the entries), `flag-source` (the two small flag files of each country shown, never the country entity) and `language-search` (the picker, anonymous GET).

## Examples

```tsx
import { LanguageSection } from "@kaigilb/gilbplatformcode-language-section";

<LanguageSection
  vaultId={vaultId}
  principal={principal}
  recordEntityUri={recordUri}
  canEdit={canEdit}
  contactTag={contactLanguage}
  writeContact={contactSlug ? (tag) => commitField(contactSlug, tag) : null}
/>
```

## What the host must supply

React 19 and React Query 5 (`QueryClientProvider`); the adder-card host; an `AddedByHostContext.Provider` (the "Added by" line); the card's `CardModeProvider` where there is one; the session, platform origin and term origin; Tailwind scanning this unit's `src` and the units it draws (`flag-chooser`, `flag-image`, `picker-box`, `remove-control`, `card-group`, `added-by`); the CSS variables `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--sel`, `--bad`, `--accent`, `--r-sm`. Optionally `renderCountrySearch`.

## Module state

None of its own.

## Do not

- Do not call `writeContact` from an effect, or hand one to a reader: the unit passes it on only for an editor, and calls it only on the user's act.
- Do not draw a language yourself from `a:languageUsed`: it is an address.
- Do not pass a stand-in for `renderCountrySearch`: pass nothing.

## Wrong readings

- "Removing a language clears the contact language." Only the marked one, and only if the mark is still its own when the removal ends.
- "A failed entry read shows the last part of the address." It shows "A language".

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/components/mynet/LanguagesCard.tsx`, `LanguageEntryPicker.tsx` and `src/components/records/LanguageSection.tsx`. Compared whole with comments and imports stripped: `LanguageEntryPicker` 0 differing lines; `LanguagesCard` and `LanguageSection` differ only in the named changes below.

## Tests

79 tests in 12 files (`npx vitest run`): ported 46 from the source (`LanguageSection.s8lang` 22, `.s8fix` 10, `.s9reader` 5; `LanguagesCard.s8cardlook` 5, `.s10iter1focus` 2, `.s10notice` 2), re-based on the units (the real peers over a fake platform at the level of `fetch`, the example hosts), including the F3 assertion that no country entity is ever requested; new 19 (`LanguageSection.guarantee.test.tsx`: zero writes on mount, render, idle and `canEdit` flips; the record's save only on the user's act; the exact PATCH bodies and the only nulls (No flag, Make shared); the country search absent and present; no address or id tail in any state; the entry picker); `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 16 mutants of `src/LanguagesCard.tsx`, `LanguageSection.tsx` and `LanguageEntryPicker.tsx` (the country search not handed on, in either file; the end of an address shown while reading, on failure, or for an unnamed entry; the record's save handed to a reader or called on render; another's language removable; the contact language made in presentation; the no-vault group offered; the privacy switch on another's language; the picker starting at once or offering a listed language; the unmatched tag named while an entry failed; the flag choice not opened for several countries; the chosen flag ignored), 16 killed.
