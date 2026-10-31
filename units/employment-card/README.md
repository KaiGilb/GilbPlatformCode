# employment-card

One person's employments as a framed group: company, role dates, titles; add, edit and remove.

## What this is

One person's employments as a framed group: company, role dates, titles; add, edit and remove.

`EmploymentCard({ title, editor, editMode, recordsVaultId, vaultName?, find, vaultUnknown?, renderWorkLocation?, renderPlaceName? })` draws one framed group (`card-group`) for the employments an `EmploymentsEditor` (from `employments-state`) holds. For each employment: the company (`company-search`), the role's date line ("Aug 2025 – Present · 1 yr 2 mos", from `role-when`), From / To month pickers and "Present", and each title. "add job title" adds a title row to an employment, "add employment" a new block; the (−) removes one. In the card's presentation mode (`card-mode`) an employment reads as text, a blank one is not drawn, and a tap turns edit mode on; the add and remove controls show only in edit mode. `RoleWhen` (the date and place line) is exported too.

**The work place is a slot.** `renderWorkLocation` (the edit control) and `renderPlaceName` (the read-only name) are optional. Absent, no place is drawn anywhere and there is no Location box; a stored place is carried unchanged: the role the card hands back names the place it was given, so a save of the dates neither changes nor clears it. The card imports no place catalogue.

**A company and a role show by name.** A stored value that is an address (another writer left one) is drawn as "A company" or "A role", in the text, in the labels of the controls and in the box when it is opened; leaving that box unchanged asks for nothing.

**Unknown is not empty.** With `vaultUnknown` the card says the employments are not shown because their vault is not known, and the group is drawn. After a failed read (`editor.error`, shown as given) the card draws no add box and no "add employment": a first entry is not invited over a list that could not be read. An edge that did not read is said once and kept.

**It writes nothing but through the editor, and only on the person's act:** a click, Enter, or a blur of a text that changed. Mount, render, idle and a change of `editMode` ask the editor for nothing.

## What this is not

- Not the state: it is given an editor; `employments-state` reads and writes.
- Not the place picker or the place name: those are the two slots.
- Not the company search: that is `company-search`, to which it hands the finder and the vault's name.
- Not the section's wiring to the record: that is `employment-rows`.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-card`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-card` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/claim-handle <path-to-the-library>/units/company-search <path-to-the-library>/units/employment-role <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/role-when <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/employment-link <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/employment-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/employment-store <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/employment-edges <path-to-the-library>/units/employments-state <path-to-the-library>/units/employment-card
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing itself. On the person's act it calls the editor: `addEmployment`, `editEmploymentCompany`, `deleteEmployment`, `addJobTitle`, `editJobTitle`, `deleteJobTitle`, `editEmploymentRole` (the whole role as it stands, with the stored place), `retryOutbox`.

## Requests and their servers

None of its own. The company box asks the finder it is given, for typed text, and for the current company when the box is opened on an employment that has one (a read).

## Examples

```tsx
import { EmploymentCard } from "@kaigilb/gilbplatformcode-employment-card";

<EmploymentCard
  title="Employment"
  editor={editor}
  editMode={canEdit}
  recordsVaultId={vaultId}
  vaultName="Hytta"
  find={findOrganizationRecords}
/>
```

## What the host must supply

A `QueryClientProvider` above it (the company box uses `useQuery`); the editor; the finder; and, optionally, the two place slots. Inside a record card it reads `card-mode` for the card's modes; outside one it is always in edit mode.

## Module state

None.

## Do not

- Do not pass an editor whose acts write on a render.
- Do not draw a stored address as a company, a role or a place.
- Do not add a place picker by importing a catalogue here: give it as `renderWorkLocation`.
- Do not offer the add box after a failed read.

## Wrong readings

- "With no place slot a save clears the place." The stored place is handed back unchanged.
- "An empty group means there are none." With `vaultUnknown` or an error it says what was not read.
- "Opening a text and leaving it saves it." A text is written only when it changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/components/mynet/EmploymentCard.tsx` lines 47-96 (`MonthYear`), 134-564 (`RoleWhen`, `EditableText`, `DeleteHandle`, `QuickAdd`, `SaveBadge`, `EmploymentCard`).

## Tests

60 tests in 2 files (`npx vitest run`): `EmploymentCard.test.tsx` 47 (8 ported from GilbApp `EmploymentCard.s8cardlook` 5, `EmploymentCard.s10iter1focus` 2 and `RoleWhen.roleOngoing.c214` 1; 39 new) and `hostAgnostic.test.ts` 13.

Mutation checks: 21 mutants of `src/EmploymentCard.tsx` (a stored place counted or lost with no slot, an address drawn as a company or a role in the text or the remove label, the add box or "add employment" after a failed read, the unknown vault unsaid or the group empty, a changed-text test dropped, Escape or an outside change committing, Present not clearing the end, a never-said role committed as not current, the vault name or the finder not handed on, a remove of the wrong row, the Location slot in read-only, a place drawn with no slot, a place catalogue imported), 21 killed.
