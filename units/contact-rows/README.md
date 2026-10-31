# contact-rows

Edits a person's Email, Phone, Social and Skills rows, any number of each.

## What this is

Edits a person's Email, Phone, Social and Skills rows, any number of each.

One section component for the four multi-valued contact terms of a person record, drawn as a `card-group`-style section titled with the term's label:

- `ContactRows({ kind, recordId, recordEntityUri, title, valueKey, metaKey, served, etag, canEdit, onSaved, skillNotes? })`: one row per value with its sub-label, a remove control at the left, and an add control. The rows are stored in the layout of `contact-rows-model` (a value list and a sidecar) and saved when a value is left, on the record's one versioned save (see the host).
  - **Email**: the sub-label is Work or Private, tap it to switch; an address that does not fit `name@domain.tld` is shown with the reason and never saved; Send email link.
  - **Phone**: the value is edited by the host's `PhoneValue` (country code and number); call and text links. A sub-label is shown only when stored.
  - **Social** (online account): the value must be a web address, stored as a full link and labelled with its platform when it is a known one (about 30); an Open link; the platform's small logo in front of its name.
  - **Skills**: a skill is picked from the catalogue through the host's picker, shown by name with its referent under it, saved as a reference at once; under it the host's "About this skill" note, who added it and who sees it.
  - In presentation (a `card-mode` card not being edited) the rows are text, nothing edits, and no empty row is drawn. On a one-card (`one-card-context`) the "+ Add your own" field is drawn in place and a pick from "Add information" opens the new row ready for typing (phone: the country-code box has the cursor; skill: the picker's search box).
- `OWN_FIELD_BOX`: the class string of the "+ Add your own" box.
- `ContactRowsHostProvider`, `ContactRowsHostContext`, `useContactRowsHost()`: the host (see below).
- `joinPhone(dial, national)`: the app's own, a named copy (see "Wrong readings").
- `isEmailFormat`, `EMAIL_FORMAT_HINT`; `isWebAddress`, `normalizeWebAddress`, `platformOf`, `PLATFORM_LABELS`, `WEB_ADDRESS_HINT`; `skillReferentUri` and the types `ThinSkill`, `HeldNotesState` (re-exported from `held-notes` since 0.1.1): the checks the section runs, exported so a host builds its pieces with the same rules.

## What this is not

- Not the phone editor, the skill picker, the "About this skill" note, the platform logo, the visibility switch or the added-by line: those are the host's components (optional, see below).
- Not the record writer: the save goes through the host's `saveRecordSidecar`.
- Not the stored layout: that is `contact-rows-model`. Not the call, text, mail and open links: `contact-actions`.
- Not a person's other fields (name, birthday, address).

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-rows`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/contact-rows` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/stated-by <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-rows
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. `react` and `react-dom` (`^19`) are third-party peers (the skill picker is drawn into the document body with `createPortal`). The tests use the test doubles in `test/`; they are not part of the package.

## Examples

```tsx
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { ContactRows, ContactRowsHostProvider } from "@kaigilb/gilbplatformcode-contact-rows";

setTermOrigin("https://ontology.example.test"); // once at start-up

<CardModeProvider canEdit>
  <ContactRowsHostProvider host={{ useHomeDial, saveRecordSidecar, noteServedVersion, PhoneValue, SkillPickerSheet, SkillDepthNote, SocialLogo, socialPlatformName, HeldVisibilitySwitch, AddedByLine }}>
    <ContactRows
      kind="email"
      recordId={record.id}
      recordEntityUri={record.address}
      title="Email"
      valueKey="email"
      metaKey="fieldMeta"
      served={{ values: record.facts.email, meta: record.facts.fieldMeta }}
      etag={record.etag}
      canEdit
      onSaved={refetch}
    />
  </ContactRowsHostProvider>
</CardModeProvider>;
```

A host with only the required hook gives a read-only section with no phone editor, picker, notes or logos:

```tsx
<ContactRowsHostProvider host={{ useHomeDial: () => "" }}>...</ContactRowsHostProvider>
```

## What the host must supply

`ContactRowsHost`, given with `ContactRowsHostProvider`. Without a provider, `ContactRows` throws an error that names it.

| Member | Kind | Replaces (GilbApp `src/components/records/ContactRows.tsx`) | If absent |
|---|---|---|---|
| `useHomeDial(claims)` | **required** hook | `useHomeDial` of `src/lib/mynet/phone/useHomeDial.ts`, imported line 44, called line 113 (unconditionally, on every render, with one constant empty list) | The section throws an error that names it. |
| `saveRecordSidecar(recordId, recordEntityUri, metaKey, build, rebase)` | optional writer | `src/lib/base/recordSidecarSave.ts` line 75, imported line 39, called line 198 | **The section is read-only**: no add, remove or edit control; nothing is saved. |
| `noteServedVersion(recordId, etag, meta)` | optional | same file line 50, called line 147 | Nothing is noted (the writer is told nothing); saving works. |
| `PhoneValue` | optional component | `src/components/mynet/PhoneValue.tsx`, line 550 | A phone row shows the plain phone text. |
| `SkillPickerSheet` | optional component | `src/components/mynet/SkillPickerSheet.tsx`, line 411 | Pressing the add control opens nothing. |
| `SkillDepthNote` | optional component | `src/components/mynet/SkillDepthNote.tsx`, lines 430 and 526 | No note under a skill. |
| `SocialLogo` and `socialPlatformName(platformOfValue, label)` | optional pair | `src/components/mynet/SocialLogo.tsx` (lines 506, 679) and `src/lib/base/socialLogos.ts` | The logo is not drawn when either is absent; the label still shows. |
| `HeldVisibilitySwitch` | optional component | `src/components/records/HeldVisibilitySwitch.tsx`, lines 441 and 539 | Not drawn. |
| `AddedByLine` | optional component | `src/components/records/AddedByLine.tsx`, lines 439 and 536 | Not drawn. |

The props of each component are typed in `src/contactRowsHost.tsx` (`PhoneValueProps`, `SkillPickerSheetProps`, `SkillDepthNoteProps`, `HeldVisibilitySwitchProps`, `AddedByLineProps`).

Also needed: one `CardModeProvider` (`card-mode`) above the card when it has a presentation mode, the ontology origin (`setTermOrigin`, `term-origin`) set once at start-up (the skill's referent is checked against it), Tailwind v4 scanning this unit's `src`, and the `editorial-tokens` variables (`--ink`, `--ink-soft`, `--ink-faint`, `--accent`, `--line`, `--bad`, `--surface`, `--serif`, `--r-sm`).

## Module state

`ContactRowsHostContext` is one React context. A provider from another installed copy of this unit is not seen. Install the unit once.

## Changes in 0.1.1

A patch release: no behaviour changes. The interface `HeldNotesState` (the state of the held notes of one kind, which the Skills rows read) is no longer a copy in this unit: it is imported, as a type, from the unit `held-notes`, which owns the held-note layer (its stripped declaration compares 0 against the copy that is removed, and against the source). `ContactRows.tsx` and the entry point import it from there; the entry point still exports the type under the same name. The unit gains the peer `held-notes` ^0.1.0 (and, through it, the peers of that unit). All tests are unchanged and pass.

## Changes from production

**Added behaviour (the app always has these members).** All other changes are in "Where it came from". The absent-member paths, exactly:

1. **No `saveRecordSidecar`: the section is read-only.** Added: `canEdit = canEdit && !!saveRecordSidecar;` after the line `canEdit = canEdit && !!metaKey;`, and `if (!saveRecordSidecar) return Promise.resolve(false);` in the save function after its `metaKey` guard. Before: `canEdit` is what the caller passes (and the sidecar key is known). After: with the writer, no change.
2. **No `noteServedVersion`: nothing is noted.** `noteServedVersion(...)` is `noteServedVersion?.(...)`.
3. **No `PhoneValue`: the phone value is the plain phone text.** The branch `canEdit ? (<PhoneValue .../>) : text` is `canEdit && PhoneValue ? ... : text`.
4. **No `SkillPickerSheet`: the picker is not drawn.** `{picking && createPortal(...)}` is `{picking && SkillPickerSheet && createPortal(...)}`.
5. **No `SkillDepthNote`: no note.** In the presentation row the element is wrapped as `{SkillDepthNote ? (<SkillDepthNote .../>) : null}`; in the edit row `{skillNotes && (` is `{skillNotes && SkillDepthNote && (`.
6. **No `SocialLogo` or no `socialPlatformName`: no logo, the label still shows.** At both uses the element is `{SocialLogo && socialPlatformName ? <SocialLogo .../> : null}` (the edit row, and the presentation row function `PresentRow`, which reads the two from the host).
7. **No `HeldVisibilitySwitch`: not drawn.** Both uses are gated: `HeldVisibilitySwitch && <the source's condition>`.
8. **No `AddedByLine`: not drawn.** Both uses are gated: `AddedByLine && <the source's condition>`.

Each is pinned in `src/ContactRows.absent.test.tsx`, with a control that the full host draws every part.

## Do not

- Do not give the host a `useHomeDial` that is not a hook, or call it conditionally: the section calls it on every render.
- Do not install a second copy of this unit, `card-mode` or `card-group`.
- Do not use `phone-text`'s `joinPhone` here (see below).
- Do not store a skill by its storage address (`/base/e/...`): the claim's referent is `<ontology origin>/base/t/<PascalName>` and `skillReferentUri` refuses anything else.

## Wrong readings

- "`joinPhone` is the one of `phone-text`." It is not. The app's returns a national number that already starts with "+" as it is; `phone-text`'s puts the code before it (`joinPhone("47", "+44 20 7946")` is `"+44 20 7946"` here and `"+47 +44 20 7946"` there). 49 of 140 measured inputs differ. This unit holds the app's, as a named copy (`src/dialCode.ts`).
- "`toMailtoHref`, `phoneForUri` and `resolvableSocialHref` are copies." They are imported from `contact-actions`: measured equal to the app's on 32,915 inputs (458 real-looking values, the rest generated), 0 differences.
- "A read-only section means the record is read-only." It means the host gave no writer.
- "An absent component is an error." It is not drawn (see "Changes from production").

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/ContactRows.tsx` lines 62-762 to `src/ContactRows.tsx` (the header comment and imports are replaced).
- `src/lib/base/emailFormat.ts`, whole, to `src/emailFormat.ts`.
- `src/lib/base/onlineAccount.ts`, whole, to `src/onlineAccount.ts`.
- `src/lib/mynet/phone/dialCode.ts` lines 20-27 (`joinPhone`) to `src/dialCode.ts`.
- `src/lib/mynet/skills/thinSkills.ts` lines 19-46 (`ThinSkill`) and 60-81 (`skillReferentUri`) to `src/thinSkills.ts`.

**Merged units compared and taken.** `contact-actions` (`toMailtoHref`, `phoneForUri`, `resolvableSocialHref`: equal to the app's on measured inputs), `contact-rows-model`, `add-your-own`, `card-group`, `card-mode`, `one-card-context`, `one-card-rows`, `open-popups`, `remove-control` and `term-origin`.

**False friend not taken.** `phone-text` `joinPhone` (see "Wrong readings").

Named changes, and only these (a token diff of `ContactRows.tsx` against the source, comments and imports excluded, shows only the additions of "Changes from production" and the host call):

1. the imports are the peers' and the unit's own files;
2. at the start of `ContactRows`: `const host = useContactRowsHost();` and the destructuring of the ten host members; in `PresentRow`, `const { SocialLogo, socialPlatformName } = useContactRowsHost();`;
3. the eight absent-member changes above;
4. in `skillReferentUri`, the master's origin is read from `term-origin` at the call (the source read a constant): the pattern is built inside the function from `termOrigin()`, and the error words use it;
5. comments that name a cycle, a ticket, an agent, a person, a ruling or the other app are reworded; no code changed.

`src/index.ts` and `src/contactRowsHost.tsx` are new.

Tests (hosts are `example.test`, people Ann and Ben): 9 of the 10 `ContactRows*.test.tsx` files ported as `ContactRows.{actions,addOwn,controls,emailFormat,focus,look,onlineAccount,save,skills}.test.tsx` (74 cases; the 10 `vi.mock` calls are the fake host and `test/` doubles). Left out: `ContactRows.addFocus.c214e9.test.tsx` (2 cases) tests the app's `PhoneValue`, not this unit. `ContactRows.absent.test.tsx` (18) and `ContactRows.pins.test.tsx` (13) are new. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
