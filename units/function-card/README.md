# function-card

The whole Function card: one component that draws the Plan card of a record of type Function or Function Constraint, with the lines of that type in order, every read and write supplied by the host.

## What this is

The whole Function card: one component that draws the Plan card of a record of type Function or Function Constraint, with the lines of that type in order, every read and write supplied by the host.

`FunctionCard` is the card of a record of type Function (`t:Function`) or Function Constraint (`t:FunctionConstraint`). A Function is changed to its constraint, and back, through the Type switch on the card itself (the card asks first, and a constraint needs a named person as its Authority); the lines change as soon as the record's type does.

- `FunctionCard(props)`: the card. `FunctionCardProps` is the props of `PlanFunctionForm` of `plan-card`: `{ record, vaultId, canEdit, onOpen, onNotice }`. `record` is the card's record (a `BaseRecord`), `vaultId` is the screen's vault, `canEdit` is whether the person may write, `onOpen(id)` opens a record, `onNotice(text | null)` shows or clears the card's notice. It draws `<div data-testid="plan-function-form">` with one `CardGroup` per line.
- Re-exported from `plan-card` so that this unit is enough to start from: `PlanCardHostContext` and the types `PlanCardHost`, `PlanCardShell`, `PlanFindQuery`, `RelationsQuery`, `CreateStakeholderProps`, `PlanFind`, `MergePatchValue`, `WriteSource` (the types a host writes its members with).
- Nothing else. The card is `<PlanFunctionForm {...props} />` and no more: no check of the type, no extra prop, no behaviour. The record's type decides the lines.

### The lines, in order

The lines are those of `planLinesFor(record.typeUri)` of `plan-kinds`, after the Type · Level · Version line, which is always first. A group with nothing in it is not drawn in view mode unless the card mode's `showAll` seam is on; the Type group is not drawn in Edit while empty. Some lines draw the source control of `plan-source` under them. If you need only one line, take the unit in the last column instead of the whole card.

**Function** (`t:Function`)

| # | `data-group` | Title | Drawn by |
|---|---|---|---|
| 1 | `plan-type-level` | Type · Level · Version line (no title) | plan-type-level-version |
| 2 | `plan-description` | Description | description-parts-view |
| 3 | `plan-stakeholder` | Stakeholder | plan-stakeholder-lines |
| 4 | `plan-authority` | Authority | plan-stakeholder-lines |
| 5 | `plan-part-of` | Part of | plan-tag-links |
| 6 | `plan-sub-functions` | Sub-functions | plan-tag-links |
| 7 | `plan-meter` | Meter | plan-card itself (its own meter editor; the source of each meter is plan-source) |
| 8 | `plan-status` | Status | plan-card itself (its own status editor) |
| 9 | `plan-function-of-value` | Function of Value | plan-tag-links |
| 10 | `plan-solutions` | Solutions | plan-tag-links |
| 11 | `plan-type` | Type | plan-type-field |

**Function Constraint** (`t:FunctionConstraint`)

| # | `data-group` | Title | Drawn by |
|---|---|---|---|
| 1 | `plan-type-level` | Type · Level · Version line (no title) | plan-type-level-version |
| 2 | `plan-description` | Description | description-parts-view |
| 3 | `plan-authority` | Authority | plan-stakeholder-lines |
| 4 | `plan-stakeholder` | Stakeholder | plan-stakeholder-lines |
| 5 | `plan-part-of` | Part of | plan-tag-links |
| 6 | `plan-sub-functions` | Sub-functions | plan-tag-links |
| 7 | `plan-meter` | Meter | plan-card itself (its own meter editor; the source of each meter is plan-source) |
| 8 | `plan-status` | Status | plan-card itself (its own status editor) |
| 9 | `plan-type` | Type | plan-type-field |

A Function Constraint has Authority before Stakeholder, marked required, and no Function of Value or Solutions line. Authority offers people only on the constraint.

## What this is not

- Not a second implementation of the card. It is `PlanFunctionForm` of `plan-card` (the engine of the four Plan cards) under a name that says which card it is for; `plan-card` has the rules, the host members and the tests of the engine.
- Not a guard. It does not look at the record's type and does not refuse another one.
- Not a reader or writer of records. It never fetches, never writes, never caches; the host does. A host without its four writers gets a read-only card.
- Not the lines: each one is a unit of its own (last column above).

## How to take it

**On GilbPlatform, take the ready-made host as well.** `plan-card-hosts-gilbplatform` is one provider that answers every host context this card needs, so the card draws, reads and saves in a GilbPlatform vault with no host object written. Its README gives the whole install (`node scripts/peers.mjs units/plan-card-hosts-gilbplatform`, which includes this card's peers but not the card itself: add this card to that line) and one wiring example. The rest of this section, and "What the host must supply", are for a host other than GilbPlatform.

Package: `@kaigilb/gilbplatformcode-function-card`

Take it with its peer `plan-card` (0.2.0 or later in the 0.2 line) and everything `plan-card` needs; the command below names all of them (67 units in all, this one last), in an order that installs. Third-party: `@dnd-kit/core` 6.3.1 and `react-dom` 19, which `plan-card` passes on as its own peers, and `react` 19. Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit, so one copy of each context and of each module's state):

```
install-links=true
```

Then install them:

```sh
npm install @dnd-kit/core@6.3.1 react-dom@19 <path-to-the-library>/units/base-record <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/date-rules <path-to-the-library>/units/entity-ref <path-to-the-library>/units/fact-faithful <path-to-the-library>/units/help-doc <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/sortable-tree <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-impacts-model <path-to-the-library>/units/plan-source <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/description-help <path-to-the-library>/units/description-parts-view <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/plan-tag-picker <path-to-the-library>/units/plan-impacts <path-to-the-library>/units/project-levels <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/plan-type-level-version <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/plan-tag-links <path-to-the-library>/units/value-card-model <path-to-the-library>/units/value-card-write <path-to-the-library>/units/value-graph-geometry <path-to-the-library>/units/value-graph <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-endpoint-line <path-to-the-library>/units/value-illustration <path-to-the-library>/units/value-levels-line <path-to-the-library>/units/value-meters-line <path-to-the-library>/units/value-qualifiers-line <path-to-the-library>/units/value-scale-line <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/plan-type-field <path-to-the-library>/units/plan-card <path-to-the-library>/units/function-card
```

The package ships TypeScript source (`src/`) and the test fakes (`test/`); your bundler compiles the source. React 19 is a peer. If your compiler checks the source of the units, leave out `noImplicitOverride` and `noUncheckedIndexedAccess`, as `plan-card`'s `tsconfig.json` does, because the units it is built from do not use the `override` keyword and do not check indexed reads.

At start-up the app calls `setTermOrigin(<origin of the ontology's terms>)` (`term-origin`) once, and, if it has a type registry, `setTypeKey` (`type-key`) once. The card reads both through the units that need them.

## Examples

One complete wiring of the card in an app: every provider that `plan-card`'s README lists, in nesting order, each with a host of stubs. Each member's comment says which call of your app it wraps; a stub body becomes a call to your own code. The file is `test/example.tsx` of this unit; it is type-checked with the unit and `src/example.test.tsx` renders it. With no writers in the hosts the card is read-only whatever `canEdit` says: add `plan-card`'s four writers (and the optional writers of the other hosts) to let it save.

```tsx
import { FunctionCard, PlanCardHostContext } from "@kaigilb/gilbplatformcode-function-card";
import type { PlanCardHost } from "@kaigilb/gilbplatformcode-function-card";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { ValueWriteHostContext, type ValueWriteHost } from "@kaigilb/gilbplatformcode-value-card-write";
import { StakeholderLinesHostContext, type StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { PlanTagLinksHostContext, type PlanTagLinksHost } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanImpactsHostContext, type PlanImpactsHost } from "@kaigilb/gilbplatformcode-plan-impacts";
import { DescriptionPartsHostContext, type DescriptionPartsHost } from "@kaigilb/gilbplatformcode-description-parts-view";
import { ProjectLevelsHostContext, type ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypePictureSourceContext, createTypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";

/** Once, at start-up. `setTypeKey` (type-key) is also called once, if your app has a type registry. */
export function startUp() {
  setTermOrigin("https://ontology.example.test"); // the address your ontology's terms live under
}

// ---- Small helpers the stubs share (yours are your own queries and caches).
const none: never[] = [];
const noRead = async () => null; //                                  your read of one record, "not found"
const live = (_vault: string, _id: string, fallback: BaseRecord) => fallback as GridRecord; // your newest cached copy of a record
const sameEtag = async (_vault: string, row: GridRecord) => ({ row }); // your check that a record still has the version it was read at
const patched = (row: GridRecord) => row; //                         your cache's "this row with the patch applied"
const nothing = () => {}; //                                          a write into your cache or a request to refresh a find
const findNone = { data: undefined, isLoading: false, isError: false }; // a find that has found nothing
const nameOnly = (idOrUri: string) => idOrUri; //                     your function that makes a record's address from its id

// ---- PlanSourceHostContext (plan-source): the source control under every line.
const planSourceHost: PlanSourceHost = {
  useShell: () => ({ vaults: none }), //                              your session
  heldVaultIds: () => none, //                                        the ids of the vaults the person can read
  useStakeholderTypes: () => ({ data: { names: ["Person", "Organization"] } }), // your stakeholder kinds
  useVaultFilesMulti: () => ({ data: none, isPending: false, error: null }), //   your list of the files of those vaults
  matchWorkingSetQuery: () => none, //                                your match of a typed text against a list
  findStakeholderRecords: async () => ({ hits: none, complete: true, vaultsMissed: false }), // your search of stakeholders
  readRecord: noRead,
  memberEntityUri: nameOnly,
  ConnectedCreateDialog: () => null, //                               your dialog that makes a record
};

// ---- RefLabelContext (entity-ref-value) and PickerQueryContext (record-picker): a linked record's label, and the pickers' query hook.
const useRefLabel: UseRefLabel = () => null; //                       your name for a record address, or null
const usePickerQuery: UsePickerQuery = () => ({ isFetching: false, isError: false, isSuccess: false }); // your query hook: run `run()` for `key`

// ---- ValueLinesHostContext (value-line-kit): the five Value lines and the Illustration.
const valueLinesHost: ValueLinesHost = {
  useLinkLabel: () => null, //                                        your name for a linked record
  searchTypes: async () => ({ options: none, reach: "Searched the example ontology.", degraded: false }), // your type search
  blankReach: "Type to search the example ontology.",
};

// ---- ValueWriteHostContext (value-card-write): the Value's levels, qualifiers, meters and Scale. Mounted for every card.
const valueWriteHost: ValueWriteHost = {
  createRecord: async () => { throw new Error("wire createRecord to your create call"); },
  readRecord: noRead,
  patchRecord: async () => { throw new Error("wire patchRecord to your patch call"); },
  useDeleteRecord: () => ({ mutateAsync: async () => undefined }), //  your delete mutation
  isConflict: () => false, //                                         true for your version-check error (412)
  isForbidden: () => false, //                                        true for your "not allowed" error (403)
  cachedPlanFind: () => undefined, //                                 your cached find of linked records
  fetchPlanFind: async () => ({ rows: none, total: 0, capped: false, unread: 0 }), // your fetch of that find
  usePlanFinds: (_vault, _attr, parents) => parents.map(() => ({ data: undefined })), // your find hook, one per parent
  prependPlanFind: nothing,
  dropPlanFind: nothing,
  patchPlanFindRows: nothing,
  invalidatePlanFind: async () => {},
  liveRow: live,
  ensureEtagUnchanged: sameEtag,
  reconcileAfterConflict: noRead,
  storePlanRow: nothing,
  setPlanRecord: nothing,
  invalidatePlanSearch: nothing,
  rememberRecord: async () => {}, //                                  your "recently used" list
  markFreshlyCreated: nothing,
  typeUriForVaultNamespace: (typeName) => `t:${typeName}`, //          your type address for a vault
};

// ---- StakeholderLinesHostContext (plan-stakeholder-lines): the Stakeholder, Authority and Resource Owner lines.
const stakeholderLinesHost: StakeholderLinesHost = {
  useRecords: () => ({ data: none }), //                              your list of a vault's records
  useRecordRead: () => ({ data: null }), //                           your read hook for one record
  useMainTag: () => ({ data: { known: false, tag: null } }), //  your read of one record's main tag (main-tag's useMainTag)
  useRelations: () => ({ data: none, isError: false }), //            your relations of a record
  useStakeholderKinds: () => ({ data: undefined }),
  usePersonAuthorities: () => ({ people: none }),
  useHeldVaults: () => none,
  useOpenRecordInVault: () => undefined, //                           your "open this record" action
  useRelationDoc: () => ({ data: null }),
  hasSubstitutedType: () => false,
  getRelations: () => undefined,
  getKindSet: () => undefined,
  liveRow: live,
  readRecord: noRead,
  memberEntityUri: nameOnly,
  findStakeholders: async () => ({ hits: none, complete: true, vaultsMissed: false }),
  findAnyRecords: async () => ({ hits: none, complete: true, vaultsMissed: false }),
  ensureEtagUnchanged: sameEtag,
  applyPatch: patched,
  storePlanRow: nothing,
  setRecordRead: nothing,
  setRelations: nothing,
  invalidateSearch: nothing,
  // The optional writers (writePairRelation, endRelation, patchRecord, writeAuthorityRelation, endThenWriteAuthority, renderCreateStakeholder) are left out.
};

// ---- PlanTagLinksHostContext (plan-tag-links): Part of, Sub-functions, Function of Value, Solutions and the other links.
const planTagLinksHost: PlanTagLinksHost = {
  useRecords: () => ({ data: none }),
  useMainTagsForRows: () => new Map(), //  your batch read of records' main tags (main-tag's useMainTagsForRows)
  useRelations: () => ({ isPending: false, isError: false, data: none }),
  usePlanFind: () => ({ data: undefined, isError: false }), //         your find of linked records
  invalidatePlanFind: nothing,
  invalidatePlanSearch: nothing,
  liveRow: live,
  ensureEtagUnchanged: sameEtag,
  applyPatch: patched,
  storePlanRow: nothing,
  setPlanRecord: nothing,
  dropPlanFind: nothing,
  prependPlanFind: nothing,
  putRecordInCaches: nothing,
  getRelations: () => undefined,
  setRelations: nothing,
  resolveType: () => null, //                                         your registry's description of a type
  typeUriForVaultNamespace: (typeName) => `t:${typeName}`,
  memberEntityUri: nameOnly,
  readRecord: noRead,
  // The optional writers (patchRecord, createRecord, useCreateRecord, writePairRelation, endRelation, ConnectedCreateDialog) are left out.
};

// ---- PlanTagPickerHostContext (plan-tag-picker): the picker the link lines and Impacts use.
const planTagPickerHost: PlanTagPickerHost = {
  findPlanRecords: async () => ({ hits: none, complete: true }), //    your search of plan records by text
  tagUsed: async () => false, //                                      your check that a tag is taken
  invalidateSearch: nothing,
};

// ---- PlanImpactsHostContext (plan-impacts): the Impacts line.
const planImpactsHost: PlanImpactsHost = {
  useRecords: () => ({ data: none }),
  useMainTagsForRows: () => new Map(), //  your batch read of records' main tags (main-tag's useMainTagsForRows)
  useRelations: () => ({ isPending: false, isError: false, data: none }),
  useSelfSource: () => null, //                                       the signed-in person as a source
  useRelationDoc: () => ({ data: null }),
  resolveType: () => null,
  invalidatePlanSearch: nothing,
  getRecordPages: () => undefined,
  setRecordPages: nothing,
  setRelations: nothing,
  // The optional writers (useCreateRecord, writePairRelation, endRelation) are left out.
};

// ---- DescriptionPartsHostContext (description-parts-view): the Description (Ambition Level) parts.
const descriptionPartsHost: DescriptionPartsHost = {
  pageChildIds: async () => ({ ids: none, count: 0, capped: false }), // your paged read of the ids of a record's parts
  markStale: async () => {},
  readMember: noRead,
  applyPinsAndDrops: (_vault, _attr, _parent, rows) => rows,
  useRecords: () => ({ data: none }),
  usePlanFind: () => ({ data: undefined, status: "success", isLoading: false, isError: false, isPending: false, isSuccess: true }),
  useSubFinds: (_vault, _attr, parents) => parents.map(() => ({ data: undefined, status: "success" as const, isLoading: false, isError: false, isPending: false, isSuccess: true })),
  useSelfSource: () => null,
  cachedRecords: () => none,
  getFind: () => undefined,
  getFinds: () => none,
  liveRow: live,
  readRecord: noRead,
  tagUsedInVault: async () => false,
  ensureEtagUnchanged: sameEtag,
  reconcileAfterConflict: noRead,
  isConflict: () => false,
  typeUriForVaultNamespace: (typeName) => `t:${typeName}`,
  storePlanRow: nothing,
  setRecordRead: nothing,
  invalidatePlanSearch: nothing,
  prependPlanFind: nothing,
  dropPlanFind: nothing,
  patchPlanFindRows: nothing,
  invalidatePlanFind: async () => {},
  setFind: nothing,
  rememberRecord: async () => {},
  markFreshlyCreated: nothing,
  HelpButton: ({ label }) => <button type="button">{label}</button>, // your help button
  // The optional writers (createRecord, patchRecord, useDeleteRecord) are left out.
};

// ---- ProjectLevelsHostContext (project-levels): the Level choices.
const projectLevelsHost: ProjectLevelsHost = {
  useAllLevels: () => ({ data: none, isSuccess: true, isError: false, error: null }), // your list of the project's levels
  waitForLevels: async () => {},
  ensureDefaultLevels: async () => none,
  addProjectLevel: async (_vault, label) => label,
};

// ---- TermDefinitionContext (type-term-popover): the definition shown by the Type line's popovers.
const readTermDefinition: ReadTermDefinition = async () => ({ state: "unreachable", reason: "example" }); // your read of a type's definition

// ---- TypePictureSourceContext (type-picture): optional; without it no picture is drawn.
const typePictureSource = createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: (iri) => iri });

// ---- PlanCardHostContext (plan-card): the card's own reads and writes.
const planCardHost: PlanCardHost = {
  // reads (hooks)
  useSelfSource: () => null, //                                       the signed-in person as a source
  useRelations: () => ({ data: none, isPending: false, isError: false }),
  usePlanFind: () => findNone,
  usePersonAuthorities: () => ({ people: none, pending: false, error: false }),
  // the person search and the Type picker
  useShell: () => ({ vaults: none }),
  heldVaultIds: () => none,
  useStakeholderKindSet: () => ({ data: undefined }),
  findStakeholderRecords: async () => ({ hits: none, complete: true }),
  searchTypes: async () => ({ options: none, reach: "Searched the example ontology.", degraded: false }),
  blankReach: "Type to search the example ontology.",
  // click-time getters
  getRelations: () => undefined,
  getKindSet: () => undefined,
  liveRow: live,
  readRecord: noRead,
  memberEntityUri: nameOnly,
  ensureEtagUnchanged: sameEtag,
  applyPatch: patched,
  isConflict: () => false,
  reconcileAfterConflict: noRead,
  // cache writes
  storePlanRow: nothing,
  setRecordRead: nothing,
  setRelations: nothing,
  invalidateAuthoritySearch: nothing,
  // the dialog that makes a person
  renderCreateStakeholder: () => null,
  // The four writers are left out, so the card is read-only. Add all four together to let it save:
  //   patchRecord, useRetypeRecord, migratedAuthorityRelation, writeAuthorityRelation.
};

/** The card on a screen: `record` is the Function or Function Constraint to draw. */
export function FunctionScreen({ record, vaultId, canEdit, onOpen, onNotice }: {
  record: BaseRecord;
  vaultId: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
}) {
  return (
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
                              <PlanCardHostContext.Provider value={planCardHost}>
                                <CardModeProvider canEdit={canEdit}>
                                  <FunctionCard record={record} vaultId={vaultId} canEdit={canEdit} onOpen={onOpen} onNotice={onNotice} />
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
    </PlanSourceHostContext.Provider>
  );
}
```

The `record` must change when the host's `storePlanRow` runs (the screen takes its record from the same lists and reads the card writes to), and when the host retypes a record: the card relies on the new `record` to draw the saved version, the new type and its lines.

## What the host must supply

The full list is in `units/plan-card/README.md`, section "What the host must supply": the `PlanCardHostContext` members (reads, person search, Type picker, click-time getters, cache writes, the four writers, the dialog) and the contexts of the units the card draws. This unit adds nothing to it. On GilbPlatform, `plan-card-hosts-gilbplatform` supplies all of it.

What this card draws: the Type · Level · Version line, Description, Stakeholder, Authority, Part of, Sub-functions, Function of Value, Solutions, Type, and the card's own Meter and Status.

Measured on this unit's example (one provider left out at a time, every group shown by the card mode's edit seam, a record of each type the card covers): FunctionCard fails on its first draw without `PlanSourceHostContext`, `ValueWriteHostContext`, `StakeholderLinesHostContext`, `PlanTagLinksHostContext`, `DescriptionPartsHostContext`, `ProjectLevelsHostContext`, `PlanCardHostContext`. It still draws without `RefLabelContext`, `PickerQueryContext`, `ValueLinesHostContext`, `PlanTagPickerHostContext`, `PlanImpactsHostContext`, `TermDefinitionContext`, `TypePictureSourceContext`, `CardModeProvider`; those are read by pickers, popovers and labels that open or appear later (the source control, the link and person pickers, the Type popovers, the label of a linked record, the picture of a type), so mount them all, as the example does. The Value's write hooks run for EVERY type, so `ValueWriteHostContext` is needed here whatever the type. `ModalPortalContext` of `open-popups` only when your app draws its create dialog in a portal of its own.

If the host has a type registry it calls `setTypeKey` once at start-up, and it calls `setTermOrigin` once.

## Do not

- Do not give the card a `record` that stays as it was after the card has saved: the card relies on `record` changing when the host's `storePlanRow` runs (and when the host retypes the record).
- Do not wrap the card so that it draws only when the record's type is `t:Function`. A Function changed to a Function Constraint has the same card with other lines; a wrapper that guards the type would unmount it at the moment the person presses Change.
- Do not run two installed copies of this unit, of `plan-card` or of the units it draws. The engine keeps a counter in its module and the units keep their contexts and registries; two copies are two sets.
- Do not copy the card's props type: use `FunctionCardProps`, which follows `plan-card`.

## Changes in 0.2.0

- The wiring example's hosts gain `useMainTag` (Stakeholder lines) and `useMainTagsForRows` (Impacts, Tag links); the card shows a nameless linked record by its main tag. A host written for 0.1.0 must add the three members (BREAKING for hosts); the stubs in the example show the form.
- Peer `plan-card` ^0.2.0. No code of `src/` changed: the card is still the engine's element with the props it was given.

## Wrong readings

- "The Function card is a Function-only component." It has no check of the type. It passes its props to the engine, and the record's type picks the lines: given a Solution it draws the Solution's lines (a test pins this). Hand it a Function or a Function Constraint. The same card moves from one to the other when the host retypes the record, because the card must not fix its lines.
- "A Function Constraint needs a card of its own." It is this card: the Type switch changes the type through the host (`useRetypeRecord`) and the lines change with the record.
- "The card is a separate implementation." It is `PlanFunctionForm` of `plan-card` and nothing else. A fix to the card is a fix to `plan-card`.
- "One installed copy is optional." It is not. `plan-card`, each unit it draws and the contexts they define must each be installed once (`install-links=true`); two copies of a context mean a provider the card cannot see.
- "`canEdit` true makes the card editable." Only when the host also gives the four writers (`patchRecord`, `useRetypeRecord`, `migratedAuthorityRelation`, `writeAuthorityRelation`); without any one of them the card is read-only, as with `canEdit` false.
- "The Value hooks run only for a Value." They run for every type, with `enabled` false when the record is not a Value or a Development Resource. Mount `ValueWriteHostContext` for this card too.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`: `src/components/records/PlanFunctionForm.tsx`, via `units/plan-card` (all of the card's behaviour, the line lists of `planLinesFor` in `lib/base/planKinds.ts`, and the way the screen mounts it in `components/records/RecordDetail.tsx`). This unit adds only a named entry point, and it is the only new code of the four whole-card units:

- `src/FunctionCard.tsx` (new, 9 lines): `FunctionCard` and `FunctionCardProps` (`ComponentProps<typeof PlanFunctionForm>`).
- `src/index.ts` (new): the card, its props type, and the re-exports from `plan-card` listed above.
- `test/example.tsx` (new): the example above.

Tests:

| Source | Ported / left out |
|---|---|
| `FUNCTION_ORDER` and `CONSTRAINT_ORDER` of `RecordDetail.planCard.vaultit.test.tsx` | The same arrays, as in `plan-card`'s `src/lines.test.tsx`, asserted on the `data-group` of the card's groups (`src/lines.test.tsx` of this unit), in Edit with every group shown, with no card mode above it, and in view mode for an empty card. |
| Props | `src/props.test.tsx`: the card is the engine's element with the very props it was given; `canEdit` false (and a host without its writers) gives a read-only card; `record`, `vaultId` and `onNotice` reach the engine. |
| The example | `src/example.test.tsx` renders `test/example.tsx` with a record from the fakes. |
| The host-agnostic check | `src/hostAgnostic.test.ts` runs `scripts/check-host-agnostic.mjs` against planted faults. |
| Test fakes | `test/` is `plan-card`'s own (`app.tsx`, `server.ts`, `seed.ts`, `value.ts`, `valueBrowser.tsx`, `helpers.ts`, `setup.ts`), copied, with three changes: `app.tsx` imports the engine from `@kaigilb/gilbplatformcode-plan-card` and its `Card` and `mountCard` take the component to draw (`as`); `valueBrowser.tsx` carries the one-line `planFindRows` that `plan-card` keeps private. |
