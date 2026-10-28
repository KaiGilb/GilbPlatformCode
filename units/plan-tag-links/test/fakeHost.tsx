// A fake PlanTagLinksHost (and the plan-tag-picker host under it) for the tests. Every member logs its call, in order, in `calls`
// ("name json-arguments"); every answer is set from the test. Hosts are example.test.
import { vi } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanTagPickerHostContext, type PlanTagHit, type PlanTagPage, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import {
  PlanTagLinksHostContext,
  type PlanCreated,
  type PlanFindRead,
  type PlanLinkPatch,
  type PlanRelationsRead,
  type PlanTagLinksCreateDialogProps,
  type PlanTagLinksHost,
} from "../src/index";

export const VAULT = "https://p.example.test/vault";
export const uri = (id: string) => `https://h.example.test/base/e/${id}`;

export function row(id: string, tag: string, more: Partial<BaseRecord> = {}): BaseRecord {
  return { id, entityUri: uri(id), typeUri: "t:Function", facts: { unitTag: tag }, opaqueFacts: [], etag: '"e"', ...more };
}
export function gridRow(id: string, tag: string, more: Partial<BaseRecord> = {}): GridRecord {
  return { ...row(id, tag, more), updatedAt: 1 };
}
export function hit(id: string, tag: string, more: Partial<BaseRecord> = {}): PlanTagHit {
  return { uri: uri(id), label: tag, row: row(id, tag, more) };
}
export const page = (hits: PlanTagHit[] = [], complete = true): PlanTagPage => ({ hits, complete });

/** A relation row as the Solution lines read it. */
export function solutionRelation(relation: string, role: "role:source" | "role:target", other: string): RecordRelation {
  return {
    relation,
    role,
    type: "t:SolutionOf",
    members: [{ member: other, role: role === "role:source" ? "role:target" : "role:source" }],
  };
}

/** The label of a referenced record, by address: change it between renders to see a live label. */
export const labels: Record<string, string> = {};
const useRefLabel: UseRefLabel = (ref) => (ref ? (labels[ref.uri] ?? null) : null);

// The picker's query hook, with the real query library (the options the picker's own call used).
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const WRITERS = ["patchRecord", "createRecord", "useCreateRecord", "writePairRelation", "endRelation", "ConnectedCreateDialog"] as const;

export function makeHost(opts: { without?: readonly (typeof WRITERS)[number][] } = {}) {
  const calls: string[] = [];
  const log = (name: string, ...args: unknown[]) => calls.push(`${name} ${JSON.stringify(args)}`);
  const state = {
    pool: [] as GridRecord[] | undefined,
    relations: { isPending: false, isError: false, data: [] } as PlanRelationsRead,
    finds: {} as Record<string, PlanFindRead>,
    live: {} as Record<string, GridRecord>,
    types: { function: { id: "function" }, solution: { id: "solution" } } as Record<string, object | null>,
    records: {} as Record<string, BaseRecord | null>,
    cachedRelations: undefined as RecordRelation[] | undefined,
    nextEtag: '"e2"',
    dialogProps: [] as PlanTagLinksCreateDialogProps[],
  };
  const fn = {
    useRecords: vi.fn((_vaultId: string) => ({ data: state.pool })),
    useRelations: vi.fn((_id: string | null, _at: string | null) => state.relations),
    usePlanFind: vi.fn((_vault: string, attr: string, _parent: unknown): PlanFindRead => state.finds[attr] ?? { isError: false }),
    invalidatePlanFind: vi.fn((..._a: unknown[]) => {}),
    invalidatePlanSearch: vi.fn((_vault: string) => {}),
    ensureEtagUnchanged: vi.fn(async (_vault: string, r: GridRecord, _same: (fresh: GridRecord) => boolean) => ({ row: r }) as Awaited<ReturnType<PlanTagLinksHost["ensureEtagUnchanged"]>>),
    patchRecord: vi.fn(async (..._a: unknown[]) => ({ etag: state.nextEtag })),
    createRecord: vi.fn(async (_vault: string, _typeUri: string, _facts: unknown, _hint?: string): Promise<{ id: string; etag: string | null }> => ({ id: "made", etag: '"m1"' })),
    mutateAsync: vi.fn(
      async (_a: unknown): Promise<PlanCreated> => ({ id: "made", etag: '"m1"', entityUri: uri("made"), tempId: "" }),
    ),
    useCreateRecord: vi.fn((_vault: string) => ({ mutateAsync: (a: unknown) => fn.mutateAsync(a) })),
    writePairRelation: vi.fn(async (..._a: unknown[]): Promise<{ id: string; uri?: string | null }> => ({ id: "rel1", uri: "https://h.example.test/base/r/rel1" })),
    endRelation: vi.fn(async (..._a: unknown[]) => ({})),
    readRecord: vi.fn(async (id: string, _at: string | null) => state.records[id] ?? null),
    find: vi.fn(async (_vault: string, _text: string, _names: readonly string[]): Promise<PlanTagPage> => page()),
    tagUsed: vi.fn(async (_vault: string, _tag: string) => false),
    invalidateSearch: vi.fn((_key: readonly unknown[]) => {}),
  };

  const host: PlanTagLinksHost = {
    useRecords: (v) => fn.useRecords(v),
    useRelations: (id, at) => fn.useRelations(id, at),
    usePlanFind: (v, attr, parent) => fn.usePlanFind(v, attr, parent),
    invalidatePlanFind: (v, attr, parentId) => {
      log("invalidatePlanFind", v, attr, parentId);
      return fn.invalidatePlanFind(v, attr, parentId);
    },
    invalidatePlanSearch: (v) => {
      log("invalidatePlanSearch", v);
      fn.invalidatePlanSearch(v);
    },
    liveRow: (vaultId, id, fallback) => {
      log("liveRow", vaultId, id);
      return state.live[id] ?? { updatedAt: 1, ...fallback };
    },
    ensureEtagUnchanged: (v, r, same) => {
      log("ensureEtagUnchanged", v, r.id);
      return fn.ensureEtagUnchanged(v, r, same);
    },
    applyPatch: (r, patch: PlanLinkPatch, etag) => {
      log("applyPatch", r.id, patch, etag);
      const facts = { ...r.facts };
      for (const [slug, value] of Object.entries(patch)) {
        if (value === null) delete facts[slug];
        else facts[slug] = Array.isArray(value) ? value.map((x) => x["@id"]).join(", ") : value["@id"];
      }
      return { ...r, facts, etag };
    },
    storePlanRow: (v, r, o) => {
      log("storePlanRow", v, r.id, o);
    },
    setPlanRecord: (id, at, r) => {
      log("setPlanRecord", id, at, r.id);
    },
    dropPlanFind: (v, attr, parentId, id) => {
      log("dropPlanFind", v, attr, parentId, id);
    },
    prependPlanFind: (v, attr, parentId, r) => {
      log("prependPlanFind", v, attr, parentId, r.id);
    },
    putRecordInCaches: (v, r, o) => {
      log("putRecordInCaches", v, r.id, o);
    },
    getRelations: (id, at) => {
      log("getRelations", id, at);
      return state.cachedRelations;
    },
    setRelations: (id, at, next) => {
      log("setRelations", id, at, typeof next === "function" ? "updater" : next);
      if (typeof next === "function") state.cachedRelations = next(state.cachedRelations);
      else state.cachedRelations = next;
    },
    resolveType: (id) => state.types[id] ?? null,
    typeUriForVaultNamespace: (name, ns) => {
      log("typeUriForVaultNamespace", name, ns);
      return `t:${name}`;
    },
    memberEntityUri: (idOrUri, preferred, ns) => {
      log("memberEntityUri", idOrUri, preferred, ns);
      if (preferred?.startsWith("http")) return preferred;
      if (idOrUri.startsWith("http")) return idOrUri;
      return `${(ns ?? "").replace(/\/$/, "")}/e/${idOrUri}`;
    },
    readRecord: (id, at) => {
      log("readRecord", id, at);
      return fn.readRecord(id, at);
    },
    patchRecord: (id, patch, at, source, pre) => {
      log("patchRecord", id, patch, at, source, pre);
      return fn.patchRecord(id, patch, at, source, pre) as Promise<{ etag: string | null }>;
    },
    createRecord: (v, typeUri, facts, hint) => {
      log("createRecord", v, typeUri, facts, hint);
      return fn.createRecord(v, typeUri, facts, hint);
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
    ConnectedCreateDialog(props) {
      state.dialogProps.push(props);
      return (
        <div data-testid="create-dialog">
          <button onClick={props.onClose}>Close dialog</button>
          <button onClick={() => props.onCreated("new1")}>Created new1</button>
        </div>
      );
    },
  };
  for (const w of opts.without ?? []) delete (host as unknown as { [k: string]: unknown })[w];

  const pickerHost: PlanTagPickerHost = {
    findPlanRecords: (v, t, n) => fn.find(v, t, n),
    tagUsed: (v, t) => fn.tagUsed(v, t),
    invalidateSearch: (k) => fn.invalidateSearch(k),
  };
  /** The names of the members called, in order, without their arguments. */
  const names = () => calls.map((c) => c.split(" ")[0]!);
  return { host, pickerHost, calls, names, state, fn };
}

export function Frame({
  host,
  pickerHost,
  client,
  editing = true,
  canEdit = true,
  children,
}: {
  host: PlanTagLinksHost | null;
  pickerHost: PlanTagPickerHost;
  client: QueryClient;
  /** The card is in edit mode (false: presentation). */
  editing?: boolean;
  /** The card may be written at all. */
  canEdit?: boolean;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={pickerHost}>
            <PlanTagLinksHostContext.Provider value={host}>
              <CardModeProvider canEdit={canEdit} startEditing={editing}>
                {children}
              </CardModeProvider>
            </PlanTagLinksHostContext.Provider>
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
