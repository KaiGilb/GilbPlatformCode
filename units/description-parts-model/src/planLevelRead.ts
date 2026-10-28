// One reader for a Description level: order writes and removal both use it.
// A level is capped when the walk stops at the cap on a full page and one more id exists.
// Exactly `count` ids is the whole level, not a cap. Child levels are one depth at a time.

import { idFromEntityUri } from "@kaigilb/gilbplatformcode-id-tail";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { mapWithConcurrency, MAX_PARALLEL_DEREFERENCES } from "./mapWithConcurrency";
import { comparePartTie, isPartType, partKeyword, partOrder } from "./planParts";

/**
 * What the level readers need from the host's data layer: the page of child ids, the cache, and the host's pinned and
 * dropped rows. The unit never fetches and never caches; every call that touched the app's query cache goes through here.
 */
export interface LevelHost {
  /**
   * The ids of the records whose a:partOf is `parentUri`, paged up to `cap`; `capped` only when the walk stopped at the cap and one more id exists.
   * GilbApp: pageAttributeIds("a:partOf", parentUri, vaultOriginOf(planVault), { cap, qc }).
   */
  pageChildIds(planVault: string, parentUri: string, opts: { cap: number }): Promise<{ ids: string[]; count: number; capped: boolean }>;
  /**
   * Mark one record's cached read stale WITHOUT refetching it, and settle when that is done.
   * GilbApp: qc.invalidateQueries({ queryKey: planRecordKey(idFromEntityUri(entityUri), entityUri), refetchType: "none" }).
   */
  markStale(entityUri: string): Promise<void>;
  /**
   * Read one record: `fresh` fetches (a row marked stale is read again), otherwise the cached row, whatever its age. Null when it cannot be read.
   * GilbApp: readCached(qc, entityUri, fresh).
   */
  readMember(entityUri: string, fresh: boolean): Promise<BaseRecord | null>;
  /**
   * The host's pinned rows put in front of a fresh list, and its dropped rows left out of it. `serverIds` are the ids the page returned.
   * GilbApp: applyPinsAndDrops(qc, planVault, attr, parentId, rows, serverIds).
   */
  applyPinsAndDrops(planVault: string, attr: string, parentId: string, rows: BaseRecord[], serverIds: ReadonlySet<string>): BaseRecord[];
}

export const ORDER_CAP = 1000;
export const ORDER_TOO_MANY = "This level has more than 1000 parts, so a new part cannot be numbered here.";
export const ORDER_UNREAD =
  "Some parts at this level could not be read, so their order cannot be changed now. Try again.";

export const REMOVAL_MAX_DEPTH = 12;
export const REMOVAL_MAX_PARTS = 300;
export const REMOVAL_TOO_DEEP = "too many levels to remove at once";
export const REMOVAL_TOO_MANY = "more than 300 parts would be removed";
export const SUBPART_UNREAD = "a sub-part could not be read";

export type LevelRead = {
  records: BaseRecord[];
  ids: string[];
  total: number;
  capped: boolean;
  /** Entity URIs whose read returned nothing. */
  unread: string[];
};

/**
 * Every stored child of `parentUri`, or a cap refusal with no record reads.
 * `fresh` is the choice `host.readMember` takes: fetch when true, cached row when false.
 */
export async function readLevel(
  host: LevelHost,
  planVault: string,
  parentUri: string,
  opts: { cap: number; fresh: boolean },
): Promise<LevelRead> {
  const page = await host.pageChildIds(planVault, parentUri, { cap: opts.cap });
  if (page.capped) {
    return { records: [], ids: page.ids, total: page.ids.length, capped: true, unread: [] };
  }
  // A fresh read is what is stored now. Mark the rows stale first: a cache keeps a row that is still inside its stale time.
  if (opts.fresh) {
    await Promise.all(
      page.ids.map((entity) =>
        host.markStale(entity),
      ),
    );
  }
  const read = await mapWithConcurrency(page.ids, MAX_PARALLEL_DEREFERENCES, (entity) =>
    host.readMember(entity, opts.fresh),
  );
  const parentId = idFromEntityUri(parentUri);
  const readById = new Map<string, BaseRecord>();
  const serverRows: BaseRecord[] = [];
  const placeholder = new Set<string>();
  page.ids.forEach((entity, i) => {
    const rec = read[i];
    if (rec) {
      readById.set(rec.id, rec);
      serverRows.push(rec);
      return;
    }
    const id = idFromEntityUri(entity);
    placeholder.add(id);
    serverRows.push({ id, entityUri: entity, typeUri: "", facts: {}, opaqueFacts: [], etag: null });
  });
  const serverIds = new Set(page.ids.map((entity) => idFromEntityUri(entity)));
  const merged = host.applyPinsAndDrops(planVault, "a:partOf", parentId, serverRows, serverIds);
  const records: BaseRecord[] = [];
  const unread: string[] = [];
  const ids: string[] = [];
  for (const row of merged) {
    if (!row.entityUri) continue;
    ids.push(row.entityUri);
    if (placeholder.has(row.id) && !readById.has(row.id)) {
      unread.push(row.entityUri);
      continue;
    }
    records.push(readById.get(row.id) ?? row);
  }
  return { records, ids, total: page.ids.length, capped: false, unread };
}

/** `tag` is optional: a caller that only has id and order sorts as if the tag were "". */
export type StoredPart = { id: string; order: number | null; tag?: string };

export type LevelMove =
  | { kind: "step"; dir: -1 | 1 }
  | { kind: "index"; index: number }
  | { kind: "remove" }
  | { kind: "insert"; index: number }
  | { kind: "new" };

export type LevelMovePlan = { order: number; changes: { id: string; order: number }[] };

function finiteOrder(order: number | null): order is number {
  return typeof order === "number" && Number.isFinite(order);
}

function byStored(a: StoredPart, b: StoredPart): number {
  const ao = a.order;
  const bo = b.order;
  if (finiteOrder(ao) && finiteOrder(bo) && ao !== bo) return ao - bo;
  if (finiteOrder(ao) !== finiteOrder(bo)) return finiteOrder(ao) ? -1 : 1;
  return comparePartTie(a.tag ?? "", a.id, b.tag ?? "", b.id);
}

export type StepWrite = { id: string; order: number };

export type StepPlan =
  | { kind: "swap"; writes: [StepWrite, StepWrite] }
  | { kind: "renumber"; writes: StepWrite[] };

/**
 * One place up or down of `movedId` toward its neighbour.
 * `stored` is already in level order (callers sort). Omit `shown` on a full level: the neighbour is the adjacent part.
 * On a partial level, pass the shown ids: the neighbour is the next shown part that way.
 * Swap (the moved part, then the neighbour) when both orders are finite, each is held by exactly one part,
 * and no hidden part's order lies strictly between them. Otherwise number the whole list 1..n and list only
 * the parts whose order changes. `writes[0]` is always the moved part. Null when it is missing or there is no neighbour.
 */
export function planStep(
  stored: readonly StoredPart[],
  movedId: string,
  dir: -1 | 1,
  shown?: ReadonlySet<string>,
): StepPlan | null {
  const at = stored.findIndex((part) => part.id === movedId);
  if (at < 0) return null;
  let cursor = at + dir;
  while (cursor >= 0 && cursor < stored.length && shown && !shown.has(stored[cursor]!.id)) cursor += dir;
  if (cursor < 0 || cursor >= stored.length) return null;
  const moving = stored[at]!;
  const neighbour = stored[cursor]!;
  if (cleanSwap(stored, moving, neighbour, shown)) {
    return {
      kind: "swap",
      writes: [
        { id: moving.id, order: neighbour.order as number },
        { id: neighbour.id, order: moving.order as number },
      ],
    };
  }
  return { kind: "renumber", writes: renumberStep(stored, at, cursor, dir) };
}

/** Both orders finite and unique on the list, and no hidden order strictly between them. */
function cleanSwap(
  stored: readonly StoredPart[],
  moving: StoredPart,
  neighbour: StoredPart,
  shown?: ReadonlySet<string>,
): boolean {
  const left = moving.order;
  const right = neighbour.order;
  if (!finiteOrder(left) || !finiteOrder(right)) return false;
  let leftCount = 0;
  let rightCount = 0;
  for (const part of stored) {
    if (part.order === left) leftCount += 1;
    if (part.order === right) rightCount += 1;
  }
  if (leftCount !== 1 || rightCount !== 1) return false;
  if (!shown) return true;
  const lo = Math.min(left, right);
  const hi = Math.max(left, right);
  for (const part of stored) {
    if (shown.has(part.id)) continue;
    if (finiteOrder(part.order) && part.order > lo && part.order < hi) return false;
  }
  return true;
}

/** 1..n after the move. Counts are the orders before the move. The moved part is written even when its number does not change. */
function renumberStep(stored: readonly StoredPart[], at: number, cursor: number, dir: -1 | 1): StepWrite[] {
  const counts = new Map<number, number>();
  for (const part of stored) {
    if (!finiteOrder(part.order)) continue;
    counts.set(part.order, (counts.get(part.order) ?? 0) + 1);
  }
  const moving = stored[at]!;
  const next = stored.filter((_, i) => i !== at);
  let dest = cursor;
  if (at < cursor) dest -= 1;
  if (dir === 1) dest += 1;
  next.splice(dest, 0, moving);
  const others: StepWrite[] = [];
  let order = 0;
  next.forEach((part, i) => {
    const n = i + 1;
    if (part.id === moving.id) {
      order = n;
      return;
    }
    const settled = finiteOrder(part.order) && counts.get(part.order) === 1 && part.order === n;
    if (settled) return;
    others.push({ id: part.id, order: n });
  });
  return [{ id: moving.id, order }, ...others];
}

/**
 * Plan one move over the whole stored level.
 * A step swaps the two stored orders when {@link planStep} says the pair is clean, and otherwise numbers 1..n.
 * Every other move numbers the level 1..n. Only a part whose stored order is not already that number, or whose order was shared, is listed.
 * The moved part is not in `changes`: the caller writes it with `order`. A new part is `max + 1`.
 */
export function planFullLevelMove(
  stored: readonly StoredPart[],
  movedId: string,
  target: LevelMove,
  shown?: ReadonlySet<string>,
): LevelMovePlan | null {
  if (target.kind === "new") {
    let max = 0;
    let any = false;
    for (const part of stored) {
      if (!finiteOrder(part.order)) continue;
      any = true;
      if (part.order > max) max = part.order;
    }
    return { order: any ? max + 1 : 1, changes: [] };
  }
  const list = [...stored].sort(byStored);
  if (target.kind === "step") {
    const step = planStep(list, movedId, target.dir, shown);
    if (!step) return null;
    const head = step.writes[0];
    if (!head) return null;
    return { order: head.order, changes: step.writes.slice(1) };
  }
  const counts = new Map<number, number>();
  for (const part of stored) {
    if (!finiteOrder(part.order)) continue;
    counts.set(part.order, (counts.get(part.order) ?? 0) + 1);
  }
  const at = list.findIndex((part) => part.id === movedId);
  let next: StoredPart[];
  if (target.kind === "remove") {
    next = list.filter((part) => part.id !== movedId);
  } else if (target.kind === "index") {
    if (at < 0) return null;
    const to = Math.max(0, Math.min(target.index, list.length - 1));
    next = list.filter((_, i) => i !== at);
    next.splice(to, 0, list[at]!);
  } else {
    const moved = at >= 0 ? list[at]! : { id: movedId, order: null };
    const rest = list.filter((part) => part.id !== movedId);
    const to = Math.max(0, Math.min(target.index, rest.length));
    next = [...rest.slice(0, to), moved, ...rest.slice(to)];
  }
  const changes: { id: string; order: number }[] = [];
  let order = 0;
  next.forEach((part, i) => {
    const n = i + 1;
    if (part.id === movedId && target.kind !== "remove") {
      order = n;
      return;
    }
    const settled = finiteOrder(part.order) && counts.get(part.order) === 1 && part.order === n;
    if (settled) return;
    changes.push({ id: part.id, order: n });
  });
  return { order, changes };
}

/** Where `beforeId` sits once `movedId` is taken out. The end of the list when `beforeId` is null or missing. */
export function indexBefore(stored: readonly StoredPart[], movedId: string, beforeId: string | null): number {
  const list = [...stored].filter((part) => part.id !== movedId).sort(byStored);
  if (!beforeId) return list.length;
  const at = list.findIndex((part) => part.id === beforeId);
  return at < 0 ? list.length : at;
}

/** The vault an entity IRI belongs to (`https://h/base/e/x` becomes `https://h/base`), or null. */
function vaultIdOfEntity(entity: string): string | null {
  const i = entity.lastIndexOf("/e/");
  return i > 0 ? entity.slice(0, i) : null;
}

function inPlanVault(entityUri: string | undefined, planVault: string): boolean {
  if (!entityUri) return false;
  const home = vaultIdOfEntity(entityUri);
  return home !== null && home.replace(/\/+$/, "") === planVault.replace(/\/+$/, "");
}

/** One other record names it; several name it. */
export function otherRecordsSentence(keyword: string, others: readonly BaseRecord[]): string {
  const n = others.length;
  const names = others.slice(0, 3).map((rec) => recordTag(rec.facts) || rec.id);
  const noun = n === 1 ? "record" : "records";
  const verb = n === 1 ? "names it as its part-of" : "name it as their part-of";
  return `${keyword} is not removed: ${n} other ${noun} ${verb} (${names.join(", ")}). Change those first.`;
}

export type Gone = { id: string; entityUri: string | null; keyword: string; parentId: string };
export type Kept = { tag: string; parentKeyword: string };

export type PartialTarget = LevelMove | ((stored: readonly StoredPart[]) => LevelMove);

export type PartialWritePlan =
  | { ok: true; order: number; changes: { id: string; order: number }[]; byId: Map<string, BaseRecord>; stored: StoredPart[] }
  | { ok: false; notice: string };

/**
 * One partial-level plan: read the level, fill an unread row from a loaded list, then number the move.
 * `null` is a step past the end (do nothing, say nothing). A refusal is `{ ok: false }`.
 * Omitted `shown` treats every stored id as shown.
 */
export async function planPartialWrite(
  host: LevelHost,
  planVault: string,
  parentUri: string,
  movedId: string,
  target: PartialTarget,
  lists: readonly (readonly BaseRecord[])[],
  shown?: ReadonlySet<string>,
): Promise<PartialWritePlan | null> {
  let level: LevelRead;
  try {
    level = await readLevel(host, planVault, parentUri, { cap: ORDER_CAP, fresh: true });
  } catch {
    return { ok: false, notice: ORDER_UNREAD };
  }
  if (level.capped) return { ok: false, notice: ORDER_TOO_MANY };
  const byId = new Map<string, BaseRecord>();
  for (const rec of level.records) byId.set(rec.id, rec);
  for (const entity of level.unread) {
    const id = idFromEntityUri(entity);
    let found: BaseRecord | undefined;
    for (const list of lists) {
      found = list.find((row) => row.id === id);
      if (found) break;
    }
    if (!found) return { ok: false, notice: ORDER_UNREAD };
    byId.set(id, found);
  }
  const stored: StoredPart[] = [];
  for (const entity of level.ids) {
    const id = idFromEntityUri(entity);
    const rec = byId.get(id);
    if (!rec) return { ok: false, notice: ORDER_UNREAD };
    const n = partOrder(rec);
    stored.push({ id, order: Number.isFinite(n) ? n : null, tag: recordTag(rec.facts) });
  }
  const move = typeof target === "function" ? target(stored) : target;
  const plan = planFullLevelMove(stored, movedId, move, shown);
  if (!plan) return null;
  return { ok: true, order: plan.order, changes: plan.changes, byId, stored };
}

/**
 * Preorder for the sentence, postorder so the deepest part is removed first.
 * One depth at a time, through one pool of {@link MAX_PARALLEL_DEREFERENCES}. The budget is checked before that depth is read.
 */
export async function removalPlan(
  host: LevelHost,
  row: BaseRecord,
  keyword: string,
  parentId: string,
  planVault: string,
  seen: Set<string>,
  depth = 0,
): Promise<{ pre: Gone[]; post: Gone[]; kept: Kept[] }> {
  if (depth >= REMOVAL_MAX_DEPTH) throw new Error(REMOVAL_TOO_DEEP);
  if (seen.has(row.id)) return { pre: [], post: [], kept: [] };
  seen.add(row.id);
  if (!row.entityUri) throw new Error("no address");
  type Node = Gone & { children: string[] };
  const nodes = new Map<string, Node>();
  const keptByParent = new Map<string, Kept[]>();
  nodes.set(row.id, { id: row.id, entityUri: row.entityUri, keyword, parentId, children: [] });
  type Front = { id: string; entityUri: string; keyword: string };
  let frontier: Front[] = [{ id: row.id, entityUri: row.entityUri, keyword }];
  let frontierDepth = depth;
  while (frontier.length > 0) {
    frontierDepth += 1;
    if (frontierDepth > REMOVAL_MAX_DEPTH) throw new Error(REMOVAL_TOO_DEEP);
    const parents = frontier;
    const found = await mapWithConcurrency(parents, MAX_PARALLEL_DEREFERENCES, async (node) => {
      const page = await host.pageChildIds(planVault, node.entityUri, { cap: REMOVAL_MAX_PARTS + 1 });
      return { node, page };
    });
    if (found.some((item) => item.page.capped)) throw new Error(REMOVAL_TOO_MANY);
    const pending: { parent: Front; entity: string }[] = [];
    const claimed = new Set<string>();
    for (const item of found) {
      for (const entity of item.page.ids) {
        const id = idFromEntityUri(entity);
        if (seen.has(id) || claimed.has(id)) continue;
        claimed.add(id);
        pending.push({ parent: item.node, entity });
      }
    }
    if (seen.size + pending.length > REMOVAL_MAX_PARTS) throw new Error(REMOVAL_TOO_MANY);
    // A fresh read keeps a cached row that is still inside its stale time. Mark these
    // stale first so the removal reads what is stored now, still through the one pool of 6.
    await Promise.all(
      pending.map((item) =>
        host.markStale(item.entity),
      ),
    );
    const read = await mapWithConcurrency(pending, MAX_PARALLEL_DEREFERENCES, (item) => host.readMember(item.entity, true));
    if (read.some((rec) => !rec)) throw new Error(SUBPART_UNREAD);
    const foreignByParent = new Map<string, BaseRecord[]>();
    const next: Front[] = [];
    for (let i = 0; i < pending.length; i++) {
      const rec = read[i];
      if (!rec || seen.has(rec.id)) continue;
      const parent = pending[i]!.parent;
      seen.add(rec.id);
      if (isPartType(rec.typeUri) && inPlanVault(rec.entityUri, planVault)) {
        if (!rec.entityUri) throw new Error("no address");
        const childKeyword = partKeyword(recordTag(rec.facts)) || rec.id;
        nodes.set(rec.id, { id: rec.id, entityUri: rec.entityUri, keyword: childKeyword, parentId: parent.id, children: [] });
        nodes.get(parent.id)!.children.push(rec.id);
        next.push({ id: rec.id, entityUri: rec.entityUri, keyword: childKeyword });
      } else if (inPlanVault(rec.entityUri, planVault)) {
        const list = keptByParent.get(parent.id) ?? [];
        list.push({ tag: recordTag(rec.facts) || rec.id, parentKeyword: parent.keyword });
        keptByParent.set(parent.id, list);
      } else {
        const list = foreignByParent.get(parent.id) ?? [];
        list.push(rec);
        foreignByParent.set(parent.id, list);
      }
    }
    for (const parent of parents) {
      const foreign = foreignByParent.get(parent.id);
      if (foreign && foreign.length > 0) throw new Error(otherRecordsSentence(parent.keyword, foreign));
    }
    frontier = next;
  }
  const pre: Gone[] = [];
  const post: Gone[] = [];
  const kept: Kept[] = [];
  const walk = (id: string) => {
    const node = nodes.get(id)!;
    const gone: Gone = { id: node.id, entityUri: node.entityUri, keyword: node.keyword, parentId: node.parentId };
    pre.push(gone);
    kept.push(...(keptByParent.get(id) ?? []));
    for (const child of node.children) walk(child);
    post.push(gone);
  };
  walk(row.id);
  return { pre, post, kept };
}
