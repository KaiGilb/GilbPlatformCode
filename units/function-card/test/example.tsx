// The wiring the README shows: every provider the Plan card needs, in nesting order, each with a host of stubs, then the card.
// This file is type-checked with the unit and rendered by src/example.test.tsx. In your app a stub body becomes a call to your own
// code; the comment on each member says which call it wraps. The README copy of this file differs only in the two import paths
// of this unit ("../src/index" is "@kaigilb/gilbplatformcode-function-card" there).
import { FunctionCard, PlanCardHostContext } from "../src/index";
import type { PlanCardHost } from "../src/index";
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
