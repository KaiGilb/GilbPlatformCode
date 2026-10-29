# plan-card

Draws one Plan card for a record of type Function, Function Constraint, Solution, Solution Constraint, Value or Development Resource: the lines that type has, in order, each change saved with a version check, the type changeable live, with every read and write supplied by the host.

## What this is

Draws one Plan card for a record of type Function, Function Constraint, Solution, Solution Constraint, Value or Development Resource: the lines that type has, in order, each change saved with a version check, the type changeable live, with every read and write supplied by the host.

One component, `PlanFunctionForm` (also exported as `PlanForm`), and the small things it shares. It is the engine of the four Plan cards (Function and Function Constraint, Solution and Solution Constraint, Value, Development Resource): they are one component in the source, which picks its lines from the record's type and changes them when the type is changed.

- `PlanFunctionForm({ record, vaultId, canEdit, onOpen, onNotice })`: `record` is the card's record (a `BaseRecord`), `vaultId` is the screen's vault, `canEdit` is whether the person may write, `onOpen(id)` opens a record, `onNotice(text | null)` shows or clears the card's notice. It draws `<div data-testid="plan-function-form">` with one `CardGroup` per line.
  - The lines. The first line is always the Type · Level · Version line (`plan-type-level`, from `plan-type-level-version`). The others are `planLinesFor(record.typeUri)` of `plan-kinds`, in that order, one group each; an unknown type uses the Function's lines. All groups are built on every render; only the ones the type lists are mounted. The table below is the order for each type, as the `data-group` of the group.
  - The draft. The card keeps a draft of its lines (type, level, sources, meters, status lines, the Value's Scale and Endpoint), built from the record. When the record changes and the draft was not edited, the draft is rebuilt from it during render; an edited draft is kept.
  - A save. One edit is one patch, built from the draft against the newest copy of the record (`liveRow`), after a check of the version (`ensureEtagUnchanged`: a record with no version is read first). The patch goes through `patchRecord` with that version as If-Match, and the saved row is stored (`storePlanRow`, `setRecordRead`). A list (the meters, the status lines, the line sources) is written only over the list the card read: when the record holds another list, the change is dropped and the card says to reload. Saves run one after another in one queue.
  - A conflict. A write refused with the version error (`isConflict`) is reconciled (`reconcileAfterConflict`), the draft is rebuilt from the latest, and the card says "This changed elsewhere. The card now shows the latest; your last change was not saved — make it again." Any other failure puts the draft back to the stored value and says why (a 409 or a 5xx or no answer at all in the card's own sentence, else the error's message).
  - The Status line. Add a status (the next word after the current one, dated today), change its word or date (a date is saved when the field is left, only when it is a real day), delete a Past line; a line that repeats a word on a date is refused.
  - The type. A Function or Solution can be changed to its constraint and back through the Type switch. The card asks first, in the type's words; a constraint needs a named person as its Authority, so the card asks for one (a person search and "+ New stakeholder") unless the record already has one; Change retypes through the host's `useRetypeRecord` and then writes the Authority. The lines change as soon as the record's type does. A Value and a Development Resource have no Type switch.
  - The Value card. For a Value or a Development Resource the card drives the child-record lists of the write layer (`value-card-write`): the Levels, the Qualifiers (and their option definitions), the Meters and the Scale are records of their own. The card keeps the version floor of the line, the older stored lists (read-only, moved into records by one button), the questions asked before a qualifier is renamed, merged or removed, and the group rename of a qualifier.
- `PersonAuthoritySearch({ vaultId, onPick, onNew?, testId? })`: the person-only Authority search the card uses while a Function is becoming a constraint. Exported because the source exports it.
- `ConstraintCreateAuthority({ vaultId, picked, onPick, onNew })`: the avoid line and the required Authority field of a constraint's create form. Exported because the source exports it; the card does not use it.
- `draftFrom(record, partRows?)`: the draft of a record. `pickLive(listRow, saved, record)`: the row a save should send If-Match for: the loaded list's when it is the truth, else the card's last save, else a copy of the record.
- `PlanCardHostContext`: the context through which the host gives the card everything it reads and writes. With no provider the card throws an error naming it.
- The types `PlanCardHost`, `PlanCardShell`, `PlanFindQuery`, `RelationsQuery`, `CreateStakeholderProps`, `PlanFind`, `MergePatchValue`, `WriteSource`.

### The lines of each type

The first line of every card is `plan-type-level`. Then, in order (`data-group`, title):

| Card (`typeUri`) | Lines after the Type · Level · Version line |
|---|---|
| Function (`t:Function`, and any type the card does not know) | `plan-description` Description · `plan-stakeholder` Stakeholder · `plan-authority` Authority · `plan-part-of` Part of · `plan-sub-functions` Sub-functions · `plan-meter` Meter · `plan-status` Status · `plan-function-of-value` Function of Value · `plan-solutions` Solutions · `plan-type` Type |
| Function Constraint (`t:FunctionConstraint`) | `plan-description` · `plan-authority` (required) · `plan-stakeholder` · `plan-part-of` · `plan-sub-functions` · `plan-meter` · `plan-status` · `plan-type` |
| Solution (`t:Solution`) | `plan-description` · `plan-stakeholder` · `plan-authority` · `plan-type` · `plan-meter` · `plan-status` · `plan-impacts` Impacts · `plan-solution-of` Solution of Function · `plan-part-of-system` Part of System |
| Solution Constraint (`t:DesignConstraint`) | `plan-description` · `plan-authority` (required) · `plan-stakeholder` · `plan-type` · `plan-meter` · `plan-status` · `plan-impacts` · `plan-solution-of` · `plan-part-of-system` |
| Value (`t:Value`) | `plan-picture` Illustration · `plan-scale` Scale · `plan-endpoint` Endpoint · `plan-scale-variables` Qualifiers · `plan-value-levels` Levels · `plan-value-meters` Meter · `plan-stakeholder` · `plan-function-of-value` Value of Function · `plan-description` Ambition Level · `plan-authority` · `plan-type` |
| Development Resource (`t:Resource`) | as a Value without `plan-function-of-value`, and with `plan-resource-owner` Resource Owner just before `plan-stakeholder` |

These are the orders of `planLinesFor` (`plan-kinds`) as the card maps each key to its group (`byLine` in the source): `description` → `plan-description`, `stakeholder` → `plan-stakeholder`, `authority` → `plan-authority`, `resourceOwner` → `plan-resource-owner`, `partOf` → `plan-part-of`, `subFunctions` → `plan-sub-functions`, `meter` → `plan-meter`, `status` → `plan-status`, `impacts` → `plan-impacts`, `functionOfValue` → `plan-function-of-value`, `solutions` → `plan-solutions`, `gilbveda` → `plan-type`, `solutionOf` → `plan-solution-of`, `partOfSystem` → `plan-part-of-system`, `scale` → `plan-scale`, `scaleVariables` → `plan-scale-variables`, `endpoint` → `plan-endpoint`, `valueMeters` → `plan-value-meters`, `valueLevels` → `plan-value-levels`, `valueGraph` → `plan-picture`; `type` and `level` are not groups of their own (the Type · Level · Version line is `plan-type-level`). A group with nothing in it is not drawn in view mode unless the card mode's `showAll` seam is on; the Type group is not drawn in Edit while empty; a Value's Ambition Level is not drawn until it has a part.

Per-type differences inside the lines: on a Value the Description is titled "Ambition Level", its Stakeholder never counts as empty and has no source row, "Function of Value" is titled "Value of Function"; the Type switch is absent on a Value and a Development Resource; Authority is marked required (`data-plan-required`) and offers people only on the two constraints; the level preselected before any level is stored is Solution (Solution and Solution Constraint), Product (Value) or Business (Development Resource).

## What this is not

- Not a reader or writer of records. It never fetches, never writes, never caches; the host does, through the members below. A host without its four writers gets a read-only card.
- Not the lines. The Type · Level · Version line, the Description, Stakeholder and Authority, Part of and the other links, Impacts, the source control, the Type field and the five Value lines are units of their own (`plan-type-level-version`, `description-parts-view`, `plan-stakeholder-lines`, `plan-tag-links`, `plan-impacts`, `plan-source`, `plan-type-field`, `value-scale-line`, `value-qualifiers-line`, `value-endpoint-line`, `value-levels-line`, `value-meters-line`, `value-illustration`). The card imports them and does not provide their hosts: the app mounts the context of each, see "What the host must supply".
- Not the Value card's write layer. The records of a Value's levels, qualifiers, meters and Scale are written by `value-card-write`, whose hooks the card calls; its host context is the app's too.
- Not the rules. What a line holds, how it is read and written, which types there are and what a constraint needs are `plan-card-facts`, `plan-links-model`, `plan-impacts-model`, `plan-stakeholders-model`, `plan-kinds`, `value-card-model`, `description-parts-model` and `project-levels`.
- Not a query library. The source used react-query; this unit never imports it.
- Not the card frame, its Edit button or its mode (`card-group`, `card-mode`): a `CardModeProvider` above the card gives the modes; with none the card is always editing and shows every group.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-card`

Take it together with its peers `base-record`, `card-group`, `card-mode`, `description-parts-model`, `description-parts-view`, `field-row`, `open-popups`, `plan-button-row`, `plan-card-facts`, `plan-impacts`, `plan-impacts-model`, `plan-kinds`, `plan-links-model`, `plan-source`, `plan-stakeholder-lines`, `plan-stakeholders-model`, `plan-tag-links`, `plan-type-field`, `plan-type-level-version`, `project-levels`, `record-picker`, `relation-role`, `type-chooser`, `type-curie`, `value-card-model` (0.2.0 or later), `value-card-write`, `value-endpoint-line`, `value-illustration`, `value-levels-line`, `value-line-kit`, `value-meters-line`, `value-qualifiers-line` and `value-scale-line`, and their own peers (52 units in all, listed in the command below). Third-party: `@dnd-kit/core` 6.3.1 (a peer of `sortable-tree`) and `react-dom` 19 (a peer of `type-term-popover`, `value-graph` and `value-levels-line`), which this unit passes on as its own peers. Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit, so one copy of each context and of each module's state):

```
install-links=true
```

Then install them:

```sh
npm install @dnd-kit/core@6.3.1 react-dom@19 <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/card-group <path-to-the-library>/units/id-tail <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/entity-ref <path-to-the-library>/units/relation-role <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/help-doc <path-to-the-library>/units/description-help <path-to-the-library>/units/fact-faithful <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/plan-source <path-to-the-library>/units/sortable-tree <path-to-the-library>/units/description-parts-view <path-to-the-library>/units/plan-impacts-model <path-to-the-library>/units/plan-tag-picker <path-to-the-library>/units/plan-impacts <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/plan-tag-links <path-to-the-library>/units/plan-type-field <path-to-the-library>/units/plan-type-level-version <path-to-the-library>/units/project-levels <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/value-card-model <path-to-the-library>/units/value-card-write <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-endpoint-line <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/date-rules <path-to-the-library>/units/value-graph-geometry <path-to-the-library>/units/value-graph <path-to-the-library>/units/value-illustration <path-to-the-library>/units/value-levels-line <path-to-the-library>/units/value-meters-line <path-to-the-library>/units/value-qualifiers-line <path-to-the-library>/units/value-scale-line <path-to-the-library>/units/plan-card
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. The unit's `tsconfig.json` leaves out `noImplicitOverride` and `noUncheckedIndexedAccess`, because the units it is built from ship source that does not use the `override` keyword and does not check indexed reads, and the compiler reads that source.

At start-up the app calls `setTermOrigin(<origin of the ontology's terms>)` (`term-origin`) once, and, if it has a type registry, `setTypeKey` (`type-key`) once. The card reads both through the units that need them.

## Examples

```tsx
import { PlanFunctionForm, PlanCardHostContext } from "@kaigilb/gilbplatformcode-plan-card";
import type { PlanCardHost } from "@kaigilb/gilbplatformcode-plan-card";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanSourceHostContext } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";
import { ValueLinesHostContext } from "@kaigilb/gilbplatformcode-value-line-kit";
import { ValueWriteHostContext } from "@kaigilb/gilbplatformcode-value-card-write";
import { StakeholderLinesHostContext } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { PlanTagLinksHostContext } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanTagPickerHostContext } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanImpactsHostContext } from "@kaigilb/gilbplatformcode-plan-impacts";
import { DescriptionPartsHostContext } from "@kaigilb/gilbplatformcode-description-parts-view";
import { ProjectLevelsHostContext } from "@kaigilb/gilbplatformcode-project-levels";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";

// Once, above the card. Every member is yours; "What the host must supply" says what each does.
const host: PlanCardHost = {
  // reads (hooks)
  useSelfSource, useRelations, usePlanFind, usePersonAuthorities,
  // the person search and the Type picker
  useShell, heldVaultIds, useStakeholderKindSet, findStakeholderRecords, searchTypes, blankReach, openOntologyConcept, renderTypeIcon,
  // click-time getters
  getRelations, getKindSet, liveRow, readRecord, memberEntityUri, ensureEtagUnchanged, applyPatch, isConflict, reconcileAfterConflict,
  // cache writes
  storePlanRow, setRecordRead, setRelations, invalidateAuthoritySearch,
  // writers: leave any one of these four out and the card is read-only
  patchRecord, useRetypeRecord, migratedAuthorityRelation, writeAuthorityRelation,
  // the dialog that makes a person
  renderCreateStakeholder,
};

// The contexts of the units the card draws are the app's, not the card's.
<PlanSourceHostContext.Provider value={planSourceHost}>
  <RefLabelContext.Provider value={useRefLabel}>
    <PickerQueryContext.Provider value={usePickerQuery}>
      <ValueLinesHostContext.Provider value={valueLinesHost}>
        <ValueWriteHostContext.Provider value={valueWriteHost}>
          <StakeholderLinesHostContext.Provider value={stakeholderLinesHost}>
            <PlanTagLinksHostContext.Provider value={planTagLinksHost}>
              <PlanTagPickerHostContext.Provider value={planTagPickerHost}>
                <PlanImpactsHostContext.Provider value={planImpactsHost}>
                  <DescriptionPartsHostContext.Provider value={descriptionPartsHost}>
                    <ProjectLevelsHostContext.Provider value={projectLevelsHost}>
                      <TermDefinitionContext.Provider value={readTermDefinition}>
                        <TypePictureSourceContext.Provider value={typePictureSource}>
                          <PlanCardHostContext.Provider value={host}>
                            <CardModeProvider canEdit={canWrite}>
                              <PlanFunctionForm record={record} vaultId={screenVault} canEdit={canWrite} onOpen={openRecord} onNotice={setNotice} />
                            </CardModeProvider>
                          </PlanCardHostContext.Provider>
                        </TypePictureSourceContext.Provider>
                      </TermDefinitionContext.Provider>
                    </ProjectLevelsHostContext.Provider>
                  </DescriptionPartsHostContext.Provider>
                </PlanImpactsHostContext.Provider>
              </PlanTagPickerHostContext.Provider>
            </PlanTagLinksHostContext.Provider>
          </StakeholderLinesHostContext.Provider>
        </ValueWriteHostContext.Provider>
      </ValueLinesHostContext.Provider>
    </PickerQueryContext.Provider>
  </RefLabelContext.Provider>
</PlanSourceHostContext.Provider>;
```

The `record` must change when the host's `storePlanRow` runs (the screen takes its record from the same lists and reads the card writes to), and when the host retypes a record: the card relies on the new `record` to draw the saved version, the new type and its lines.

## What the host must supply

Contexts of the units the card draws, above the card. Each is the provider of the unit named; without it the unit throws an error naming it when its line mounts (all the lines of a type mount with the card, and the Value's write hooks run for every type, so mount them all):

- `CardModeProvider` of `card-mode`: the card's mode. Optional: with none the card is always editing and shows every group.
- `PlanSourceHostContext` of `plan-source`: the source control under every line.
- `RefLabelContext` of `entity-ref-value` and `PickerQueryContext` of `record-picker`: the label of a linked record and the pickers' query hook (the source control, the stakeholder and link pickers and the person search use them).
- `ValueLinesHostContext` of `value-line-kit`: the five Value lines (`value-scale-line`, `value-qualifiers-line`, `value-endpoint-line`, `value-levels-line`, `value-meters-line`) and the Illustration (`value-illustration`).
- `ValueWriteHostContext` of `value-card-write`: the write layer behind the Value's levels, qualifiers, meters and Scale. The card calls its four hooks for EVERY type of card, so this is needed by a Function too.
- `StakeholderLinesHostContext` of `plan-stakeholder-lines`: the Stakeholder, Authority and Resource Owner lines. New in 0.2.0, a member: `useMainTag(entityUri)`, the main tag of a stakeholder chip's record. Replaces `useMainTag(uri)` (`PlanStakeholders.tsx:144`).
- `PlanTagLinksHostContext` of `plan-tag-links`: Part of, Sub-functions, Function of Value, Value of Function, Solutions, Solution of Function and Part of System. New in 0.2.0, a member: `useMainTagsForRows(rows)`, the main tags of the linked records the line draws. Replaces `useMainTagsForRows(...)` (`PlanTagLinks.tsx:492`, `:869`).
- `PlanTagPickerHostContext` of `plan-tag-picker`: the picker `plan-tag-links` and `plan-impacts` use.
- `PlanImpactsHostContext` of `plan-impacts`: the Impacts line. New in 0.2.0, a member: `useMainTagsForRows(rows)`, the main tags of the linked Values and Resources. Replaces `useMainTagsForRows(...)` (`PlanImpacts.tsx:517`).
- `DescriptionPartsHostContext` of `description-parts-view`: the Description (Ambition Level) parts.
- `ProjectLevelsHostContext` of `project-levels`: the Level choices.
- `TermDefinitionContext` of `type-term-popover`: the definition shown by the Type line's popovers and the Type picker.
- `TypePictureSourceContext` of `type-picture`: the picture of a type. Optional: without it no picture is drawn.
- `ModalPortalContext` of `open-popups`: only when the app draws its create dialog in a portal of its own.
- If the host has a type registry it calls `setTypeKey` of `type-key` once at start-up, and it calls `setTermOrigin` of `term-origin` once.

The `PlanCardHostContext` provider with an object of these members. File and line are those of GilbApp, commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, `src/components/records/PlanFunctionForm.tsx` (`PFF`) or `PersonAuthoritySearch.tsx` (`PA`) unless another file is named.

Reads (hooks; called on every render, in the order the source called them, never conditionally):

- `useSelfSource()`: `{ "@id" } | null`, the signed-in person as a source. Replaces `useSelfSource()` (PFF:480).
- `useRelations(recordId, recordUri)`: `{ data?, isPending, isError }`, the relations the record takes part in. Replaces `useRelations(record.id, record.entityUri ?? null)` (PFF:488).
- `usePlanFind(vaultId, attr, parent, cap?)`: `{ data?: PlanFind, isLoading, isError }`. The card asks `"a:fvParent"` (sub-functions), `"a:measures"` (functions of a value) and `"a:partOf"` (parts; a Value's children, with `cap` 2000 for a Value and a Development Resource, 300 for any other type). `parent` is null when the type has no such line. Replaces `usePlanFind(planVault, attr, parent, cap)` (PFF:491, :492, :494).
- `usePersonAuthorities(record, vaultId)`: `{ people, pending, error }`, the Authorities of the record that are people. Replaces `usePersonAuthorities(record, vaultId)` (PFF:566).
- `useRetypeRecord?(vaultId)`: `{ mutateAsync({ record, typeName }) }`. Replaces `useRetypeRecord(vaultId)` (PFF:545, :865). A writer.

The person search (Authority of a constraint being made):

- `useShell()`: `{ vaults? }`. Replaces `useShell()` (PA:26).
- `heldVaultIds(vaults)`: the ids of the vaults the person can read. Replaces `heldVaultIds(shell.vaults ?? [])` (PA:27).
- `useStakeholderKindSet()`: `{ data?: StakeholderTypeSet }`. Replaces `useQuery(STAKEHOLDER_TYPE_SET_QUERY)` (PA:28).
- `findStakeholderRecords(vaultIds, typeNames, text)`: `{ hits, complete, vaultsMissed? }`. Replaces `findStakeholderRecords(vaults, names, q)` (PA:30).

The Type picker (the Type field is a unit that takes these as props; the source's Type field read them from the app):

- `searchTypes(query)`: the GilbVeda type search. Replaces the default `search = searchLiveTerms` of the app's TypeChooser (`TypeChooser.tsx:151`).
- `blankReach`: the sentence shown before the first answer. Replaces `BLANK_QUERY_REACH` (`typeSearch.ts:553`).
- `openOntologyConcept?(typeName)`: opens a type's page in the ontology; without it the Type popovers have no "Open in Ontology" button. Replaces `shell?.openOntologyConcept?.(n)` (`PlanTypeField.tsx:51`).
- `renderTypeIcon?(option, className)`: the icon of a type option. Replaces `TypeIcon` (`TypeChooser.tsx:364-368`, `:483-489`).

Click-time getters (called when the person acts, never kept from a render):

- `getRelations(recordId, recordUri)`: the relations the app holds now, or `undefined`. Replaces `qc.getQueryData<RecordRelation[]>(relationsKey(id, uri))` (PFF:624, :631).
- `getKindSet()`: the stakeholder kinds the app holds now. Replaces `qc.getQueryData<StakeholderTypeSet>(STAKEHOLDER_TYPE_SET_QUERY_KEY)` (PFF:846, :1418).
- `liveRow(vaultId, id, fallback)`: the newest copy of a record. Replaces `liveCachedRow(qc, planVault, id, fallback)` (PFF:583, :601, :669, :868; `planRowCache.ts:101`). Each call keeps its own vault: the PLAN vault, from the record's address.
- `readRecord(id, at)`: reads a record. The card passes the PLAN vault id as `at` (the source did). Replaces `readRecord(id, planVault)` (PFF:845).
- `memberEntityUri(idOrUri, preferredUri?, vaultNamespace?)`. Replaces `memberEntityUri(id, null, planVault)` (PFF:851; `relationWrite.ts:99`).
- `ensureEtagUnchanged(vaultId, row, sameFor)`: `{ row }`, `{ conflict: true }` or `{ unreadable: true }`. A row passed with `etag: null` MUST be read again. Replaces `ensureEtagUnchanged(qc, planVault, row, sameFor)` (PFF:584; `planRowCache.ts:148`).
- `applyPatch(row, patch, etag, opts?)`: the row with a patch applied. Replaces `applyPatch(ready, patch, etag)` (PFF:642; `planRowCache.ts:30`).
- `isConflict(e)`: true for exactly the error the patch writer raises when the version check fails (HTTP 412). A 409 is not a conflict here. Replaces `e instanceof RecordConflictError` (PFF:654).
- `reconcileAfterConflict(vaultId, row)`: the record as the vault has it, or `null`. Replaces `reconcileAfterConflict(qc, planVault, ready)` (PFF:655; `planRowCache.ts:162`).

Cache writes (always required; a host with no writers may give no-ops):

- `storePlanRow(vaultId, row, opts?)`. Replaces `storePlanRow(qc, planVault, stored)` (PFF:643; `planRowCache.ts:117`).
- `setRecordRead(id, entityUri, row)`. Replaces `qc.setQueryData(planRecordKey(id, entityUri), stored)` (PFF:645).
- `setRelations(recordId, recordUri, next | (prev) => next)`. Replaces `qc.setQueryData(relationsKey(id, uri), list)` (PFF:632) and `qc.setQueryData<RecordRelation[]>(relationsKey(id, uri), (prev) => ...)` (PFF:876).
- `invalidateAuthoritySearch()`. Replaces `qc.invalidateQueries({ queryKey: ["stakeholder-search", "authority"], refetchType: "active" })` (PFF:1468).

Writers (optional; leave any one of the four out and the card is read-only, as with `canEdit` false):

- `patchRecord?(id, patch, at, source, precondition)`: the version read is `precondition.ifMatch`. Raises the error `isConflict` recognises when the check fails. Replaces `patchRecord(id, patch, at, source, pre)` (PFF:640, :641; `records.ts:963`).
- `useRetypeRecord?(vaultId)`: see above.
- `migratedAuthorityRelation?(row, vaultId, relations)`: the card passes the SCREEN's vault id here, as the source did. Replaces `migratedAuthorityRelation(ready, vaultId, known)` (PFF:625; `planStakeholders.ts:275`).
- `writeAuthorityRelation?(input)`: the card passes the PLAN vault id as `input.vaultId`. Replaces `writeAuthorityRelation({ recordId, recordUri, stakeholderUri, vaultId })` (PFF:869; `planStakeholders.ts:236`).

The dialog:

- `renderCreateStakeholder(props)`: draws the dialog that makes a person; the card calls it as a function while the dialog is open (if yours uses hooks, return an element of a component of your own). `props` are `open`, `stakeholders`, `source` (null), `initialTypeId` (`"person"`), `drawnVaultIds` (`[vaultId, planVault]`), `onClose` and `onCreated(id)`. Replaces `<ConnectedCreateDialog open stakeholders source={null} initialTypeId="person" drawnVaultIds onClose onCreated />` (PFF:1459-1470).

## Changes in 0.2.0

- Three members the card does not call itself are new in the hosts of the lines it draws, and a host must supply them (BREAKING for hosts written for 0.1.0): `useMainTag` (Stakeholder lines), `useMainTagsForRows` (Impacts, Tag links). A linked record that holds no name and no `unitTag` is shown by its main tag; a stakeholder chip's `@handle` is the main tag.
- The private `entityDisplayName.ts` is re-copied from 9a602ea7: `EntityDisplayOpts.mainTag` and its two lines. Dead in this unit: the card passes no `mainTag`.
- Peers `plan-impacts`, `plan-tag-links`, `plan-stakeholder-lines` and `plan-stakeholders-model` ^0.2.0.
- Re-synced from KaiGilb/GilbApp @ `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`; the ranges of `entityDisplayName.ts` moved from 155-160, 162-169, 177-197, 204-260 to 155-165, 167-174, 192-212, 219-278.

## Do not

- Do not leave the card's `record` as it was when the card has saved: the card relies on `record` changing when the host's `storePlanRow` runs (and when the host retypes the record), to draw the saved version, the new type and its lines.
- Do not run two installed copies of this unit, or of the units it draws. The card keeps a counter (`statusLineSerial`) in its module, and the units keep their contexts and their registries; two copies are two sets.
- Do not read the vault id the host members are given as the screen's: `liveRow`, `ensureEtagUnchanged`, `storePlanRow`, `reconcileAfterConflict` and `usePlanFind` are given the vault of the record's address, which may not be the screen's; `useRetypeRecord` and `usePersonAuthorities` and `migratedAuthorityRelation` are given the screen's.
- Do not make `isConflict` answer true for a 409. A 409 on a Value write means the tag is taken; it is shown in the card's own sentence.
- Do not hand the card a host that has `patchRecord` but no `useRetypeRecord`, `migratedAuthorityRelation` or `writeAuthorityRelation` and expect the Status and meters to be editable: it is read-only unless all four are there.
- Do not turn `searchTypes` or `openOntologyConcept` into methods that read `this`: the card passes them to the Type field as plain functions.

## Wrong readings

- "The card keeps no state of its own." It does, in two places in its module: `statusLineSerial`, a counter that gives each status line the Status editor is changing a hidden `lineKey` (non-enumerable, so it is never saved), and the `lineKey` itself. Two installed copies would count twice. There is one installed copy of the card and of each unit it draws; install them with `install-links=true`.
- "The type does not change after the first draw." It does: the card picks its lines from `record.typeUri` on every render, and the Type switch (Function and Function Constraint, Solution and Solution Constraint) changes the type through the host. A wrapper that fixes the lines for one type would be wrong the moment the person presses Change.
- "The Value hooks run only for a Value." They run for every type: the card calls `useValueLevels`, `useValueMeters`, `useValueQualifiers` and `useValueScale` on every render, with `enabled` false when the record is not a Value or a Development Resource. The hooks must be called in the same order every render, so the app mounts the `ValueWriteHostContext` for a Function card too.
- "A conflict is retried." It is not. The card reconciles, shows the latest and says the change was not saved; the person makes it again.
- "The draft is rebuilt on every render." It is rebuilt when the record changed and the draft was not edited; the card calls its own state setter during render for that (the baseline sync), as the source does.
- "`readRecord` is given the record's address." It is given the plan vault id in that place (the source did, when it read a person it had just made). `migratedAuthorityRelation` is given the screen's vault id while `writeAuthorityRelation` is given the plan vault id. Each is kept as written.
- "Changing the level writes the level only." A level patch also writes the line's sources (an empty list when there are none), as the source did.
- "A Development Resource has its own card." It is the Value card with four changes: Budget for Goal, the Business level, the Resource Owner line, its Type word.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`:

- `src/components/records/PlanFunctionForm.tsx` lines 1-2193 (the whole file) to `src/PlanFunctionForm.tsx`; the exports are the source's (`draftFrom`, `pickLive`, `PlanFunctionForm`, `PlanForm`). The code is copied by script and changed only as listed. Named changes:
  1. Imports (lines 5-136): each component and function of a merged unit is imported from that unit: `PlanButtonRow` from `plan-button-row`; `FieldRow` from `field-row`; `modalIsOpen` and `insideOpenLayer` from `open-popups` (`insideOpenLayer` is `components/records/planLeave.ts` and is the same code: only its import of `modalIsOpen` differs); `CardGroup` and `CardIconName` from `card-group`; `useCardMode` from `card-mode`; `PlanImpacts` from `plan-impacts`; the seven link lines from `plan-tag-links`; `PlanDescriptionParts` from `description-parts-view`; `PlanTypeLevelVersion` from `plan-type-level-version`; `PlanAuthority` and `PlanStakeholders` from `plan-stakeholder-lines`; `PlanSource` from `plan-source`; the five Value bodies and `PlanValuePictureBody` from `value-scale-line`, `value-qualifiers-line`, `value-endpoint-line`, `value-levels-line`, `value-meters-line` and `value-illustration`, and `ValueLineProps` from `value-line-kit`; `isTypeName`, `linkAddress`, `readPartOfFact`, `solutionOfFunctions` and `solutionsTargeting` from `plan-links-model`; the `planCard.ts` names from `plan-card-facts`; the `planConstraint.ts` names and the pure parts of `planStakeholders.ts` from `plan-stakeholders-model`; `PlanTypeField`, `TYPE_TRIGGER_ATTR` and `PlanTypeReplaceAsk` from `plan-type-field`; the `planKinds.ts` names from `plan-kinds`; the `planValue.ts` names and `ValueCardData` from `value-card-model`; `MoveStopped` and the four Value hooks from `value-card-write`; `isPartType` from `description-parts-model`; `impactsOnSolution` from `plan-impacts-model`; `typeLocalName` from `type-curie`; the `planLevels.ts` names (`useProjectLevels` and the rest) from `project-levels`; `OrgRecordHit` from `record-picker`; `RecordRelation` from `relation-role`; `BaseRecord` and `GridRecord` from `base-record`. Every function and constant of these that is a plain function was compared with the source's, comments aside, and is the same code, except `typeLocalName`, which `type-curie` writes with a local for the match so that an unchecked index is not used (the same result); `isTypeName` is `type-key`'s, re-exported by `plan-links-model`, and compares the same two keys. The private copies below were compared the same way.
  2. `@tanstack/react-query` is gone: `useQueryClient()` is not called (the query client stays in the host), and each `qc.*` call, query key and cache helper is a host member (see above). `planRecordKey`, `relationsKey` and `STAKEHOLDER_TYPE_SET_QUERY_KEY` are not in the unit: the host forms its own keys from the arguments.
  3. Each host call is made with the same arguments, in the same place and order as the source's call, but for what the query client or the key did: `liveCachedRow(qc, planVault, ...)` is `host.liveRow(planVault, ...)`; `ensureEtagUnchanged(qc, planVault, ...)` is `host.ensureEtagUnchanged(planVault, ...)`; `qc.getQueryData<RecordRelation[]>(relationsKey(id, uri))` is `host.getRelations(id, uri)` (the `const key = relationsKey(...)` lines are gone); `qc.setQueryData(key, ...)` is `host.setRelations(id, uri, ...)`; `qc.getQueryData<StakeholderTypeSet>(STAKEHOLDER_TYPE_SET_QUERY_KEY)` is `host.getKindSet()`; `qc.setQueryData(planRecordKey(id, uri), stored)` is `host.setRecordRead(id, uri, stored)`; `storePlanRow(qc, planVault, stored)` is `host.storePlanRow(planVault, stored)`; `reconcileAfterConflict(qc, planVault, ready)` is `host.reconcileAfterConflict(planVault, ready)`; `applyPatch`, `readRecord`, `memberEntityUri` are `host.applyPatch`, `host.readRecord`, `host.memberEntityUri`; the writers are called with a `!` after the member (`host.patchRecord!`, `host.migratedAuthorityRelation!`, `host.writeAuthorityRelation!`, `retype!.mutateAsync`); `e instanceof RecordConflictError` is `host.isConflict(e)`; the hooks `useSelfSource`, `useRelations`, `usePlanFind` (three calls), `usePersonAuthorities` are `host.useX`, and `useRetypeRecord(vaultId)` is `host.useRetypeRecord?.(vaultId)`; `qc.invalidateQueries({ queryKey: ["stakeholder-search", "authority"], refetchType: "active" })` is `host.invalidateAuthoritySearch()`; `<ConnectedCreateDialog open stakeholders source={null} initialTypeId="person" drawnVaultIds={[vaultId, planVault]} onClose onCreated />` is `host.renderCreateStakeholder({ open: true, stakeholders: true, source: null, initialTypeId: "person", drawnVaultIds: [vaultId, planVault], onClose, onCreated })`.
  4. The card reads `host` from the new `PlanCardHostContext` (`usePlanCardHost`, private) first, in the component's first line; with no provider it throws.
  5. One added line, after it: `if (!(host.patchRecord && host.useRetypeRecord && host.migratedAuthorityRelation && host.writeAuthorityRelation)) canEdit = false;`. That is the read-only behaviour: the same as `canEdit` false.
  6. `PlanTypeField` is given four props the unit takes and the source's Type field read from the app: `search={host.searchTypes}`, `blankReach={host.blankReach}`, `onOpenOntology={host.openOntologyConcept}` and `renderTypeIcon={host.renderTypeIcon}`.
  7. Comments: the tags of the changes that added them (`V19`, `V31`, `V32`, `V36 M1`..`M3`, `V37`, `V21 F6`, `V29/V30`) are taken out; the meaning is kept.
  8. Kept inside, as in the source: the module counter `statusLineSerial` and the hidden `lineKey`, `setDraft` called during render (the baseline sync), `applyBuild` and its promise queue, `rollBackAfterFailure`, the status engine (`rememberStatusLine`, `commitStatusDate`, `putLines`, `addStatus`, `onNewStatusClick` with its script-click guard), the retype flow (`askType`, `adoptPerson`, `changeType`), the Value-only block (the version floor, the older lists, `moveOldLists`, `removeMade`, `retryRemoving`, `applyValueChange`, `enqueueScale`, `mergeQualifier`, `onRenameQualifier`), `QuietScope` (a document keydown in the capture phase and a mousedown), the focus-return effect (it looks up `[data-testid="plan-type-field"] [data-plan-type-trigger]`), `readRecord(id, planVault)` with the vault id in the `at` slot, and `migratedAuthorityRelation(..., vaultId, ...)` against `writeAuthorityRelation({ ..., vaultId: planVault })`.
- `src/components/records/PersonAuthoritySearch.tsx` lines 1-88 (the whole file) to `src/PersonAuthoritySearch.tsx`; the exports are the source's (`PersonAuthoritySearch`, `ConstraintCreateAuthority`). Named changes: imports (`personTypeNames` and `CONSTRAINT_AVOID` from `plan-stakeholders-model`, `OrgRecordPicker` and `OrgRecordHit` from `record-picker`); `useShell()`, `heldVaultIds(...)`, `useQuery(STAKEHOLDER_TYPE_SET_QUERY)` and `findStakeholderRecords(...)` are host members (lines 26-30), and the host is read from the context first.
- `src/lib/base/planFind.ts` lines 15-37 to `src/planFind.ts` (private): `PLAN_FIND_CAP`, `PLAN_FIND_CAP_PART_OF`, `planFindCapFor`, `PlanFind`, `planFindRows`. Code verbatim; a tag in one comment taken out.
- `src/lib/base/planVault.ts` lines 6-10 (`planVaultOf`) and `src/lib/base/picture.ts` lines 72-76 (`vaultIdOfEntity`) to `src/planVault.ts` (private). Code verbatim.
- `src/lib/base/records.ts` lines 427-433 and 447-452 (`WriteSource`, `writeSource`) and 942-948 (`MergePatchValue`) to `src/writeSource.ts` (private, the types exported). Code verbatim.
- `src/lib/base/entityDisplayName.ts` lines 22, 28, 35-42, 45, 53, 155-165, 167-174, 192-212 and 219-278 (`CANONICAL_DISPLAY_SLUG`, `MASTER_TAG_SLUGS`, `IDENTITY_DISPLAY_SLUGS`, `BRIDGE_SLUGS`, `FILE_NAME_SLUG`, `EntityDisplayOpts`, `factTrim`, `displayFriendly`, `entityDisplayName`) to `src/entityDisplayName.ts` (private). The code is the source's but for one replacement: `PARTY_NAME_FLOOR.name` (in `src/lib/base/partyName.ts`) is its literal value `"name"`. This is not the `entity-name` unit, which reads `label` first; the name the card gives a person it has just made reads the record's own `name` first, as the app's does. (The same copy as the one in `plan-stakeholder-lines`.) At 9a602ea7 `EntityDisplayOpts` gained `mainTag` and `entityDisplayName` the two lines that return it after the `unitTag` / `tag` loop; the card never passes `mainTag` (`PlanFunctionForm.tsx:831` does not), so that branch is dead in this unit and is kept for fidelity with the source. `needsMainTag`, which sits in the same source file, is not copied (it lives in `main-tag`).
- `src/components/records/planLeave.ts` is not copied: `insideOpenLayer` of `open-popups` is the same code.
- `src/host.ts`, `src/index.ts` are new.

Tests:

| Source | Ported / left out |
|---|---|
| The 488 card cases of GilbApp: forty-three `src/components/records/RecordDetail.plan*.test.tsx` files (453 cases) — among them `RecordDetail.planCard.vaultit.test.tsx` (Function and Function Constraint), `RecordDetail.planSolution.vaultit.test.tsx`, `RecordDetail.planResourceCard.vaultit.test.tsx`, `RecordDetail.planValueCard.vaultit.test.tsx`, `RecordDetail.planStatus.vaultit.test.tsx`, `RecordDetail.planConstraintAuthority.vaultit.test.tsx`, `RecordDetail.planFunctionEtagOffList.vaultit.test.tsx` — and `PlanType.qa4.v36` (6), `PlanValueQualifiersFollowScale.v32` (25) and `PlanValueRename.qa4.v36` (4) | Left out as files: they render the whole record screen (`RecordDetail`) with a stubbed `fetch`, the shell, the working set and the app's query client, and pre-seed the app's caches; none renders the card alone but for the one import of `pickLive`. What they pin is ported as card-level tests with a fake host, below; what they assert of the record screen (the Tag field, the header, the Add-information button) stays in the app. |
| `FUNCTION_ORDER`, `CONSTRAINT_ORDER` (`RecordDetail.planCard.vaultit.test.tsx`), `SOLUTION_ORDER`, `DESIGN_CONSTRAINT_ORDER` (`RecordDetail.planSolution.vaultit.test.tsx`) and the Development Resource and Value lists (`RecordDetail.planResourceCard.vaultit.test.tsx`, `RecordDetail.planValueCard.vaultit.test.tsx`) | Ported to `src/lines.test.tsx` with the same arrays and the same assertion, on the same seam (`__startCardsInEditMode(true)` for the full lists; view mode for the lists of an empty card). The Authority required, the preselected Level, the absent kinds of a Solution, Budget for Goal and the Resource Owner line are ported with them. |
| `pickLive` (`RecordDetail.planFunctionEtagOffList.vaultit.test.tsx`, 1 case) and the cases of that file about the version a save returned, a save with no version, a list another writer changed, the version that cannot be read, and the vault the row is stored in | Ported to `src/helpers.test.tsx` (`pickLive`, the same inputs and expectations) and to `src/write.test.tsx`, against the fake host. |
| Every other case | New, in `src/`: `write.test.tsx` (one patch with If-Match through the host, the stored row, the next version, no-op, source, conflict, 409, 5xx, no answer, unreadable version, a list changed under the card, the queue, the migration of the older Authority), `status.test.tsx`, `retype.test.tsx`, `type.test.tsx` (the Type line, the Replace question and the focus return), `value.test.tsx` (an edit in each Value line goes to its hook, the Endpoint, the older lists and their move, the hooks for every type), `readonly.test.tsx`, `quiet.test.tsx`, `host.test.tsx` (the finds asked, the hooks called on every render, Open in Ontology), `helpers.test.tsx` (`draftFrom`, `pickLive`, the private copies, the missing host, the person search), `hostAgnostic.test.ts` (runs the host-agnostic check against planted faults). They run the card with a fake host (`test/app.tsx`: an in-memory vault, the relations of a record, a retype, a write log and every context the lines ask for) built on the browser fake that `value-card-write` ships for its own tests (`test/valueBrowser.tsx`, `test/server.ts`, `test/seed.ts`, `test/value.ts`, copied). |
