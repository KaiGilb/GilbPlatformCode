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
| `renderLanguages` | `LanguageSection` of `language-section`, given the slot's props as they are: the Languages group of the held card, with **no** country search (`renderCountrySearch` is not given: a language's flag is chosen among its own countries, or "No flag") |
| `renderSkillsAndInterests` | `SkillRows` of `skill-rows` then `InterestRows` of `interest-rows`, one after the other, each given its half of the slot's props as they are (`p.skills`, `p.interests`): the Skills group with the held note under each picked skill, and the Interests group |
| `renderEmployment` | `EmploymentRows` of `employment-rows`, through the host's own small component: the slot's props as they are, `find` = `findOrganizationRecords` of `org-hierarchy` (the organization records of the holding vault), and `vaultName` = the name the shell lists for the holding vault (absent when it lists none; the section then says "this vault"). Since 0.5.0 the two work-place slots are given: `renderWorkLocation` = `WorkLocationField` of `work-location-field` (the Location box) and `renderPlaceName` = `WorkPlaceName` of `work-place-name` (the read-only name, with what it is and where), and `catalogueOrigin` = the provider's `geoOrigin` (so a place stored as a compact `base:e/<id>` reads as that place; absent when no origin is known). **Write guard:** when the vault, the record or any employment edge the section would write to is inside the place catalogue, the section is given `canEdit: false` and a line says why ("This section cannot be changed here: it is stored in the place catalogue, which is read only."); nothing is written to the catalogue |
| `holdingVaultOf`, `renderRecordPicture`, `renderBandIcon`, `renderTypeDescription`, `renderAttachments`, `renderAddress` | absent: the card's defaults stand (see "Differences from GilbApp") |

The card's peers have hosts of their own (`contact-rows`, `stakeholder-set-fields`, `other-linked-records`, `added-by`, `adder-card`, the header's `useContactLabels` and `useHolderOriginLine`, the one card's): the provider mounts them.

## What it writes

Only what the card writes, through the provider's session: an edit is one `PATCH` of the record (autosave, with `If-Match`), "+ Relation" and the kind chips write a relation in the holder's vault, My Note and Where / How we met write through the annotations route, and the Languages group writes held language claims (create, a `PATCH` of the flag or of the private mark, `DELETE`) and, on the user's act, the record's own `a:contactLanguage` through the card's save. This unit writes nothing itself.

**The guarantee of the Skills-and-Interests slot.** An absent `renderSkillsAndInterests` slot runs no code of `skill-rows` or `interest-rows` and writes nothing: the card draws the plain `ContactRows kind="skill"` (the skills, with no note and no Interests). With the slot present, mount, render, idle and a `canEdit` change make zero writes. The record's autosave never carries a `a:skill`, `a:fieldMeta` or interest key, or a null or "", for a field the sections did not own and the user did not touch. A held-claim PATCH carries a null only for the key the user cleared (an emptied note; Make shared). **Removing a skill** is ONE record PATCH that nulls the skill's value list and that skill's sidecar entry (`a:fieldMeta`), and then, only once the record kept it, ONE DELETE of the viewer's own claim for that skill: both are the user's act. An interest is a claim alone: adding one is a POST, removing one a DELETE, and the person's record is not written. **The gate is the card's own:** the Skills and Interests are drawn only on a record whose field set has a Skill field (`StakeholderRecordBody.tsx`: `section.kind === "skill"`, as in GilbApp `RecordDetail.tsx` line 721); a record without one gets neither, even with the slot given. A skill and an interest are shown by their names, never their addresses.

**The guarantee of the Employment slot.** An absent `renderEmployment` slot runs no code of the Employment section, asks for no employment term or entity, writes nothing, and leaves the rest of the card as the 0.3.0 host drew it (a test compares the two, ids aside). With the slot present, mount, render, idle and a `canEdit` change make zero writes. The record's autosave never carries the `employment` key, a null or a "" for a field the section did not own and the user did not touch (the card keeps the edge key). Each employment is its own `t:Employment` entity in the vault that holds the record; an entity is made on the first real edit, an edit is ONE PATCH of that entity naming only what the person changed (a null only for the key they removed), a link or an unlink is ONE conditional PATCH of the record's edge key, and **removing an employment drops the edge and never deletes the entity**. The company box searches the organization records of the holding vault only, names that vault, and says so when a search was not complete or failed (never "no such company"); the organization-vault finder (`org-find`) is never called. A record that names employments in a vault that is not known says so, and a failed read withholds the add box. **The gate is the Employment field's own, not the Skill field's:** the section is drawn on a person card (the card has the person's names) whose field set holds the `employment` term and whose record has an address (`StakeholderRecordBody.tsx`: `section.kind === "employment"`, `contactSections`, as in GilbApp `RecordDetail.tsx` lines 1465-1481); it does not need a Skill field, which only the Skills, Interests and Languages groups do. In the card it comes after the Skills, Interests and Languages groups. A test master must serve the nine terms of an employment (`org`, `jobTitle`, `claimSlotKey`, `name`, `startDate`, `endDate`, `ongoing`, `workLocation`, and `employer` and `employee` for the link) and the type `Employment`; `test/world.ts` serves them.

**The guarantee of the Languages slot.** An absent `renderLanguages` slot runs no HC19b code and writes nothing. With the slot present, mount, render, idle and a `canEdit` change make zero writes. The record's autosave never carries a null or "" for a field the section did not own and the user did not touch. A held-claim PATCH carries a null only for the key the user cleared (No flag; Make shared). Clearing the marked contact language hands the record's save `""` for that one field, on the user's act; the record card sends it as `null` for that field only (no other key).

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
| `GET <geo origin>/base/search?q=<text>&type=<kind>`, `GET <row address>` (anonymous, `credentials: "omit"`) | the Location box and the place name (0.5.0; `geo-catalogue`) | the place catalogue, and only an address inside it; **never written** (a write guard refuses a section whose target is the catalogue) |
| `GET <ontology origin>/base/t/GeoRegion/children`, `GET <ontology origin>/base/t/<kind>` | the same, once per tab | the ontology origin, anonymous |
| the master's terms, kinds and field sets, the contact catalogue | `term-slots`, `stakeholder-card-vocabulary`, `contact-kind-catalogue` | the ontology origin, anonymous |

A request to a host outside the platform's family carries no credential.

## Changes in 0.5.0

- The host gives the work place (closes the work-location part of the Employment section): the Location box and the read-only place name, by their names, with what the place is and where. A stored place whose name is not known is "A place" with a line that says why (a failed read, a place the catalogue no longer holds, an address that is not the catalogue's); never an empty box and never an address. Picking a place is ONE PATCH of that employment (the company and titles that go with every update, and the place as an address); emptying the box is the same PATCH with the place `null`; a title edit writes no place. The patch is `employment-store`'s, unchanged.
- The write guard (`src/geoWriteGuard.ts`): every address the section may write to is looked at before the section is given the means to write; one inside the place catalogue is refused (`assertNoGeoWriteTarget` throws `GeoWriteRefusedError`, no request), and the section is drawn read-only with the line above. The test is on the parsed origin (`isGeoUrl` of `geo-origin`), never on the text.
- Peers gain `employment-edges`, `geo-origin`, `work-location-field` and `work-place-name`; `scripts/check-host-agnostic.mjs` allows the four imports. New: `src/geoWriteGuard.ts`, `src/geoWriteGuard.test.ts`, `src/heldCard.workLocation.test.tsx`, `test/geoWorld.ts`. Changed tests: `recordCardHost.test.tsx` (the slot test now pins the two slots and the origin), `heldCard.employment.test.tsx` (a place is "A place" in a world that serves no catalogue).

## Differences from GilbApp

- **The MyNet profile address is a setting, and the card needs it.** GilbApp built the "Edit in MyNet" link from the profile app's base address plus `/profile` when its module loaded. Here the provider's `settings.mynetProfileUrl` sets it (`setMyNetProfileUrl` of `own-card-state`). The card's own-card band reads it when it draws and throws when none is set, so without the setting this unit draws the sentence "The MyNet profile address is not set, so this card is not drawn." and no card; it does not throw, and it reads no record.
- **Not given, so the card's defaults stand:** the field pickers of `field-row` (the time zone and the contact language are text boxes); the picture editor, the band icon, the type description, the attachments, and the Address section (the card draws the photo or the initials); the Employment section is drawn **without a work place** (no place name, no Location box; a stored place is carried, not shown), and without a work-place search, until a place slot is given; `holdingVaultOf` (the door is `vaultId`, then the vault a create of this session wrote into); the place members of the one card (the Address group never folds into "you have the same" for a holder who has an address of the person).
- `contentScope.reach` is null (the card falls back to the landing row); the request meter is off; content placement and person cards only (the record card's own differences are in its README).
- `readVaultId` follows the read vault (the provider's `viewedVaultId` when the holder's set holds it, else the landing vault): see the provider's README.

## Changes in 0.4.0

- The host gives `renderEmployment`: the Employment group of the held card (`EmploymentRows` of `employment-rows`), with the finder of organization records of `org-hierarchy` (0.1.2 or later: a hit that failed to read makes the answer incomplete) and the holding vault's name from the shell. No work-place slot is given. Peers gain `employment-rows` and `org-hierarchy`; `scripts/check-host-agnostic.mjs` allows the two imports. New: `src/heldCard.employment.test.tsx`; `test/world.ts` serves the employment terms (`org`, `claimSlotKey`, `name`, `startDate`, `endDate`, `ongoing`, `workLocation`).

## Changes in 0.3.0

- The host gives `renderSkillsAndInterests`: the Skills group of the held card with the held note under each picked skill (`SkillRows` of `skill-rows`) and the Interests group (`InterestRows` of `interest-rows`), as one Fragment: Skills, then Interests (then the Languages, which the card draws next). A skill and an interest are shown by their names, never their addresses. Peers: `skill-rows` ^0.1.0 and `interest-rows` ^0.1.0. `test/skillsWorld.ts` is new (a test fixture); the unit's lockfile is made again (it named older versions of the peers).

## Changes in 0.2.0

- The host gives `renderLanguages`: the Languages group of the held card (`LanguageSection` of `language-section`), with a language drawn by its name and its flag, add, flag, remove, mark the contact language and make private. No country search is given (`renderCountrySearch` is absent). Peer: `language-section` ^0.1.0. `test/fixturePlatform.ts` answers `DELETE /lws/r/<id>` (a test fixture, not shipped as source); `test/languagesWorld.ts` is new.

## Changes in 0.1.1

- devDependencies only: the units `one-card` 0.2.0 now needs (`flag-choice`, `language-fetch-pool`, `flag-source`, `flag-image`, `language-entry`, `language-row`), so the installed card resolves them in the tests. The install line is the output of `peers.mjs` again. No source or test changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`. This unit is new composition code, not an extraction: it copies no line of GilbApp. It replaces what GilbApp's `RecordDetail` got from its shell and its modules (`useShell`, `photoReadKeys`, `useResolvedRefLabel`), which the provider holds.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-record-card-host-gilbplatform`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-record-card-host-gilbplatform` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/claim-handle <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/company-search <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/employment-role <path-to-the-library>/units/entity-name <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/flag-choice <path-to-the-library>/units/folder-part <path-to-the-library>/units/geo-origin <path-to-the-library>/units/header-layout <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/flag-chooser <path-to-the-library>/units/language-order <path-to-the-library>/units/language-row <path-to-the-library>/units/modes-label <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/org-mark <path-to-the-library>/units/own-card <path-to-the-library>/units/person-name <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/phone-value <path-to-the-library>/units/photo-term <path-to-the-library>/units/picker-box <path-to-the-library>/units/place-lines <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/record-write <path-to-the-library>/units/entity-write-access <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/role-when <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/sheet-history <path-to-the-library>/units/add-information <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/social-logo <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/tag-carrier <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/language-search <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/employment-link <path-to-the-library>/units/person-field-row <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/grantee-face <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/employment-vocab <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/record-sidecar-save <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/employment-store <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/veda-labels <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/other-linked-records <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/employment-edges <path-to-the-library>/units/employments-state <path-to-the-library>/units/employment-card <path-to-the-library>/units/employment-rows <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references <path-to-the-library>/units/record-detail-reads <path-to-the-library>/units/added-by <path-to-the-library>/units/stakeholder-set-fields <path-to-the-library>/units/work-location-field <path-to-the-library>/units/work-place-name <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/own-card-state <path-to-the-library>/units/plan-stakeholder-io <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/record-update <path-to-the-library>/units/related-children <path-to-the-library>/units/stakeholder-list-doors <path-to-the-library>/units/one-card <path-to-the-library>/units/stakeholder-contact-header <path-to-the-library>/units/online-stakeholder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-labels <path-to-the-library>/units/contact-card-slots <path-to-the-library>/units/contact-rows <path-to-the-library>/units/held-language <path-to-the-library>/units/held-languages-state <path-to-the-library>/units/language-section <path-to-the-library>/units/org-employees <path-to-the-library>/units/org-hierarchy <path-to-the-library>/units/skill-picker-sheet <path-to-the-library>/units/interest-rows <path-to-the-library>/units/skill-rows <path-to-the-library>/units/stakeholder-card-hosts-gilbplatform <path-to-the-library>/units/stakeholder-record-card <path-to-the-library>/units/stakeholder-record-card-host-gilbplatform
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The closure is 161 units besides this one. Install it once: a second copy has its own context.

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

0.5.0: `npm test` (vitest, jsdom), 100 tests in 9 files (58 before): `heldCard.workLocation.test.tsx` 14 new, `geoWriteGuard.test.ts` 21 new, `recordCardHost.test.tsx` 8 (2 new, 1 changed), `heldCard.employment.test.tsx` 15 (1 changed). Mutation checks of 0.5.0: 12 mutants of `recordCardHost.ts` and `geoWriteGuard.ts` (the origin not passed or the vault's, the guard removed or blind to edges, to the vault or to the record, a catalogue address in a query counted as the catalogue, the guard's note or its `canEdit` dropped, either slot not given, the Location box given the address as its label) and 1 of `employment-role` (a date edit naming the place), 13 killed.

Before 0.5.0: `npm test` (vitest, jsdom), 58 tests in 7 files (0.4.0: 42 before; `heldCard.employment.test.tsx` 15 new, `recordCardHost.test.tsx` 6 of which 1 new), the provider and this unit alone (no host object written). `heldCard.employment.test.tsx` draws the held card over a person with two employments (one with a stored work place) and pins: each employment by company, role line and title with no address and no place; zero writes on mount, render, idle and opening and closing edit mode; an unrelated edit is ONE PATCH with no section key and no null; a title edit is ONE PATCH of that employment naming its company and titles only, the place kept; a remove is ONE PATCH of the record's edge key and no DELETE; no request to `org-find`; the company box names the holding vault by the shell's name; the section comes after the Skills, Interests and Languages groups and once; it is drawn without a Skill field; an organization record draws none and reads none; and with the slot removed the card is the 0.3.0 card (same markup, ids aside) and asks for no employment term or entity.

Mutation checks of 0.4.0: 8 mutants of `recordCardHost.ts` (an empty section always supplied, the section supplied twice, another finder, the vault's name not handed on or replaced by its address or taken from the first vault, a place slot given, `canEdit` not the card's), 8 killed.

Before 0.4.0: `npm test` (vitest, jsdom), 42 tests in 6 files (0.3.0: 34 before; `heldCard.skills.test.tsx` 7 new, `recordCardHost.test.tsx` 5 of which 1 new), the provider and this unit alone (no host object written): `heldCard.test.tsx` 13 (the header and the groups; the record read at its own node, signed, never at the apex; a vault held read-only shows no Edit and no + Relation; the autosave `PATCH` at the record's own node with `If-Match` equal to the version read; the `+ Relation` `PUT` at the holder's vault node with the vault in its body; the My Note `PUT` at the holder's vault node; a record linked to a person's online card; the header and the slots sharing one read; the whole path from "+ Add your own"; no profile address: one sentence, no card, no read, no throw; no provider: an error naming it), `recordCardHost.test.tsx` 4 (one new: `renderLanguages` draws `LanguageSection` with the slot's props as they are and no country search), `heldCard.languages.test.tsx` 6 (new: the section draws a held language by name and flag; mounting and idling make zero writes; an unrelated edit's PATCH carries nothing of the section; the contact language written on the user's act; with the slot removed, no section, no language read, no write, and the same PATCH), `example.test.tsx` 1, `hostAgnostic.test.ts` 10 (copied). The world is the provider's `test/world.ts` (copied unchanged) with `test/heldWorld.ts` (the annotations route, the contact catalogue, the user-plane link catalogue, the vault list with what the vault represents, the platform's resolver naming a person).

Mutation checks of 0.3.0: 8 mutants of `recordCardHost.ts` (the slot wired to nothing or not given, only the interests or only the skills drawn, the order swapped, the skills drawn twice, the skills given the whole slot's props, the interests given the skills' props), 8 killed. `heldCard.skills.test.tsx` (7): the skill and the interest drawn by name with their notes and no address, Skills before Interests in one container, a skill once; zero writes on mount; an unrelated edit's PATCH carries nothing of the sections; a typed note is ONE POST of one claim with exactly its keys; removing the skill is ONE PATCH (the value list and that skill's sidecar entry null) then ONE DELETE; with the slot removed, the plain skills are drawn, no note, no Interests, nothing of the notes' vocabulary or an interest's term read, nothing written, and the same PATCH for the same edit.

Mutation checks of 0.2.0: 8 mutants of `recordCardHost.ts` (the slot not given or drawing nothing, `canEdit` dropped, a country search given, the record's save, the principal or the vault not handed on, another optional piece given), 8 killed. Earlier, 13 mutants of `HeldStakeholderCard.tsx` and `recordCardHost.ts`, 12 killed, 1 equivalent (the provider's `persistVocabulary` given as `undefined` is filtered by `createCardVocabularyHost`, so the host is the same): the shell, the two photo-key readers and the label hook replaced by other functions (4), `persistVocabulary` dropped, an optional piece given, a missing address not noticed, a missing address read as an address, a set address not noticed, the host not mounted, the door dropped, the sentence changed.

## Module state

None of its own. `own-card-state` keeps the profile address, and the provider sets it.

## Do not

- Do not draw `HeldStakeholderCard` outside a `StakeholderCardGilbPlatformProvider`: it throws an error that names it.
- Do not mount a second `StakeholderRecordCardHostContext` provider inside it unless you mean to replace the host.

## Wrong readings

- "The provider hosts the held card." It holds what the card needs; this unit builds the card's host.
- "`mynetProfileUrl` is optional." For the provider it is; for this card it is needed, and without it the card is not drawn.
