// A small stand-in for the app around the Plan card, for the tests. One call to makeApp is one person's browser on one in-memory vault:
//
//  - the vault (test/server.ts) keeps the records and bumps a record's version on every write; with `ifMatch` it refuses a stale one with
//    the 412-class error;
//  - the browser (test/valueBrowser.tsx, the one the Value write layer ships its tests with) holds the finds, the row cache and the
//    record reads, and is the Value write layer's host;
//  - this file adds what only the card asks: the relations of a record, the retype, the Authority writes, the person search, the type
//    search, and the dialog that makes a person. Every member is a vi.fn that also logs its call in `log`, in order, as "name json".
//
// `Card` mounts the card as RecordDetail does: it holds the record in state and takes the new row when the card stores one (the card
// relies on the `record` prop changing when `storePlanRow` runs), inside every context the lines the card draws ask for.
import { vi, type Mock } from "vitest";
import { render } from "@testing-library/react";
import { useEffect, useReducer, useState, type ComponentType, type ReactNode } from "react";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext, type PickerFind, type PickerQueryArgs, type PickerQueryResult } from "@kaigilb/gilbplatformcode-record-picker";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { StakeholderLinesHostContext, type StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { PlanTagLinksHostContext, type PlanTagLinksHost } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanImpactsHostContext, type PlanImpactsHost } from "@kaigilb/gilbplatformcode-plan-impacts";
import { DescriptionPartsHostContext, type DescriptionPartsHost } from "@kaigilb/gilbplatformcode-description-parts-view";
import { ProjectLevelsHostContext, type ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { PlanCardHostContext, PlanFunctionForm, type CreateStakeholderProps, type MergePatchValue, type PlanCardHost, type PlanFind } from "@kaigilb/gilbplatformcode-plan-card";
import { createServer, entityUriOf, type Server } from "./server";
import { makeBrowser } from "./valueBrowser";

export const SCREEN = "https://p.example.test/vault";
/** The vault the records live in: the address of a record up to its `/e/`. */
export const VAULT = "https://h.example.test/base";
export const ANN = "https://h.example.test/base/e/ann";
export const TERMS = "https://ontology.example.test";

export type FakeCardHost = { [K in keyof PlanCardHost]-?: PlanCardHost[K] extends ((...a: infer A) => infer R) | undefined ? Mock<(...a: A) => R> : PlanCardHost[K] };

/** A record row as the vault serves it. `served` are the facts as stored; the row's `facts` are the same as text. */
export function rowOf(id: string, typeUri: string, served: Record<string, unknown>, etag = '"v1"', updatedAt = 1): GridRecord {
  const facts: Record<string, string> = {};
  for (const [k, v] of Object.entries(served)) facts[k] = typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
  return {
    id,
    entityUri: entityUriOf(id),
    typeUri,
    facts,
    opaqueFacts: [],
    etag,
    updatedAt,
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag },
  } as GridRecord;
}

/** The row with a patch applied, the way a list holds it. */
function applyPatchTo(row: GridRecord, patch: Record<string, MergePatchValue>, etag: string | null): GridRecord {
  const served: Record<string, unknown> = { ...(row.served?.facts ?? {}) };
  const facts = { ...row.facts };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete served[k];
      delete facts[k];
    } else {
      served[k] = v;
      facts[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  return { ...row, facts, etag, servedKeys: Object.keys(served), served: { ...row.served, facts: served, etag } } as GridRecord;
}

export interface AppOptions {
  /** The vault refuses a patch whose If-Match is not the record's version (the 412 class). */
  ifMatch?: boolean;
  /** The signed-in person as a source; null: the card writes with no source. */
  self?: { "@id": string } | null;
  /** The Authorities of the record that are people (`usePersonAuthorities`). */
  people?: readonly unknown[];
  /** The card's host has no writers. */
  readOnly?: boolean;
  /** The relations the record starts with, by record id. */
  relations?: Record<string, RecordRelation[]>;
  /** The platform's MAIN tag of a record, by its entity address. Empty by default. */
  mainTags?: Record<string, string>;
  /** The records the Impacts and Tag-links lines find their linked records in (their `useRecords` pool). Empty by default. */
  pool?: readonly GridRecord[];
}

export function makeApp(options: AppOptions = {}) {
  const server: Server = createServer({ ifMatch: options.ifMatch ?? false, mainTags: options.mainTags ?? {} });
  const browser = makeBrowser(server);
  const log: string[] = [];
  const note = (name: string, ...args: unknown[]) => log.push(`${name} ${JSON.stringify(args)}`);

  const state = {
    self: options.self === undefined ? null : options.self,
    people: options.people ?? [],
    peoplePending: false,
    peopleError: false,
    /** The type name of the hit the person search finds for "ann". */
    hitType: "Person",
    relations: new Map<string, RecordRelation[]>(Object.entries(options.relations ?? {})),
    stored: [] as GridRecord[],
    dialog: [] as CreateStakeholderProps[],
  };
  const listeners = new Set<() => void>();
  const rowListeners = new Set<(row: BaseRecord) => void>();
  const emit = () => listeners.forEach((l) => l());
  const emitRow = (row: BaseRecord) => rowListeners.forEach((l) => l(row));

  const useStore = () => {
    const [, bump] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      listeners.add(bump);
      return () => void listeners.delete(bump);
    }, []);
  };

  /** Put a record in the vault; the card is mounted with the row the vault serves. */
  function seed(id: string, typeUri: string, served: Record<string, unknown>): GridRecord {
    server.set({ id, typeUri, served: { ...served }, n: 1 });
    return rowOf(id, typeUri, served);
  }

  const stakeholderKinds = { names: ["Person", "Organization"], complete: true, types: [] };

  const host: FakeCardHost = {
    useSelfSource: vi.fn(() => state.self),
    useRelations: vi.fn((recordId: string) => {
      useStore();
      return { data: state.relations.get(recordId) ?? [], isPending: false, isError: false };
    }),
    usePlanFind: vi.fn((vault: string, attr: string, parent: { id: string; entityUri?: string } | null) => {
      const r = browser.host.usePlanFinds(vault, attr, [{ id: parent?.id ?? "", entityUri: parent?.entityUri, enabled: !!parent?.entityUri }])[0] as unknown as { data?: PlanFind; isLoading: boolean; isError: boolean };
      return { data: r.data, isLoading: r.isLoading, isError: r.isError };
    }),
    usePersonAuthorities: vi.fn(() => {
      useStore();
      return { people: state.people, pending: state.peoplePending, error: state.peopleError };
    }),
    useRetypeRecord: vi.fn((vaultId: string) => ({
      mutateAsync: async ({ record, typeName }: { record: BaseRecord; typeName: string }) => {
        note("retype", vaultId, record.id, typeName);
        const srv = server.get(record.id)!;
        srv.typeUri = `t:${typeName}`;
        srv.n += 1;
        const row = (await server.read(record.id, record.entityUri ?? null)) as unknown as GridRecord;
        browser.host.storePlanRow(VAULT, row);
        emitRow(row);
        return { etag: row.etag, typeUri: row.typeUri, facts: row.facts };
      },
    })),
    useShell: vi.fn(() => ({ vaults: [{ vaultId: VAULT, held: true }] })),
    heldVaultIds: vi.fn((vaults: readonly unknown[]) => (vaults as { vaultId: string; held: boolean }[]).filter((v) => v.held).map((v) => v.vaultId)),
    useStakeholderKindSet: vi.fn(() => ({ data: stakeholderKinds as never })),
    findStakeholderRecords: vi.fn(async (vaultIds: readonly string[], typeNames: readonly string[], text: string): Promise<PickerFind> => {
      note("findStakeholderRecords", vaultIds, typeNames, text);
      const hits = text.toLowerCase().includes("ann") ? [{ uri: ANN, label: "Ann Co", typeName: state.hitType }] : [];
      return { hits, complete: true, vaultsMissed: false };
    }),
    searchTypes: vi.fn(async () => ({ options: [], reach: "Searched the example ontology.", degraded: false })),
    blankReach: "Type to search the example ontology.",
    openOntologyConcept: vi.fn(),
    renderTypeIcon: undefined as never,
    getRelations: vi.fn((recordId: string) => state.relations.get(recordId)),
    getKindSet: vi.fn(() => stakeholderKinds as never),
    liveRow: vi.fn((vault: string, id: string, fallback: BaseRecord) => browser.host.liveRow(vault, id, fallback)),
    readRecord: vi.fn((id: string, at: string | null) => browser.host.readRecord(id, at)),
    memberEntityUri: vi.fn((idOrUri: string, preferredUri?: string | null, ns?: string | null) => {
      if (preferredUri?.startsWith("http")) return preferredUri;
      if (idOrUri.startsWith("http")) return idOrUri;
      return `${(ns ?? "").replace(/\/$/, "")}/e/${idOrUri}`;
    }),
    ensureEtagUnchanged: vi.fn(async (vault: string, row: GridRecord, sameFor: (fresh: GridRecord) => boolean) => {
      const gate = await browser.host.ensureEtagUnchanged(vault, row, sameFor);
      // A read for a missing version reached the caches; the screen takes its record from them.
      if (!row.etag) emitRow(browser.host.liveRow(vault, row.id, row));
      return gate;
    }),
    applyPatch: vi.fn(applyPatchTo),
    isConflict: vi.fn((e: unknown) => browser.host.isConflict(e)),
    reconcileAfterConflict: vi.fn(async (vault: string, row: { id: string; entityUri?: string | null }) => {
      const read = await browser.host.reconcileAfterConflict(vault, row);
      if (read) emitRow(read);
      return read;
    }),
    storePlanRow: vi.fn((vault: string, row: BaseRecord, opts?: { insert?: boolean }) => {
      note("storePlanRow", vault, row.id);
      state.stored.push(row as GridRecord);
      browser.host.storePlanRow(vault, row, opts);
      emitRow(row);
    }),
    setRecordRead: vi.fn((id: string, at: string, row: BaseRecord) => browser.host.setPlanRecord(id, at, row as GridRecord)),
    setRelations: vi.fn((recordId: string, _at: string | null, next: RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[])) => {
      const prev = state.relations.get(recordId);
      state.relations.set(recordId, typeof next === "function" ? next(prev) : next);
      emit();
    }),
    invalidateAuthoritySearch: vi.fn(() => void note("invalidateAuthoritySearch")),
    patchRecord: vi.fn(async (id, patch, at, source, pre) => {
      note("patchRecord", id, patch, at, source ? "source" : "no-source", pre);
      return browser.host.patchRecord(id, patch, at, source, { ifMatch: pre?.ifMatch ?? null });
    }),
    migratedAuthorityRelation: vi.fn(async () => null),
    writeAuthorityRelation: vi.fn(async (input) => {
      note("writeAuthorityRelation", input);
      return { relation: "t:AuthorityOf", uri: input.stakeholderUri, label: "Ann Co" } as unknown as RecordRelation;
    }),
    renderCreateStakeholder: vi.fn((props: CreateStakeholderProps): ReactNode => {
      state.dialog.push(props);
      return (
        <div data-testid="create-person-dialog">
          <button onClick={props.onClose}>Close person dialog</button>
          <button onClick={() => props.onCreated("new-ann")}>Person created</button>
        </div>
      );
    }),
  };
  if (options.readOnly) {
    delete (host as Partial<PlanCardHost>).patchRecord;
    delete (host as Partial<PlanCardHost>).useRetypeRecord;
    delete (host as Partial<PlanCardHost>).migratedAuthorityRelation;
    delete (host as Partial<PlanCardHost>).writeAuthorityRelation;
  }

  // ---- the contexts of the lines the card draws: stand-ins that answer "nothing there"
  const noFind = { data: undefined, isLoading: false, isError: false, isPending: false, isSuccess: true, status: "success" as const };
  const descriptionParts = {
    useRecords: () => ({ data: [] }),
    usePlanFind: (vault: string, attr: string, parent: { id: string; entityUri?: string } | null) => host.usePlanFind(vault, attr, parent) as never,
    useSubFinds: (_v: string, _a: string, parents: readonly unknown[]) => parents.map(() => noFind),
    useSelfSource: () => state.self,
    liveRow: (v: string, id: string, f: BaseRecord) => host.liveRow(v, id, f),
    readRecord: (id: string, at: string | null) => host.readRecord(id, at),
    HelpButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  } as unknown as DescriptionPartsHost;

  // The main-tag members of the three lines: what the fake server holds for the rows' entity addresses (the host's batch read), and for one address.
  const mainTagsForRows = (rows: readonly { entityUri?: string | null }[]): ReadonlyMap<string, string> => {
    const out = new Map<string, string>();
    for (const r of rows) {
      const tag = r.entityUri ? server.mainTags.get(r.entityUri) : undefined;
      if (r.entityUri && tag) out.set(r.entityUri, tag);
    }
    return out;
  };
  const mainTagOf = (uri: string | null | undefined) => {
    const tag = uri ? server.mainTags.get(uri) : undefined;
    return { data: tag ? { known: true, tag } : { known: false, tag: null } };
  };

  const tagLinks = {
    useRecords: () => ({ data: options.pool ?? [] }),
    useMainTagsForRows: (rows: readonly { entityUri?: string | null }[]) => mainTagsForRows(rows),
    useRelations: (id: string | null) => {
      useStore();
      return { isPending: false, isError: false, data: state.relations.get(id ?? "") ?? [] };
    },
    usePlanFind: (vault: string, attr: string, parent: { id: string; entityUri?: string } | null) => {
      const r = host.usePlanFind(vault, attr, parent);
      return { data: r.data, isError: r.isError };
    },
    resolveType: () => ({}),
  } as unknown as PlanTagLinksHost;

  const impacts = {
    useRecords: () => ({ data: options.pool ?? [] }),
    useMainTagsForRows: (rows: readonly { entityUri?: string | null }[]) => mainTagsForRows(rows),
    useRelations: (id: string | null) => {
      useStore();
      return { isPending: false, isError: false, data: state.relations.get(id ?? "") ?? [] };
    },
    useSelfSource: () => state.self,
    useRelationDoc: () => ({ data: null }),
    resolveType: () => ({}),
  } as unknown as PlanImpactsHost;

  const stakeholders = {
    useRecords: () => ({ data: [] }),
    useRecordRead: () => ({ data: null }),
    useMainTag: (uri: string | null | undefined) => mainTagOf(uri),
    useRelations: (id: string) => {
      useStore();
      return { data: state.relations.get(id) ?? [], isError: false };
    },
    useStakeholderKinds: () => ({ data: stakeholderKinds as never }),
    usePersonAuthorities: () => ({ people: [] }),
    useHeldVaults: () => [VAULT],
    useOpenRecordInVault: () => undefined,
    useRelationDoc: () => ({ data: null }),
    hasSubstitutedType: () => false,
    getRelations: (id: string) => state.relations.get(id),
    getKindSet: () => stakeholderKinds as never,
  } as unknown as StakeholderLinesHost;

  const tagPicker: PlanTagPickerHost = {
    findPlanRecords: async () => ({ hits: [], complete: true }),
    tagUsed: async () => false,
    invalidateSearch: () => {},
  };

  const projectLevels: ProjectLevelsHost = {
    useAllLevels: () => ({ data: [], isSuccess: true, isError: false, error: null }),
    waitForLevels: async () => {},
    ensureDefaultLevels: async () => [],
    addProjectLevel: async (_v, label) => label,
  };

  const linesHost: ValueLinesHost = {
    useLinkLabel: () => null,
    searchTypes: async () => ({ options: [], reach: "Searched the example ontology.", degraded: false }),
    blankReach: "Type to search the example ontology.",
  };

  const sourceHost: PlanSourceHost = {
    useShell: () => ({ vaults: [] }),
    heldVaultIds: () => [],
    useStakeholderTypes: () => ({ data: { names: ["Person"] } }),
    useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
    matchWorkingSetQuery: () => [],
    findStakeholderRecords: async () => ({ hits: [], complete: true, vaultsMissed: false }),
    readRecord: async () => null,
    memberEntityUri: (id) => id,
    ConnectedCreateDialog: () => null,
  };
  const useRefLabel: UseRefLabel = (ref) => (ref ? (ref.uri === ANN ? "Ann Co" : null) : null);
  // The picker's query hook, without a query library: run once for a key, hold the answer.
  function usePickerQuery({ key, run, enabled }: PickerQueryArgs): PickerQueryResult {
    const k = JSON.stringify(key);
    const [s, setS] = useState<PickerQueryResult>({ isFetching: false, isError: false, isSuccess: false });
    useEffect(() => {
      if (!enabled) return;
      let live = true;
      setS((v) => ({ ...v, isFetching: true }));
      run().then(
        (data) => live && setS({ data, isFetching: false, isError: false, isSuccess: true }),
        () => live && setS({ isFetching: false, isError: true, isSuccess: false }),
      );
      return () => {
        live = false;
      };
    }, [k, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
    return s;
  }

  const readTermDefinition = async () => ({ state: "unreachable" as const }) as never;
  const pictureSource = { fetchTypePictureSrc: async () => null } as never;

  /** Every context the lines the card draws ask for, around `children`. */
  function Frame({ children, withHost = true, mode = "legacy" }: { children: ReactNode; withHost?: boolean; mode?: "legacy" | "view" | "edit" }) {
    const inner = (
      <browser.Frame>
        <PlanSourceHostContext.Provider value={sourceHost}>
          <RefLabelContext.Provider value={useRefLabel}>
            <PickerQueryContext.Provider value={usePickerQuery}>
              <ValueLinesHostContext.Provider value={linesHost}>
                <StakeholderLinesHostContext.Provider value={stakeholders}>
                  <PlanTagLinksHostContext.Provider value={tagLinks}>
                    <PlanImpactsHostContext.Provider value={impacts}>
                      <PlanTagPickerHostContext.Provider value={tagPicker}>
                      <DescriptionPartsHostContext.Provider value={descriptionParts}>
                        <ProjectLevelsHostContext.Provider value={projectLevels}>
                          <TermDefinitionContext.Provider value={readTermDefinition}>
                            <TypePictureSourceContext.Provider value={pictureSource}>
                              <PlanCardHostContext.Provider value={withHost ? (host as PlanCardHost) : null}>{children}</PlanCardHostContext.Provider>
                            </TypePictureSourceContext.Provider>
                          </TermDefinitionContext.Provider>
                        </ProjectLevelsHostContext.Provider>
                      </DescriptionPartsHostContext.Provider>
                      </PlanTagPickerHostContext.Provider>
                    </PlanImpactsHostContext.Provider>
                  </PlanTagLinksHostContext.Provider>
                </StakeholderLinesHostContext.Provider>
              </ValueLinesHostContext.Provider>
            </PickerQueryContext.Provider>
          </RefLabelContext.Provider>
        </PlanSourceHostContext.Provider>
      </browser.Frame>
    );
    if (mode === "legacy") return inner;
    return (
      <CardModeProvider canEdit startEditing={mode === "edit"}>
        {inner}
      </CardModeProvider>
    );
  }

  return { server, browser, host, state, log, note, seed, Frame, emit, emitRow, rowListeners };
}

export type App = ReturnType<typeof makeApp>;

/** The card, held the way RecordDetail holds it: the record is state, and a row the card stores becomes the record. */
export type CardProps = { record: BaseRecord; vaultId: string; canEdit: boolean; onOpen: (id: string) => void; onNotice: (notice: string | null) => void };

export function Card({
  app,
  record,
  canEdit = true,
  vaultId = SCREEN,
  onNotice = () => {},
  onOpen = () => {},
  as: Component = PlanFunctionForm,
}: {
  app: App;
  record: BaseRecord;
  canEdit?: boolean;
  vaultId?: string;
  onNotice?: (n: string | null) => void;
  onOpen?: (id: string) => void;
  /** The component to draw: the engine by default, or the named card of this unit. */
  as?: ComponentType<CardProps>;
}) {
  const [current, setCurrent] = useState(record);
  useEffect(() => {
    const on = (row: BaseRecord) => {
      if (row.id === record.id) setCurrent(row);
    };
    app.rowListeners.add(on);
    return () => void app.rowListeners.delete(on);
  }, [app, record.id]);
  return <Component record={current} vaultId={vaultId} canEdit={canEdit} onOpen={onOpen} onNotice={onNotice} />;
}

/** Mount the card in the app. `mode`: "legacy" has no card mode above it (every group shown, always editing); "view" and "edit" put a card mode above. */
export function mountCard(
  app: App,
  record: BaseRecord,
  opts: { mode?: "legacy" | "view" | "edit"; as?: ComponentType<CardProps>; canEdit?: boolean; onNotice?: (n: string | null) => void; onOpen?: (id: string) => void; withHost?: boolean } = {},
) {
  const cardProps = { app, record, ...(opts.as ? { as: opts.as } : {}), ...(opts.canEdit !== undefined ? { canEdit: opts.canEdit } : {}), ...(opts.onNotice ? { onNotice: opts.onNotice } : {}), ...(opts.onOpen ? { onOpen: opts.onOpen } : {}) };
  return render(
    <app.Frame mode={opts.mode ?? "legacy"} withHost={opts.withHost ?? true}>
      <Card {...cardProps} />
    </app.Frame>,
  );
}
