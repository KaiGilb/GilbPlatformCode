// A fake PlanImpactsHost (with the plan-tag-picker host and the plan-source host under it) for the tests. Every member logs its
// call, in order, in `calls` ("name json-arguments"); every answer is set from the test. Hosts and people are example.test / Ann / Ben.
import { vi } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanTagPickerHostContext, type PlanTagHit, type PlanTagPage, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import {
  PlanImpactsHostContext,
  type PlanCreated,
  type PlanImpactsHost,
  type PlanRecordPages,
  type PlanRelationDocRead,
  type PlanRelationsRead,
} from "../src/index";

export const VAULT = "https://p.example.test/vault";
export const uri = (id: string) => `https://h.example.test/base/e/${id}`;
export const relUri = (id: string) => `https://h.example.test/base/r/${id}`;
export const ANN = uri("ann");

export function row(id: string, tag: string, more: Partial<BaseRecord> = {}): BaseRecord {
  return { id, entityUri: uri(id), typeUri: "t:Value", facts: { unitTag: tag }, opaqueFacts: [], etag: '"e"', ...more };
}
export function gridRow(id: string, tag: string, more: Partial<BaseRecord> = {}): GridRecord {
  return { ...row(id, tag, more), updatedAt: 1 };
}
export function hit(id: string, tag: string, more: Partial<BaseRecord> = {}): PlanTagHit {
  return { uri: uri(id), label: tag, row: row(id, tag, more) };
}
export const page = (hits: PlanTagHit[] = [], complete = true): PlanTagPage => ({ hits, complete });

/** The t:ImpactOn row a Solution's relations hold for one target. */
export function impactRelation(relation: string, target: string, role: "role:value" | "role:resource" = "role:value"): RecordRelation {
  return { relation, role: "role:solution", type: "t:ImpactOn", members: [{ member: uri(target), role }] };
}

/** The label of a referenced record, by address: change it between renders to see a live label. */
export const labels: Record<string, string> = {};
const useRefLabel: UseRefLabel = (ref) => (ref ? (labels[ref.uri] ?? null) : null);

const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const WRITERS = ["writePairRelation", "endRelation", "useCreateRecord"] as const;

export function makeHost(opts: { without?: readonly (typeof WRITERS)[number][] } = {}) {
  const calls: string[] = [];
  const log = (name: string, ...args: unknown[]) => calls.push(`${name} ${JSON.stringify(args)}`);
  const state = {
    pool: [] as GridRecord[] | undefined,
    relations: { isPending: false, isError: false, data: [] } as PlanRelationsRead,
    self: null as { "@id": string } | null,
    docs: {} as Record<string, PlanRelationDocRead>,
    types: { value: { id: "value" }, resource: { id: "resource" } } as Record<string, object | null>,
    pages: {} as Record<string, PlanRecordPages | undefined>,
    cachedRelations: undefined as RecordRelation[] | undefined,
  };
  const fn = {
    useRecords: vi.fn((_vaultId: string) => ({ data: state.pool })),
    useRelations: vi.fn((_id: string | null, _at: string | null) => state.relations),
    useSelfSource: vi.fn(() => state.self),
    useRelationDoc: vi.fn((relation: string, _vault: string): PlanRelationDocRead => state.docs[relation] ?? {}),
    resolveType: vi.fn((kind: string) => state.types[kind] ?? null),
    invalidatePlanSearch: vi.fn((_vault: string) => {}),
    mutateAsync: vi.fn(async (_a: unknown): Promise<PlanCreated> => ({ id: "made", etag: '"m1"', entityUri: uri("made"), tempId: "" })),
    useCreateRecord: vi.fn((_vault: string) => ({ mutateAsync: (a: unknown) => fn.mutateAsync(a) })),
    writePairRelation: vi.fn(async (..._a: unknown[]): Promise<{ id: string; uri?: string | null }> => ({ id: "rel-new", uri: relUri("rel-new") })),
    endRelation: vi.fn(async (..._a: unknown[]) => ({})),
    find: vi.fn(async (_vault: string, _text: string, _names: readonly string[]): Promise<PlanTagPage> => page()),
    tagUsed: vi.fn(async (_vault: string, _tag: string) => false),
    invalidateSearch: vi.fn((_key: readonly unknown[]) => {}),
    findStakeholders: vi.fn(async () => ({ hits: [], complete: true, vaultsMissed: false })),
  };

  const host: PlanImpactsHost = {
    useRecords: (v) => fn.useRecords(v),
    useRelations: (id, at) => fn.useRelations(id, at),
    useSelfSource: () => fn.useSelfSource(),
    useRelationDoc: (relation, v) => fn.useRelationDoc(relation, v),
    resolveType: (kind) => fn.resolveType(kind),
    invalidatePlanSearch: (v) => {
      log("invalidatePlanSearch", v);
      fn.invalidatePlanSearch(v);
    },
    getRecordPages: (v) => {
      log("getRecordPages", v);
      return state.pages[v];
    },
    setRecordPages: (v, pages) => {
      log("setRecordPages", v, pages);
      state.pages[v] = pages;
    },
    setRelations: (id, at, next) => {
      log("setRelations", id, at, typeof next === "function" ? "updater" : next);
      state.cachedRelations = typeof next === "function" ? next(state.cachedRelations) : next;
    },
    useCreateRecord: (v) => {
      const made = fn.useCreateRecord(v);
      return {
        mutateAsync: (a) => {
          log("mutateAsync", a);
          return made.mutateAsync(a);
        },
      };
    },
    writePairRelation: (input) => {
      log("writePairRelation", input);
      return fn.writePairRelation(input);
    },
    endRelation: (relation, v) => {
      log("endRelation", relation, v);
      return fn.endRelation(relation, v);
    },
  };
  for (const w of opts.without ?? []) delete (host as unknown as { [k: string]: unknown })[w];

  const pickerHost: PlanTagPickerHost = {
    findPlanRecords: (v, t, n) => fn.find(v, t, n),
    tagUsed: (v, t) => fn.tagUsed(v, t),
    invalidateSearch: (k) => fn.invalidateSearch(k),
  };
  const sourceHost: PlanSourceHost = {
    useShell: () => ({ vaults: [] }),
    heldVaultIds: () => [VAULT],
    useStakeholderTypes: () => ({ data: { names: ["Person"] } }),
    useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
    matchWorkingSetQuery: () => [],
    findStakeholderRecords: () => fn.findStakeholders(),
    readRecord: async () => null,
    memberEntityUri: (id) => `${VAULT}/e/${id}`,
    ConnectedCreateDialog: () => null,
  };
  const names = () => calls.map((c) => c.split(" ")[0]!);
  return { host, pickerHost, sourceHost, calls, names, state, fn };
}

export function Frame({
  host,
  pickerHost,
  sourceHost,
  client,
  editing = true,
  canEdit = true,
  children,
}: {
  host: PlanImpactsHost | null;
  pickerHost: PlanTagPickerHost;
  sourceHost: PlanSourceHost;
  client: QueryClient;
  editing?: boolean;
  canEdit?: boolean;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={pickerHost}>
            <PlanSourceHostContext.Provider value={sourceHost}>
              <PlanImpactsHostContext.Provider value={host}>
                <CardModeProvider canEdit={canEdit} startEditing={editing}>
                  {children}
                </CardModeProvider>
              </PlanImpactsHostContext.Provider>
            </PlanSourceHostContext.Provider>
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
