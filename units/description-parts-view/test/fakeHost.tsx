// A fake host for the tests: an in-memory vault (the truth), the app's caches (lists, finds), a log of every call the view makes in
// order, counters for the find re-reads, prepends and drops, and holds that let a test keep a write open. The hosts and people are
// example.test / Dr Ames.
import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { asGrid } from "@kaigilb/gilbplatformcode-description-parts-model";
import {
  DescriptionPartsHostContext,
  PlanDescriptionParts,
  type DescriptionPartsHost,
  type PlanFind,
  type PlanFindQuery,
} from "../src/index";

export const SCREEN = "https://v.example.test/base";
export const PLAN_VAULT = "https://pv.example.test/base";
export const SOL_ID = "sol1";
export const SOL_URI = `${PLAN_VAULT}/e/${SOL_ID}`;
export const uriOf = (id: string) => `${PLAN_VAULT}/e/${id}`;
export const ELEMENT_TYPE = `${PLAN_VAULT}/t/SpecificationElement`;
export const ASSUMPTION_TYPE = `${PLAN_VAULT}/t/Assumption`;
export const AMES = "https://h.example.test/base/e/ames";

export type Call = { fn: string; args: unknown[] };

/** The 412-class error the fake's patch raises when the version sent is not the version held. */
export class FakeConflict extends Error {
  readonly status = 412;
  constructor() {
    super("version conflict");
  }
}

export function solution(more: Partial<GridRecord> = {}): GridRecord {
  return {
    id: SOL_ID,
    entityUri: SOL_URI,
    typeUri: `${PLAN_VAULT}/t/Solution`,
    facts: { unitTag: "Sol" },
    opaqueFacts: [],
    etag: '"s1"',
    updatedAt: 1,
    servedKeys: ["unitTag"],
    served: { facts: { unitTag: "Sol" }, context: null, etag: '"s1"' },
    ...more,
  };
}

export function part(
  id: string,
  tag: string,
  parent: string,
  order: number,
  body = "",
  more: { type?: string; sources?: unknown; etag?: string | null } = {},
): GridRecord {
  const parentUri = uriOf(parent);
  const facts: Record<string, string> = { unitTag: tag, partOf: parentUri, elementOrder: String(order) };
  const served: Record<string, unknown> = { unitTag: tag, partOf: { "@id": parentUri }, elementOrder: order };
  if (body) {
    facts.body = body;
    served.body = body;
  }
  if (more.sources) served.lineSources = more.sources;
  const etag = more.etag === undefined ? `"${id}-1"` : more.etag;
  return {
    id,
    entityUri: uriOf(id),
    typeUri: more.type ?? ELEMENT_TYPE,
    facts,
    opaqueFacts: [],
    etag,
    updatedAt: 1,
    servedKeys: Object.keys(served),
    served: { facts: served, context: null, etag },
  };
}

/** Sol -> Bones (1) -> Hip (1), Knee (2); Sol -> Feet (2). */
export function bonesFixture(): GridRecord[] {
  return [
    part("bones", "Sol.Bones", SOL_ID, 1, "The leg has 26 bones."),
    part("hip", "Sol.Bones.Hip", "bones", 1, "The hip carries the weight."),
    part("knee", "Sol.Bones.Knee", "bones", 2, "The knee bends one way."),
    part("feet", "Sol.Feet", SOL_ID, 2, "The feet touch the ground."),
  ];
}

export type Deferred = { promise: Promise<void>; release: () => void };
function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

export type WorldOptions = {
  parts?: GridRecord[];
  record?: GridRecord;
  self?: { "@id": string } | null;
  /** Leave out every writer. */
  readOnly?: boolean;
  /** Leave out one writer. */
  without?: ("createRecord" | "patchRecord" | "useDeleteRecord")[];
};

export function makeWorld(options: WorldOptions = {}) {
  const record = options.record ?? solution();
  const server = new Map<string, GridRecord>();
  for (const r of [record, ...(options.parts ?? [])]) server.set(r.id, structuredClone(r));
  const lists = new Map<string, GridRecord[]>();
  const finds = new Map<string, PlanFind>();
  const calls: Call[] = [];
  const counts = { reRead: 0, prepend: 0, drop: 0, searchInvalidated: 0, serverReads: 0 };
  const holds = new Map<string, Deferred>();
  const failures = new Map<string, { at: number; error: Error }[]>();
  const tries = new Map<string, number>();
  const levelShown = new Map<string, number>();
  let version = 0;
  let seq = 0;
  const listeners = new Set<() => void>();
  // Hooks are told at once, or (lazyNotify) on the next timer tick, the way a query library tells its observers: a render then
  // does not fall between two queued jobs.
  let lazy = false;
  let flushing = false;
  const flush = () => {
    flushing = false;
    version += 1;
    for (const l of [...listeners]) l();
  };
  const bump = () => {
    if (!lazy) return flush();
    if (flushing) return;
    flushing = true;
    setTimeout(flush, 0);
  };
  const log = (fn: string, ...args: unknown[]) => calls.push({ fn, args });
  const key = (vault: string, attr: string, id: string) => `${vault}|${attr}|${id}`;

  const childrenOf = (parentId: string): GridRecord[] => {
    const uri = server.get(parentId)?.entityUri;
    return [...server.values()].filter((r) => r.id !== parentId && (r.served?.facts.partOf as { "@id"?: string } | undefined)?.["@id"] === uri);
  };
  const readFind = (parentId: string): PlanFind => {
    const all = childrenOf(parentId).map((r) => structuredClone(r));
    const shown = levelShown.get(parentId);
    if (shown !== undefined && all.length > shown) return { rows: all.slice(0, shown), total: all.length, capped: true, unread: 0, cap: shown };
    return { rows: all, total: all.length, capped: false, unread: 0 };
  };
  // The app has already read every level once.
  const seedAll = () => {
    for (const r of server.values()) finds.set(key(PLAN_VAULT, "a:partOf", r.id), readFind(r.id));
    lists.set(PLAN_VAULT, [...server.values()].map((r) => structuredClone(r)));
  };
  seedAll();

  const waitHold = async (name: string) => {
    const h = holds.get(name);
    if (h) await h.promise;
  };
  const maybeFail = (name: string) => {
    const n = (tries.get(name) ?? 0) + 1;
    tries.set(name, n);
    const hit = failures.get(name)?.find((f) => f.at === n);
    if (hit) throw hit.error;
  };

  const rereadFind = (vault: string, attr: string, parentId: string) => {
    counts.reRead += 1;
    counts.serverReads += 1;
    finds.set(key(vault, attr, parentId), readFind(parentId));
    bump();
  };

  const replaceInLists = (vault: string, row: GridRecord, insert: boolean) => {
    const list = lists.get(vault) ?? [];
    const i = list.findIndex((r) => r.id === row.id);
    if (i >= 0) list[i] = row;
    else if (insert) list.push(row);
    lists.set(vault, list);
  };

  const readServer = (id: string): GridRecord | null => {
    counts.serverReads += 1;
    const r = server.get(id);
    return r ? structuredClone(r) : null;
  };

  const tagUsed = (tag: string) => [...server.values()].some((r) => r.facts.unitTag === tag);

  const useVersion = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => version);

  const state = { self: options.self ?? null };
  const errors = new Set<string>();
  const querySlot = (data: PlanFind | undefined, id: string): PlanFindQuery => {
    if (errors.has(id)) return { data, status: "error", isLoading: false, isError: true, isPending: false, isSuccess: false };
    return { data, status: data ? "success" : "pending", isLoading: !data, isError: false, isPending: !data, isSuccess: !!data };
  };

  const world = {
    record,
    server,
    lists,
    finds,
    calls,
    counts,
    holds,
    failures,
    levelShown,
    errors,
    /** Tell the hooks on the next timer tick instead of at once. */
    lazyNotify(on: boolean) {
      lazy = on;
    },
    setSelf(next: { "@id": string } | null) {
      state.self = next;
      bump();
    },
    names: () => calls.map((c) => c.fn),
    callsOf: (fn: string) => calls.filter((c) => c.fn === fn),
    clearCalls: () => {
      calls.length = 0;
    },
    /** Keep a writer open until `release()`. */
    hold(fn: string): Deferred {
      const d = deferred();
      holds.set(fn, d);
      return d;
    },
    /** The next call of `fn` throws `error`. */
    failNext(fn: string, error: Error) {
      failures.set(fn, [...(failures.get(fn) ?? []), { at: (tries.get(fn) ?? 0) + 1, error }]);
    },
    /** The nth call of `fn` from now throws `error` (1 is the next call). */
    failNth(fn: string, n: number, error: Error) {
      failures.set(fn, [...(failures.get(fn) ?? []), { at: (tries.get(fn) ?? 0) + n, error }]);
    },
    /** A level shows only its first `n` rows and says it was cut. */
    cutLevel(parentId: string, n: number) {
      levelShown.set(parentId, n);
      finds.set(key(PLAN_VAULT, "a:partOf", parentId), readFind(parentId));
      bump();
    },
    /** Change the vault behind the app's back. */
    serverPatch(id: string, facts: Record<string, string>, served: Record<string, unknown>, etag: string) {
      const r = server.get(id)!;
      server.set(id, { ...r, facts: { ...r.facts, ...facts }, etag, served: { ...r.served!, facts: { ...r.served!.facts, ...served }, etag } });
    },
    bump,
    /** The app's copies (lists and finds) hold this ETag for a record, while the vault keeps its own. */
    setClientEtag(id: string, etag: string | null) {
      const put = (r: GridRecord) => (r.id === id ? { ...r, etag, served: { ...r.served!, etag } } : r);
      for (const [v, list] of lists) lists.set(v, list.map(put));
      for (const [k, f] of finds) finds.set(k, { ...f, rows: f.rows.map((r) => put(r as GridRecord)) });
      bump();
    },
    orderOf(id: string): number {
      return Number(server.get(id)!.facts.elementOrder);
    },
    parentOf(id: string): string | undefined {
      return (server.get(id)!.served!.facts.partOf as { "@id": string })["@id"];
    },
    tags: () => [...server.values()].filter((r) => r.id !== SOL_ID).map((r) => r.facts.unitTag),
    HelpButtonOpened: 0,
  };

  const writers: Partial<DescriptionPartsHost> = {
    async createRecord(vault, typeUri, facts, nameHint) {
      log("createRecord", vault, typeUri, facts, nameHint);
      await waitHold("createRecord");
      maybeFail("createRecord");
      const tag = String(facts.unitTag);
      if (tagUsed(tag)) throw Object.assign(new Error("tag taken"), { status: 409, tag });
      seq += 1;
      const id = `new${seq}`;
      const parentUri = (facts.partOf as { "@id": string })["@id"];
      const servedFacts: Record<string, unknown> = { ...facts };
      const flat: Record<string, string> = { unitTag: tag, partOf: parentUri, elementOrder: String(facts.elementOrder) };
      if (facts.body) flat.body = String(facts.body);
      const etag = `"${id}-1"`;
      server.set(id, {
        id,
        entityUri: uriOf(id),
        typeUri,
        facts: flat,
        opaqueFacts: [],
        etag,
        updatedAt: 1,
        servedKeys: Object.keys(servedFacts),
        served: { facts: servedFacts, context: null, etag },
      });
      return { id, etag };
    },
    async patchRecord(id, patch, at, source, precondition) {
      log("patchRecord", id, patch, at, source, precondition);
      await waitHold("patchRecord");
      maybeFail("patchRecord");
      const row = server.get(id);
      if (!row) throw new Error("gone");
      if (precondition?.ifMatch && precondition.ifMatch !== row.etag) throw new FakeConflict();
      const facts = { ...row.facts };
      const served = { ...row.served!.facts };
      for (const [slug, value] of Object.entries(patch)) {
        if (value === null) {
          delete facts[slug];
          delete served[slug];
        } else {
          served[slug] = value;
          facts[slug] = typeof value === "object" ? String((value as { "@id"?: string })["@id"] ?? "") : String(value);
        }
      }
      const etag = `"${id}-${Number(String(row.etag).split("-")[1]?.replace('"', "") ?? 1) + 1}"`;
      server.set(id, { ...row, facts, etag, served: { ...row.served!, facts: served, etag } });
      return { etag };
    },
    useDeleteRecord() {
      return useMemo(
        () => ({
          async mutateAsync(vars: { id: string; entityUri: string | null | undefined }) {
            log("deleteRecord", vars);
            await waitHold("deleteRecord");
            maybeFail("deleteRecord");
            server.delete(vars.id);
            lists.set(PLAN_VAULT, (lists.get(PLAN_VAULT) ?? []).filter((r) => r.id !== vars.id));
          },
        }),
        [],
      );
    },
  };
  for (const name of ["createRecord", "patchRecord", "useDeleteRecord"] as const) {
    if (options.readOnly || options.without?.includes(name)) delete writers[name];
  }

  const host: DescriptionPartsHost = {
    ...(writers as Pick<DescriptionPartsHost, "createRecord" | "patchRecord" | "useDeleteRecord">),
    useRecords(vault) {
      useVersion();
      log("useRecords", vault);
      const data = lists.get(vault);
      return useMemo(() => ({ data: data ? [...data] : undefined }), [data, version]); // eslint-disable-line react-hooks/exhaustive-deps
    },
    usePlanFind(vault, attr, parent, cap) {
      useVersion();
      log("usePlanFind", vault, attr, parent?.id ?? null, cap);
      const data = parent ? finds.get(key(vault, attr, parent.id)) : undefined;
      const failed = errors.has(parent?.id ?? "");
      return useMemo(() => querySlot(data, parent?.id ?? ""), [data, failed]); // eslint-disable-line react-hooks/exhaustive-deps
    },
    useSubFinds(vault, attr, parents) {
      useVersion();
      log("useSubFinds", vault, attr, parents.map((p) => p.id));
      const datas = parents.map((p) => finds.get(key(vault, attr, p.id)));
      const ids = parents.map((p) => p.id);
      const failed = ids.map((id) => errors.has(id)).join("|");
      const held = useRef<{ ids: string[]; datas: (PlanFind | undefined)[]; failed: string; out: PlanFindQuery[] } | null>(null);
      const same =
        held.current &&
        held.current.failed === failed &&
        held.current.ids.length === ids.length &&
        ids.every((id, i) => id === held.current!.ids[i]) &&
        datas.every((d, i) => d === held.current!.datas[i]);
      if (!same) held.current = { ids, datas, failed, out: datas.map((d, i) => querySlot(d, ids[i]!)) };
      return held.current!.out;
    },
    useSelfSource() {
      useVersion();
      return state.self;
    },
    cachedRecords(vault) {
      log("cachedRecords", vault);
      return [...(lists.get(vault) ?? [])];
    },
    getFind(vault, attr, id) {
      log("getFind", vault, attr, id);
      return finds.get(key(vault, attr, id));
    },
    getFinds(vault) {
      log("getFinds", vault);
      return [...finds.entries()].filter(([k]) => k.startsWith(`${vault}|`)).map(([, v]) => v);
    },
    liveRow(vault, id, fallback) {
      log("liveRow", vault, id);
      // The app's list for that vault, else its record read (the record in any list it holds), else the row the caller has.
      const hit = (lists.get(vault) ?? []).find((r) => r.id === id) ?? [...lists.values()].flat().find((r) => r.id === id);
      return hit ? structuredClone(hit) : asGrid(fallback);
    },
    async readRecord(id, at) {
      log("readRecord", id, at);
      return readServer(id);
    },
    async tagUsedInVault(vault, tag) {
      log("tagUsedInVault", vault, tag);
      maybeFail("tagUsedInVault");
      return tagUsed(tag);
    },
    async ensureEtagUnchanged(vault, row, sameFor) {
      log("ensureEtagUnchanged", vault, row.id, row.etag);
      if (row.etag) return { row };
      const fresh = readServer(row.id);
      if (!fresh?.etag) return { unreadable: true };
      if (!sameFor(fresh)) return { conflict: true };
      return { row: fresh };
    },
    async reconcileAfterConflict(vault, row) {
      log("reconcileAfterConflict", vault, row.id);
      const fresh = readServer(row.id);
      if (fresh) replaceInLists(vault, fresh, false);
      return fresh;
    },
    isConflict: (e) => e instanceof FakeConflict,
    typeUriForVaultNamespace(name, vault) {
      log("typeUriForVaultNamespace", name, vault);
      return `${PLAN_VAULT}/t/${name}`;
    },
    storePlanRow(vault, row, opts) {
      log("storePlanRow", vault, row.id, opts);
      replaceInLists(vault, row as GridRecord, !!opts?.insert);
      bump();
    },
    setRecordRead(id, at, row) {
      log("setRecordRead", id, at);
      void row;
    },
    invalidatePlanSearch(vault) {
      log("invalidatePlanSearch", vault);
      counts.searchInvalidated += 1;
    },
    prependPlanFind(vault, attr, parentId, row, opts) {
      log("prependPlanFind", vault, attr, parentId, row.id, opts);
      counts.prepend += 1;
      const k = key(vault, attr, parentId);
      const cur = finds.get(k) ?? { rows: [], total: 0, capped: false, unread: 0 };
      finds.set(k, { ...cur, rows: [row, ...cur.rows.filter((r) => r.id !== row.id)] });
      bump();
      if (opts?.refresh !== false) rereadFind(vault, attr, parentId);
    },
    dropPlanFind(vault, attr, parentId, id, opts) {
      log("dropPlanFind", vault, attr, parentId, id, opts);
      counts.drop += 1;
      const k = key(vault, attr, parentId);
      const cur = finds.get(k);
      if (cur) finds.set(k, { ...cur, rows: cur.rows.filter((r) => r.id !== id) });
      bump();
      if (opts?.refresh !== false) rereadFind(vault, attr, parentId);
    },
    patchPlanFindRows(vault, id, next) {
      log("patchPlanFindRows", vault, id);
      for (const [k, v] of finds) {
        if (!k.startsWith(`${vault}|`) || !v.rows.some((r) => r.id === id)) continue;
        finds.set(k, { ...v, rows: v.rows.map((r) => (r.id === id ? next(r) : r)) });
      }
      bump();
    },
    async invalidatePlanFind(vault, attr, parentId, opts) {
      log("invalidatePlanFind", vault, attr, parentId, opts);
      rereadFind(vault, attr, parentId);
    },
    setFind(vault, attr, id, value) {
      log("setFind", vault, attr, id);
      finds.set(key(vault, attr, id), value);
      bump();
    },
    async rememberRecord(ref) {
      log("rememberRecord", ref.id, ref.vaultId, ref.typeUri);
    },
    markFreshlyCreated(id) {
      log("markFreshlyCreated", id);
    },
    // ---- LevelHost ----
    async pageChildIds(vault, parentUri, opts) {
      log("pageChildIds", vault, parentUri, opts);
      maybeFail("pageChildIds");
      const owner = [...server.values()].find((r) => r.entityUri === parentUri);
      const kids = owner ? childrenOf(owner.id) : [];
      counts.serverReads += 1;
      if (kids.length > opts.cap) return { ids: kids.slice(0, opts.cap).map((r) => r.entityUri!), count: opts.cap, capped: true };
      return { ids: kids.map((r) => r.entityUri!), count: kids.length, capped: false };
    },
    async markStale(entityUri) {
      log("markStale", entityUri);
    },
    async readMember(entityUri, fresh) {
      log("readMember", entityUri, fresh);
      const id = [...server.values()].find((r) => r.entityUri === entityUri)?.id;
      if (!id) return null;
      if (fresh) return readServer(id);
      for (const f of finds.values()) {
        const hit = f.rows.find((r) => r.id === id);
        if (hit) return structuredClone(hit);
      }
      return readServer(id);
    },
    applyPinsAndDrops(vault, attr, parentId, rows) {
      log("applyPinsAndDrops", vault, attr, parentId);
      return rows;
    },
    HelpButton({ label, title, startAt, children }) {
      const [open, setOpen] = useState(false);
      return createElement(
        "span",
        null,
        createElement("button", { type: "button", "aria-label": label, "data-help-button": "", "data-start-at": startAt, onClick: () => setOpen(true) }, "?"),
        open ? createElement("div", { role: "dialog", "aria-label": title }, children) : null,
      );
    },
  };
  return { world, host };
}

export type World = ReturnType<typeof makeWorld>["world"];

// The picker's query hook: runs the search once for each key and keeps the answer (no query library).
const usePickerQuery: UsePickerQuery = (({ key, run, enabled }: { key: readonly unknown[]; run: () => Promise<unknown>; enabled: boolean }) => {
  const k = JSON.stringify(key);
  const [state, setState] = useState<{ k: string; data?: unknown; error?: boolean }>({ k: "" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    run().then(
      (data) => live && setState({ k, data }),
      () => live && setState({ k, error: true }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, enabled]);
  const mine = state.k === k ? state : undefined;
  return { data: mine?.data, isFetching: !!enabled && !mine, isError: !!mine?.error, isSuccess: !!mine && !mine.error };
}) as unknown as UsePickerQuery;
const useRefLabel: UseRefLabel = (ref) => (ref && ref.uri === AMES ? "Dr Ames" : null);

const planSourceHost: PlanSourceHost = {
  useShell: () => ({ vaults: [] }),
  heldVaultIds: () => [],
  useStakeholderTypes: () => ({ data: { names: ["Person"] } }),
  useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
  matchWorkingSetQuery: () => [],
  findStakeholderRecords: async () => ({ hits: [], complete: true, vaultsMissed: false }),
  readRecord: async () => null,
  memberEntityUri: (idOrUri) => idOrUri,
  ConnectedCreateDialog: () => null,
};

export type ViewProps = {
  record?: BaseRecord;
  vaultId?: string;
  planVault?: string;
  canEdit?: boolean;
  onOpen?: (id: string) => void;
  onNotice?: (n: string | null) => void;
  onBindAdd?: (open: () => void) => void;
};

/** The view inside the contexts it needs. `editing` starts the card in Edit. */
export function Frame({
  host,
  world,
  editing = true,
  children,
  ...props
}: ViewProps & { host: DescriptionPartsHost | null; world: World; editing?: boolean; children?: ReactNode }) {
  const view = createElement(PlanDescriptionParts, {
    record: props.record ?? world.record,
    vaultId: props.vaultId ?? SCREEN,
    planVault: props.planVault ?? PLAN_VAULT,
    canEdit: props.canEdit ?? true,
    onOpen: props.onOpen ?? (() => {}),
    onNotice: props.onNotice ?? (() => {}),
    onBindAdd: props.onBindAdd ?? (() => {}),
  });
  return (
    <PickerQueryContext.Provider value={usePickerQuery}>
      <RefLabelContext.Provider value={useRefLabel}>
        <PlanSourceHostContext.Provider value={planSourceHost}>
          <DescriptionPartsHostContext.Provider value={host}>
            <CardModeProvider canEdit={props.canEdit ?? true} startEditing={editing}>
              {/* The card group's section: an open text keeps its editor when focus moves to the source box inside it. */}
              <section>
                {view}
                {children}
              </section>
            </CardModeProvider>
          </DescriptionPartsHostContext.Provider>
        </PlanSourceHostContext.Provider>
      </RefLabelContext.Provider>
    </PickerQueryContext.Provider>
  );
}

/** Let queued promises and timers run. */
export const settle = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

/** The calls of the listed members, in the order they were made, as "name arg arg" lines with the plan vault shortened to PV. */
export function sequence(world: World, names: string[]): string[] {
  return world.calls
    .filter((c) => names.includes(c.fn))
    .map((c) => `${c.fn} ${c.args.map((a) => (a === undefined ? "undefined" : JSON.stringify(a))).join(" ")}`.replace(new RegExp(PLAN_VAULT.replace(/[/.]/g, "\\$&"), "g"), "PV"));
}
