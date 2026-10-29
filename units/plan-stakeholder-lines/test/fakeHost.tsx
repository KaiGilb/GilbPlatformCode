// A fake host for the tests: in-memory relations and rows, a log of every click-time getter and writer call, and the two
// contexts the units beside this one need (the record name hook, the picker's query hook).

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext, type OrgRecordHit, type PickerFind, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { RelationDoc, StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { StakeholderLinesHostContext, type StakeholderLinesHost } from "../src/index";

export const VAULT = "https://v.example.test/base";
export const PLAN_VAULT = "https://pv.example.test/base";
export const REC_ID = "plan1";
export const REC_URI = "https://pv.example.test/base/e/plan1";
export const uriOf = (id: string) => `https://h.example.test/base/e/${id}`;
export const relUri = (n: string | number) => `https://pv.example.test/base/r/${n}`;

export const KINDS: StakeholderTypeSet = { names: ["Person", "Organization"], complete: true, types: [] };

export type Call = { fn: string; args: unknown[] };

export function planRecord(more: Partial<BaseRecord> & { served?: BaseRecord["served"] } = {}): BaseRecord {
  return {
    id: REC_ID,
    entityUri: REC_URI,
    typeUri: "https://pv.example.test/base/t/Function",
    facts: {},
    opaqueFacts: [],
    etag: '"e1"',
    ...more,
  };
}

export function served(facts: Record<string, unknown>): BaseRecord["served"] {
  return { facts, context: null, etag: '"e1"' };
}

export function link(type: "t:StakeholderOf" | "t:AuthorityOf" | "t:ResourceOwnerOf", relation: string, member: string): RecordRelation {
  return {
    relation,
    role: "role:referenced-by",
    type,
    members: [{ member, role: "role:stakeholder" }],
  };
}

export function person(id: string, label: string, more: Partial<BaseRecord> = {}): BaseRecord {
  return {
    id,
    entityUri: uriOf(id),
    typeUri: "https://h.example.test/base/t/Person",
    facts: { label },
    opaqueFacts: [],
    etag: null,
    ...more,
  };
}

export function hit(id: string, label: string, typeName: string | undefined = "Person"): OrgRecordHit {
  return { uri: uriOf(id), label, ...(typeName ? { typeName } : {}) };
}

export type FakeOptions = {
  relations?: RecordRelation[];
  relationsError?: boolean;
  records?: BaseRecord[];
  /** Searched hits for findStakeholders. */
  hits?: OrgRecordHit[];
  anyHits?: OrgRecordHit[];
  kinds?: StakeholderTypeSet | undefined;
  heldVaults?: string[];
  row?: Partial<GridRecord>;
  /** Leave out every writer. */
  readOnly?: boolean;
  /** Relation documents by relation address, read for "acts for". */
  docs?: Record<string, Partial<RelationDoc> & { uri: string }>;
  people?: { uri: string }[];
  substituted?: boolean;
  openInVault?: StakeholderLinesHost["useOpenRecordInVault"] extends () => infer R ? R : never;
  recordRead?: BaseRecord | null;
  /** What the host's `useMainTag` answers, by record address; a record not here is pending (no `data`). */
  mainTags?: Record<string, { known: boolean; tag: string | null }>;
  /** Override or add any member. */
  over?: Partial<StakeholderLinesHost>;
};

export function makeFake(o: FakeOptions = {}) {
  const log: Call[] = [];
  const pickerKeys: (readonly unknown[])[] = [];
  const store = new Map<string, RecordRelation[]>();
  const subs = new Set<() => void>();
  let version = 0;
  const key = (id: string, uri: string | null) => `${id}|${uri ?? ""}`;
  const k0 = key(REC_ID, REC_URI);
  if (o.relations) store.set(k0, o.relations);
  const bump = () => {
    version += 1;
    subs.forEach((f) => f());
  };
  let n = 0;
  const L = <A extends unknown[], R>(fn: string, f: (...a: A) => R) => (...a: A): R => {
    log.push({ fn, args: a });
    return f(...a);
  };
  const records = o.records ?? [];
  const kinds = "kinds" in o ? o.kinds : KINDS;

  const host: StakeholderLinesHost = {
    useRecords: () => ({ data: records }),
    useRecordRead: () => ({ data: o.recordRead }),
    useMainTag: L("useMainTag", (uri: string | null | undefined) => ({ data: uri ? o.mainTags?.[uri] : undefined })),
    useRelations: (id, uri) => {
      useSyncExternalStore(
        (f) => {
          subs.add(f);
          return () => subs.delete(f);
        },
        () => version,
      );
      return { data: store.get(key(id, uri)), isError: !!o.relationsError };
    },
    useStakeholderKinds: () => ({ data: kinds }),
    usePersonAuthorities: () => ({ people: o.people ?? [] }),
    useHeldVaults: () => heldVaults,
    useOpenRecordInVault: () => o.openInVault,
    useRelationDoc: (relation) => {
      const d = relation ? o.docs?.[relation] : undefined;
      return { data: d ? { id: "r", typeCurie: null, sourceUri: null, targetUri: null, extras: {}, ...d } : null };
    },
    hasSubstitutedType: L("hasSubstitutedType", () => !!o.substituted),
    getRelations: L("getRelations", (id: string, uri: string | null) => store.get(key(id, uri))),
    getKindSet: L("getKindSet", () => kinds),
    liveRow: L("liveRow", (_pv: string, id: string, fallback: BaseRecord) => ({ ...fallback, updatedAt: 1, ...(id === REC_ID ? o.row : {}) }) as GridRecord),
    readRecord: L("readRecord", async (id: string) => records.find((r) => r.id === id) ?? null),
    memberEntityUri: L("memberEntityUri", (id: string, preferred?: string | null, ns?: string | null) =>
      preferred?.startsWith("http") ? preferred : id.startsWith("http") ? id : `${(ns ?? "").replace(/\/$/, "")}/e/${id}`,
    ),
    findStakeholders: L("findStakeholders", async () => ({ hits: o.hits ?? [], complete: true, vaultsMissed: false })),
    findAnyRecords: L("findAnyRecords", async () => ({ hits: o.anyHits ?? [], complete: true, vaultsMissed: false })),
    ensureEtagUnchanged: L("ensureEtagUnchanged", async (_pv: string, row: GridRecord) => ({ row })),
    applyPatch: L("applyPatch", (row: GridRecord, patch: Record<string, unknown>, etag: string | null) => ({ ...row, etag, facts: { ...row.facts, patched: JSON.stringify(patch) } }) as GridRecord),
    storePlanRow: L("storePlanRow", () => {}),
    setRecordRead: L("setRecordRead", () => {}),
    setRelations: L("setRelations", (id: string, uri: string | null, next: RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[])) => {
      const k = key(id, uri);
      store.set(k, typeof next === "function" ? next(store.get(k)) : next);
      bump();
    }),
    invalidateSearch: L("invalidateSearch", () => {}),
    ...(o.readOnly
      ? {}
      : {
          writePairRelation: L("writePairRelation", async () => {
            n += 1;
            return { id: `r${n}`, uri: relUri(`w${n}`) };
          }),
          endRelation: L("endRelation", async () => undefined),
          patchRecord: L("patchRecord", async () => ({ etag: '"e2"' })),
          writeAuthorityRelation: L("writeAuthorityRelation", async (input) => {
            n += 1;
            return {
              relation: relUri(`a${n}`),
              role: "role:referenced-by",
              type: input.relationType ?? "t:AuthorityOf",
              members: [{ member: input.stakeholderUri, role: "role:stakeholder" }],
            } satisfies RecordRelation;
          }),
          endThenWriteAuthority: L("endThenWriteAuthority", async (endId: string, input) => {
            n += 1;
            return {
              relation: relUri(`a${n}`),
              role: "role:referenced-by",
              type: input.relationType ?? "t:AuthorityOf",
              members: [{ member: input.stakeholderUri, role: "role:stakeholder" }],
            } satisfies RecordRelation;
          }),
          renderCreateStakeholder: L("renderCreateStakeholder", (p) => (
            <div data-testid="create-dialog">
              <button type="button" onClick={p.onClose}>
                close dialog
              </button>
              <button type="button" onClick={() => p.onCreated("new1")}>
                created id
              </button>
              <button type="button" onClick={() => p.onCreated(uriOf("new2"))}>
                created address
              </button>
            </div>
          )),
        }),
    ...Object.fromEntries(Object.entries(o.over ?? {}).map(([k, v]) => [k, typeof v === "function" ? L(k, v as (...a: unknown[]) => unknown) : v])),
  };
  const heldVaults = o.heldVaults ?? ["v1", "v2"];

  const calls = (fn: string) => log.filter((c) => c.fn === fn);
  const relationsNow = () => store.get(k0);

  const usePickerQuery: UsePickerQuery = ({ key: pk, run, enabled }) => {
    pickerKeys.push(pk);
    const id = JSON.stringify(pk);
    const [state, setState] = useState<{ id: string; data?: PickerFind; error?: boolean }>({ id: "" });
    useEffect(() => {
      if (!enabled) return;
      let live = true;
      run().then(
        (data) => live && setState({ id, data }),
        () => live && setState({ id, error: true }),
      );
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, enabled]);
    const mine = state.id === id ? state : { id };
    return { data: mine.data, isFetching: enabled && !mine.data && !mine.error, isError: !!mine.error, isSuccess: !!mine.data };
  };
  const useLabel = (ref: { id: string; uri: string } | null) =>
    ref ? (records.find((r) => r.id === ref.id || r.entityUri === ref.uri)?.facts.label ?? ref.id) : null;

  function Frame({ children }: { children: ReactNode }) {
    return (
      <StakeholderLinesHostContext.Provider value={host}>
        <RefLabelContext.Provider value={useLabel}>
          <PickerQueryContext.Provider value={usePickerQuery}>{children}</PickerQueryContext.Provider>
        </RefLabelContext.Provider>
      </StakeholderLinesHostContext.Provider>
    );
  }

  return { host, log, calls, pickerKeys, relationsNow, Frame, store };
}
