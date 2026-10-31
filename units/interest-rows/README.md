# interest-rows

A person card's Interests: each with its note, who added it and who sees it.

## What this is

A person card's Interests: each with its note, who added it and who sees it.

One React component, `InterestRows({ vaultId, principal, recordEntityUri, canEdit })`.

The interests of a person on a held card: one framed group "Interests" with a row for each interest (its name, "About this interest" note, "Added by", and the private/shared switch), a (−) to remove it and "Add interests" to pick one from the catalogue. An interest is ONE held claim in the vault that holds the record (`useHeldNotes("interest")` of `held-notes`: `a:heldParty`, `a:topicInterest`, `a:statedBy`, and the note `a:topicInterestNote` on the same claim): adding one makes its claim, removing one deletes it. The person's record is not written (an interest is not a field of Person). Not shared: no audience pill, no rung.

In the card's presentation mode the interests are text (no (−), no add, nothing at all when there are none); a click on a name turns edit mode on. A person with no landing vault of their own who may edit is not offered the group.

**An interest is shown by its name, never by its address.** The name picked in this session, else the term's own label (one read of the term), else "…" while it is read, else, when the read failed or gave no label, the catalogue name in the term's address (`referentNameOf` of `term-name-text`: `.../base/t/StreetPhotography` is "Street Photography"), else the word "An interest". No line shows the address, and no accessible name or title holds it or a part of it.

**The guarantee.** An absent `renderSkillsAndInterests` slot runs no code of this unit and writes nothing. With the slot present, mount, render, idle and a `canEdit` change make zero writes. The record's autosave carries nothing of this section. A held-claim PATCH carries a null only for the key the person cleared: emptying a note PATCHes exactly `{"a:topicInterestNote": null}`; Make shared nulls exactly `a:visibilityTier` and `a:claimSubject`. Adding an interest is ONE POST of one claim; removing one is a DELETE of the viewer's own claim and nothing else.

## What this is not

- Not the skills: that is `skill-rows` over `contact-rows`.
- Not the note store: that is `held-notes`.
- Not the host slot: `stakeholder-record-card-host-gilbplatform` supplies `renderSkillsAndInterests` and mounts this unit and `skill-rows`.
- Not the catalogue picker: that is `skill-picker-sheet` (`noun="interest"`).

## How to take it

Package: `@kaigilb/gilbplatformcode-interest-rows`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/interest-rows` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/own-card <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/added-by <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-rows <path-to-the-library>/units/skill-picker-sheet <path-to-the-library>/units/interest-rows
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Through `held-notes`: the held claim of an interest (create on add, PATCH of the note and of the private/shared mark, DELETE on remove). Nothing else.

## Requests and their servers

The person's held claims in the vault that holds the record (once per page, shared with `skill-rows`), the claim vocabulary of the ontology, the viewer's own card, and one read of each interest's term for its label (`GET <ontology origin>/base/t/<Name>`, once per term per session). The catalogue search is the picker's, made only when the person presses "Add interests".

## Examples

```tsx
import { InterestRows } from "@kaigilb/gilbplatformcode-interest-rows";

<InterestRows vaultId={vaultId} principal={session.principal} recordEntityUri={record.entityUri} canEdit={canEdit} />
```

## What the host must supply

The host of `added-by` and of `adder-card`, a `QueryClientProvider`, the ontology origin (`setTermOrigin`), and the record's `CardModeProvider` when the card has a presentation mode. CSS variables: `--ink`, `--accent`, `--bad`, `--r-sm`.

## Module state

None of its own. The held-note chains and caches are `held-notes`'; the term labels are `term-slots`'.

## Do not

- Do not draw the interest's address anywhere, not as a line, a title or an accessible name.
- Do not offer the group to a person with no landing vault of their own: the interest would have no source.

## Wrong readings

- "The name is the last part of the address." It is the term's label; the last part is used only for an ontology term address, split into words.
- "Removing an interest keeps its note." The claim holds the note; deleting the claim deletes both.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/components/records/InterestRows.tsx`, lines 20-185 (a new header comment; the imports are the units'). Compared with the comments and imports stripped: `InterestRows` differs in 14 lines, all of them the name rule (see the named changes); the private `TermName` (lines 33-47) is replaced by the hook `useTermNames`.

## Tests

52 tests in 6 files plus the host-agnostic check (`npx vitest run`): ported from the source: `InterestRows.c214.test.tsx` 12, `InterestRows.s8cardlook.test.tsx` 4, `InterestRows.s10iter1focus.test.tsx` 1 (17; two changes are named below); new: `InterestRows.name.test.tsx` 11, `InterestRows.guarantee.test.tsx` 9, `exports.test.ts` 2; `hostAgnostic.test.ts` 13.

Two ported cases changed because of the name rule: the (−) control is named "Remove interest photography" (the source: "Remove interest Photography", the last part of the address), and the presentation case waits for the name (the source drew the last part of the address at once, then the label).

Mutation checks: 18 mutants (the address line drawn again; the address or its tail as the reading or fallback name; each of the four accessible names given the tail or the address; a picked name ignored; a claim added or a note made private on mount or on a `canEdit` change; the no-own-vault guard removed; presentation not hiding the controls; the skills read instead of the interests; a removal that also empties the note; the term asked every time; and, on the installed copy of `held-notes`, emptying a note also nulling the source and Make shared nulling a third key), 18 killed.
