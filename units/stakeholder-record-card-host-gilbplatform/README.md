# stakeholder-record-card-host-gilbplatform

Gives the held stakeholder card everything it needs from GilbPlatform, inside the stakeholder card provider.

## What this is

Gives the held stakeholder card everything it needs from GilbPlatform, inside the stakeholder card provider.

`StakeholderRecordCard` (of `stakeholder-record-card`) draws and edits the card of a person the holder keeps a record of. It asks its host for the shell, the photo term's keys, the vocabulary and the label of an entity address. This unit builds that host from what `StakeholderCardGilbPlatformProvider` (of `stakeholder-card-hosts-gilbplatform`) holds, mounts it, and draws the card: you mount the provider once and put `HeldStakeholderCard` inside it, with no host object written.

- `HeldStakeholderCard({ recordId, vaultId?, slots? })`: the card, with the same props as `StakeholderRecordCard`. `vaultId` is the record's door: the vault that holds it (the second argument of the provider's `onOpenRecord`, when the provider knew it). With no door the card does not read.
- `createStakeholderRecordCardHost(platform)`: the host, for an app that wants to mount the card itself.
- `NO_PROFILE_ADDRESS_SAYS`: the one sentence drawn in place of the card when the provider was given no `settings.mynetProfileUrl`.

It is a separate unit so that the provider does not import the card: the card's own tests install the provider, and a provider that imported the card would be a dependency cycle.

## Host

The host this unit builds is `StakeholderRecordCardHost`. Each member, and what supplies it:

| Member | Supplied by |
|---|---|
| `useShell` | the provider's shell (`useStakeholderCardPlatform().useShell`): session with `shortWebId`, the vault list, the content scope with `readVault`, `writeGuard`, `openRecordFromList` |
| `photoReadKeys` | the provider's, async, one ask for 60 s |
| `photoReadKeysSync` | the provider's, known now |
| `vocabulary` | `createCardVocabularyHost` of the provider, with the provider's `persistVocabulary` when given |
| `useRefLabel` | the provider's label hook (also mounted as `RefLabelContext`) |
| `holdingVaultOf`, `renderRecordPicture`, `renderBandIcon`, `renderTypeDescription`, `renderAttachments`, `renderAddress`, `renderEmployment`, `renderLanguages`, `renderSkillsAndInterests` | absent: the card's defaults stand (see "Differences from GilbApp") |

The card's peers have hosts of their own (`contact-rows`, `stakeholder-set-fields`, `other-linked-records`, `added-by`, `adder-card`, the header's `useContactLabels` and `useHolderOriginLine`, the one card's): the provider mounts them.

## What it writes

Only what the card writes, through the provider's session: an edit is one `PATCH` of the record (autosave, with `If-Match`), "+ Relation" and the kind chips write a relation in the holder's vault, My Note and Where / How we met write through the annotations route. This unit writes nothing itself.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `GET /lws/r/<id>` | the card's record read (`record-detail-reads`), and once more after a 412 | the node of the record's door: the address a cache knows, else the vault named by `vaultId`; never the platform's apex |
| `PATCH /lws/r/<id>` with `If-Match` | the autosave (`record-update`) | the record's own node |
| `PUT /base/r/<id>`, body `{ type, vault, agent, facts }` | "+ Relation" and the kind chips (`kind-relation`, `lws-relations`) | the holder's vault node, the vault in the body |
| `PUT` and `GET /base/connect/annotations` | My Note and Where / How we met (`contact-annotation`) | the holder's vault node (`vaultId` in the body of the PUT) |
| `GET /base/connect/online-card-anchor` | the card, for a record linked to a person (`person-connections`) | the platform's apex |
| `GET /lws/vaults`, `GET /base/a/profilePhoto` | the provider | the apex |
| `GET /base/a/<slug>`, `/base/t/<Type>` | `veda-labels` | the apex, with a Bearer when one is formed; a failure shows the master's label |
| the master's terms, kinds and field sets, the contact catalogue | `term-slots`, `stakeholder-card-vocabulary`, `contact-kind-catalogue` | the ontology origin, anonymous |

A request to a host outside the platform's family carries no credential.

## Differences from GilbApp

- **The MyNet profile address is a setting, and the card needs it.** GilbApp built the "Edit in MyNet" link from the profile app's base address plus `/profile` when its module loaded. Here the provider's `settings.mynetProfileUrl` sets it (`setMyNetProfileUrl` of `own-card-state`). The card's own-card band reads it when it draws and throws when none is set, so without the setting this unit draws the sentence "The MyNet profile address is not set, so this card is not drawn." and no card; it does not throw, and it reads no record.
- **Not given, so the card's defaults stand:** the field pickers of `field-row` (the time zone and the contact language are text boxes); the picture editor, the band icon, the type description, the attachments, and the Address, Employment, Languages and Skills-and-interests sections (the card draws the photo or the initials and the plain skills section, with no notes and no interests); `holdingVaultOf` (the door is `vaultId`, then the vault a create of this session wrote into); the place members of the one card (the Address group never folds into "you have the same" for a holder who has an address of the person).
- `contentScope.reach` is null (the card falls back to the landing row); the request meter is off; content placement and person cards only (the record card's own differences are in its README).
- `readVaultId` follows the read vault (the provider's `viewedVaultId` when the holder's set holds it, else the landing vault): see the provider's README.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`. This unit is new composition code, not an extraction: it copies no line of GilbApp. It replaces what GilbApp's `RecordDetail` got from its shell and its modules (`useShell`, `photoReadKeys`, `useResolvedRefLabel`), which the provider holds.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-record-card-host-gilbplatform`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-record-card-host-gilbplatform` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-name <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/header-layout <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/modes-label <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/org-mark <path-to-the-library>/units/own-card <path-to-the-library>/units/person-name <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/phone-value <path-to-the-library>/units/photo-term <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/record-write <path-to-the-library>/units/entity-write-access <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/sheet-history <path-to-the-library>/units/add-information <path-to-the-library>/units/signin <path-to-the-library>/units/social-logo <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/tag-carrier <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/person-field-row <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/grantee-face <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/record-sidecar-save <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/veda-labels <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/other-linked-records <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/added-by <path-to-the-library>/units/stakeholder-set-fields <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/own-card-state <path-to-the-library>/units/plan-stakeholder-io <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/record-update <path-to-the-library>/units/related-children <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/online-stakeholder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-labels <path-to-the-library>/units/contact-card-slots <path-to-the-library>/units/contact-rows <path-to-the-library>/units/org-employees <path-to-the-library>/units/skill-picker-sheet <path-to-the-library>/units/stakeholder-card-hosts-gilbplatform <path-to-the-library>/units/stakeholder-record-card <path-to-the-library>/units/stakeholder-record-card-host-gilbplatform
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The closure is 132 units besides this one. Install it once: a second copy has its own context.

## Styling

The card and its peers draw with Tailwind v4 utility classes over the host's CSS variables and ship no style sheet: run Tailwind with the installed units' sources in its `@source` scan and define the variables the units read. See "Styling" of `stakeholder-card-hosts-gilbplatform` and of `stakeholder-record-card`; `apps/stakeholder-card-taking-app/styles/app.css` is a working example.

## Example

The one complete wiring of both cards: the provider with its required props, the profile address and `onOpenRecord`; the online card; and after "+ Add your own" the held card of the record that was made, with a button back. It is type-checked with the unit and rendered by `src/example.test.tsx` (`test/example.tsx`). Every value that names a place is a placeholder; yours are your own.

```tsx
// The one complete wiring of both Stakeholder cards on GilbPlatform: the provider (its required props, the profile address and `onOpenRecord`), the online card of a
// person from the holder's circles, and after "+ Add your own" the held card of the record that was made, with a button back. It is type-checked with the unit
// and rendered by `src/example.test.tsx`. Every value that names a place is a placeholder; yours are your own.
import { useState } from "react";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { HeldStakeholderCard } from "@kaigilb/gilbplatformcode-stakeholder-record-card-host-gilbplatform";

export function StakeholderScreens({ session, principal }: {
  session: SessionCredential; // after sign-in: the SessionCredential of the sign-in unit
  principal: string; //          the person whose online card to draw (their principal)
}) {
  // Your page's own state: which record it shows. The provider tells it the record and, when it knows, the vault the record was made in (its door).
  const [held, setHeld] = useState<{ id: string; door: string | undefined } | null>(null);
  return (
    <StakeholderCardGilbPlatformProvider
      origin="https://example.test" //                                       required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //             required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //               required: hosts besides the origin's family that may be read at their own address
      systemHostLabels={["id", "ontology"]} //                               required: first labels of the platform's own hosts
      session={session} //                                                   required: signs every request
      geoOrigin="https://geo.example.test" //                                required: the origin of the shared world catalogue
      onOpenRecord={(id, door) => setHeld({ id, door })} //                  the page opens the record; door is the vault a create of this session wrote it into, when known
      settings={{ mynetProfileUrl: "https://mynet.example.test/profile" }} // REQUIRED for the held card: its own-card band links to it (absent: the card is not drawn, a sentence says why)
    >
      {held ? (
        <>
          <button type="button" onClick={() => setHeld(null)}>Back to the online card</button>
          <HeldStakeholderCard recordId={held.id} {...(held.door ? { vaultId: held.door } : {})} />
        </>
      ) : (
        <OnlineStakeholderCard principal={principal} placementMode="content" />
      )}
    </StakeholderCardGilbPlatformProvider>
  );
}
```

## Tests

`npm test` (vitest, jsdom), 27 tests in 4 files, the provider and this unit alone (no host object written): `heldCard.test.tsx` 13 (the header and the groups; the record read at its own node, signed, never at the apex; a vault held read-only shows no Edit and no + Relation; the autosave `PATCH` at the record's own node with `If-Match` equal to the version read; the `+ Relation` `PUT` at the holder's vault node with the vault in its body; the My Note `PUT` at the holder's vault node; a record linked to a person's online card; the header and the slots sharing one read; the whole path from "+ Add your own"; no profile address: one sentence, no card, no read, no throw; no provider: an error naming it), `recordCardHost.test.tsx` 3, `example.test.tsx` 1, `hostAgnostic.test.ts` 10 (copied). The world is the provider's `test/world.ts` (copied unchanged) with `test/heldWorld.ts` (the annotations route, the contact catalogue, the user-plane link catalogue, the vault list with what the vault represents, the platform's resolver naming a person).

Mutation checks: 13 mutants of `HeldStakeholderCard.tsx` and `recordCardHost.ts`, 12 killed, 1 equivalent (the provider's `persistVocabulary` given as `undefined` is filtered by `createCardVocabularyHost`, so the host is the same): the shell, the two photo-key readers and the label hook replaced by other functions (4), `persistVocabulary` dropped, an optional piece given, a missing address not noticed, a missing address read as an address, a set address not noticed, the host not mounted, the door dropped, the sentence changed.

## Module state

None of its own. `own-card-state` keeps the profile address, and the provider sets it.

## Do not

- Do not draw `HeldStakeholderCard` outside a `StakeholderCardGilbPlatformProvider`: it throws an error that names it.
- Do not mount a second `StakeholderRecordCardHostContext` provider inside it unless you mean to replace the host.

## Wrong readings

- "The provider hosts the held card." It holds what the card needs; this unit builds the card's host.
- "`mynetProfileUrl` is optional." For the provider it is; for this card it is needed, and without it the card is not drawn.
