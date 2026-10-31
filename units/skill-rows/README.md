# skill-rows

A person card's Skills section with the held note under each picked skill.

## What this is

A person card's Skills section with the held note under each picked skill.

One React component, `SkillRows({ vaultId, principal, recordEntityUri, ...rowsProps })`.

It is the Skills section of `contact-rows` (`ContactRows kind="skill"`) with the held notes of the person's skills handed in: it loads them once (`useHeldNotes("skill", vaultId, recordEntityUri, principal)` of `held-notes`, in the vault that holds the record) and gives them to the section as `skillNotes`. Under each picked skill the section then draws the host's "About this skill" note, "Added by" and the private/shared switch. With no `vaultId` there is nowhere to read or write the notes: none is read, none is drawn, and the section is the plain Skills section.

The skill is shown by its name (`contact-rows` 0.2.0), never by its address.

**The guarantee.** An absent `renderSkillsAndInterests` slot runs no code of this unit and writes nothing (the card draws the plain `ContactRows kind="skill"`). With the slot present, mount, render, idle and a `canEdit` change make zero writes: the unit reads (GET) the person's held claims and nothing else until the person acts. The record's autosave never carries a null or "" for a field this section did not own and the person did not touch. A held-claim PATCH carries a null only for the key the person cleared: emptying a note PATCHes exactly `{"a:skillDepthNote": null}`; Make shared nulls exactly `a:visibilityTier` and `a:claimSubject`. **Removing a skill** is ONE record PATCH that nulls exactly that skill's sidecar entry (`a:fieldMeta`), and then, only once the record kept it, a DELETE of the viewer's own claim(s) for that skill. Both are the person's act, never from an absent slot.

## What this is not

- Not the Skills section itself: that is `contact-rows`.
- Not the note store: that is `held-notes`.
- Not the host slot: `stakeholder-record-card-host-gilbplatform` supplies `renderSkillsAndInterests` and mounts this unit and `interest-rows`.

## How to take it

Package: `@kaigilb/gilbplatformcode-skill-rows`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/skill-rows` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/own-card <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-rows <path-to-the-library>/units/skill-rows
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Through `contact-rows`: the record's sidecar (a picked skill is saved at once, a removed one is nulled). Through `held-notes`: the held claim of a note (create, PATCH, DELETE) and its private/shared mark. Nothing else.

## Requests and their servers

The person's held claims in the vault that holds the record (`GET /base/find-by-attribute` for `a:heldParty`, then one read per claim), the claim vocabulary of the ontology, the viewer's own card; once per page, shared with `interest-rows`. The skill search of the picker is the host's, made only when the person presses "Add skills".

## Examples

```tsx
import { SkillRows } from "@kaigilb/gilbplatformcode-skill-rows";

<SkillRows
  vaultId={vaultId}
  principal={session.principal}
  recordId={record.id}
  recordEntityUri={record.entityUri}
  title="Skills"
  valueKey="skill"
  metaKey="fieldMeta"
  etag={record.etag}
  served={{ values, meta }}
  canEdit={canEdit}
  onSaved={reload}
/>
```

## What the host must supply

Everything `contact-rows` needs (its host provider: `saveRecordSidecar`, the picker, the note, the switch, the "Added by" line), the host of `added-by` and of `adder-card`, a `QueryClientProvider`, the ontology origin (`setTermOrigin`), and the record's `CardModeProvider` when the card has a presentation mode.

## Module state

None of its own. The held-note chains and vocabulary caches are `held-notes`'.

## Do not

- Do not draw this and the plain `ContactRows kind="skill"` together: a skill would appear twice.
- Do not pass `kind`, `skillNotes` or `recordEntityUri` in the rest props: the type refuses them.

## Wrong readings

- "No `vaultId` means an empty note." It means no note is read or drawn.
- "Removing a skill deletes every note on it." Only the viewer's own claims for that skill; another adder's note stays.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/components/records/SkillRows.tsx`, lines 7-26 (a new header comment; the imports are the units'). Compared with the comments and imports stripped: 0 differing lines.

## Tests

39 tests in 3 files plus the host-agnostic check (`npx vitest run`): `SkillRows.c214.test.tsx` 19 (ported from the source's `SkillRows.c214.test.tsx`, re-based on the real peers over a fake platform at `fetch`), `SkillRows.guarantee.test.tsx` 6 (new), `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 11 mutants (a note saved, a skill added or a note made private on mount or on a `canEdit` change, a vault read when none is given, interests read instead of skills, the principal not handed on, the wrong section, the notes never handed in; and, on the installed copies of the peers, emptying a note also nulling the source, Make shared nulling a third key, removing a skill nulling every skill entry), 11 killed.
