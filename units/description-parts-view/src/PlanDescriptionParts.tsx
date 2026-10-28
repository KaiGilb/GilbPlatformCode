// The Description of a Solution or Solution Constraint: one record per part.
// Create goes through createRecord — the same POST as the Plan dialog — because the
// dialog hook's facts are strings and cannot carry a link, an order, or line sources.
// An empty body is passed and omitted by the create door; that door is not changed.

import { PlanButtonRow } from "@kaigilb/gilbplatformcode-plan-button-row";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { DescriptionHelp } from "@kaigilb/gilbplatformcode-description-help";
import { FieldRow } from "@kaigilb/gilbplatformcode-field-row";
import { insideOpenLayer, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { SortableTree, TreeItem, flattenTree, type DropTarget } from "@kaigilb/gilbplatformcode-sortable-tree";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanSource } from "@kaigilb/gilbplatformcode-plan-source";
import { mapWithConcurrency, MAX_PARALLEL_DEREFERENCES } from "./mapWithConcurrency";
import { planTypePair } from "@kaigilb/gilbplatformcode-plan-kinds";
import { duplicateTagSentence, isTypeName, linkAddress, recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import { planFindRows } from "./planFind";
import {
  indexBefore,
  planPartialWrite,
  REMOVAL_TOO_DEEP,
  REMOVAL_TOO_MANY,
  removalPlan,
  type Gone,
  type Kept,
  type LevelMovePlan,
  type PartialTarget,
} from "@kaigilb/gilbplatformcode-description-parts-model";
import { applyPatch, WRITE_CONFLICT } from "./planRowCache";
import { PARTIAL_LEVEL, PlanFindLimitNote, usePlanParts } from "./usePlanParts";
import {
  ASSUMPTION_ELEMENT,
  ASSUMPTION_WARNING,
  assumptionHedge,
  descriptionTree,
  asGrid,
  dropPlan,
  isAssumptionPart,
  keywordProblem,
  moveInPlan,
  moveOutPlan,
  nextOrder,
  partBody,
  partKeyword,
  partOrder,
  previewPaste,
  reorderPlan,
  stepPlan,
  suggestKeyword,
  tagTaken,
  type DescriptionNode,
  type OrderChange,
  type PastePart,
} from "@kaigilb/gilbplatformcode-description-parts-model";
import {
  planSourceEqual,
  readLineSources,
  rowServedFact,
  sameServedList,
  sourceWithStatedBy,
  writeLineSource,
  type PlanSourceValue,
} from "@kaigilb/gilbplatformcode-plan-card-facts";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { writeSource, type MergePatchValue } from "./writeSource";
import type { RecordCreateFacts } from "./recordFacts";
import { useDescriptionPartsHost, type DescriptionPartsHost } from "./host";

const EN = "\u2013";
const box =
  "min-h-[44px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const quiet = "text-[12px] text-[var(--ink-soft)]";
// A target for a finger and a cursor: at least 44 x 44 px, the glyph large, quiet ink.
const tap =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r-md)] text-[20px] leading-none text-[var(--ink-soft)] hover:bg-[var(--sel)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40 disabled:hover:bg-transparent aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";
// An add action: at least 44 px high, 15 px text, the accent ink the other "+" actions on the card use.
const addAction =
  "inline-flex min-h-11 items-center rounded-[var(--r-md)] px-3 text-left text-[15px] text-[var(--accent)] hover:bg-[var(--sel)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50";
type Trail = { node: DescriptionNode<GridRecord>; siblings: readonly DescriptionNode<GridRecord>[]; index: number };

type Composer =
  | { kind: "part" }
  | { kind: "sub"; parentId: string }
  | { kind: "assumption" }
  | { kind: "paste" };

type Patch = Record<string, MergePatchValue>;

function servedRaw(row: GridRecord, slug: string): unknown {
  return rowServedFact(row, slug);
}

function findNode(nodes: readonly DescriptionNode<GridRecord>[], id: string): DescriptionNode<GridRecord> | null {
  for (const n of nodes) {
    if (n.row.id === id) return n;
    const child = findNode(n.children, id);
    if (child) return child;
  }
  return null;
}

function httpStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number") {
    return (e as { status: number }).status;
  }
  return undefined;
}

function conflictTag(e: unknown): string | null {
  if (e && typeof e === "object" && "tag" in e && typeof (e as { tag: unknown }).tag === "string") return (e as { tag: string }).tag;
  return null;
}

const TAGS_NOT_CHECKED = "Could not check the tags — nothing was written.";
const VERSION_UNREAD = "This record's version could not be read, so your change was not saved. Reload and try again.";

/** Re-read just these parent levels. The same id twice (an up or down inside one level) is one read. */
async function reReadLevels(
  host: DescriptionPartsHost,
  vaultId: string,
  parentIds: readonly string[],
  members: readonly string[] | "all" = "all",
): Promise<void> {
  const ids = [...new Set(parentIds)];
  await Promise.all(ids.map((id) => host.invalidatePlanFind(vaultId, "a:partOf", id, { members })));
}

type MoveJob = { reason: string | null; levels: readonly string[]; members: readonly string[] };

function moved(reason: string | null, fromId: string, toId: string, members: readonly (string | null | undefined)[]): MoveJob {
  return {
    reason,
    levels: [fromId, toId],
    members: members.filter((uri): uri is string => !!uri),
  };
}

function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function partialRemoval(pre: readonly Gone[], removed: ReadonlySet<string>, why: string): string {
  const done = pre.filter((g) => removed.has(g.id)).map((g) => g.keyword);
  const left = pre.filter((g) => !removed.has(g.id)).map((g) => g.keyword);
  const verb = left.length === 1 ? "was" : "were";
  return `Removed ${done.length} of ${pre.length} (${done.join(", ")}). ${nameList(left)} ${verb} not removed: ${why}.`;
}

/** The part of the notice that names records × left in place. Null when nothing was kept. */
function keptTail(kept: readonly Kept[]): string | null {
  if (kept.length === 0) return null;
  if (kept.length === 1) {
    const one = kept[0]!;
    return `${one.tag} still names ${one.parentKeyword} as its part-of and was not removed.`;
  }
  const tags = kept.slice(0, 3).map((k) => k.tag).join(", ");
  return `${kept.length} other records still name a removed part as their part-of and were not removed: ${tags}.`;
}

function keptNotice(keyword: string, kept: readonly Kept[]): string | null {
  const tail = keptTail(kept);
  return tail ? `Removed ${keyword}. ${tail}` : null;
}

function whyOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "could not remove";
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

const MISSING_ADDRESS = "This record's address was not read, so it was not linked.";

/** The card has a label and no tag. The Tag box is the one that can fix it. */
function tagFirstNotice(typeUri: string): string {
  const kind = planTypePair(typeUri).plainWord;
  return `Give this ${kind} a tag first, in the Tag box at the top.`;
}

function focusTagInput(): void {
  document.querySelector<HTMLInputElement>('input[aria-label="Tag"]')?.focus();
}

function tagsOf(nodes: readonly DescriptionNode<GridRecord>[], onlyAssumption = false): Set<string> {
  const tags = new Set<string>();
  const walk = (list: readonly DescriptionNode<GridRecord>[]) => {
    for (const n of list) {
      if (!onlyAssumption || isTypeName(n.row.typeUri, "Assumption")) tags.add(n.tag);
      walk(n.children);
    }
  };
  walk(nodes);
  return tags;
}

export function PlanDescriptionParts({
  record,
  vaultId,
  planVault = vaultId,
  canEdit,
  onOpen,
  onNotice,
  onBindAdd,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. Creates, finds, paste and moves use it. `vaultId` stays the screen vault. */
  planVault?: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onBindAdd: (open: () => void) => void;
}) {
  const host = useDescriptionPartsHost();
  if (!(host.createRecord && host.patchRecord && host.useDeleteRecord)) canEdit = false;
  const mode = useCardMode();
  const cardEditing = mode.editing && canEdit;
  const self = host.useSelfSource();
  const selfRef = useRef(self);
  selfRef.current = self;
  // Parts whose source the person picked or cleared while that part is open. A new text there keeps their choice.
  const chosenParts = useRef(new Set<string>());
  const del = host.useDeleteRecord?.(vaultId);
  const {
    tree,
    tagPool,
    pending,
    failed,
    topLoading,
    topError,
    parentIds,
    noteFor,
    partial,
    findState,
  } = usePlanParts(record, vaultId);
  // The tree a move plans from. Set each render, and again from the find cache when a job looks a part up,
  // so a queued move sees the orders the previous move stored, not the tree captured at click time.
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const partTags = useMemo(() => tagsOf(tree), [tree]);
  const assumptionTags = useMemo(() => tagsOf(tree, true), [tree]);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [failLine, setFailLine] = useState<number | null>(null);
  const [pasteFault, setPasteFault] = useState<string | null>(null);
  const [vaultTaken, setVaultTaken] = useState<string[]>([]);
  const [pasteNotice, setPasteNotice] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [keptWarning, setKeptWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveStatus, setMoveStatus] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusAfter = useRef<{ id: string; which: "up" | "down" | "out" | "in" } | null>(null);
  const busyRef = useRef(false);
  const movingRef = useRef(false);
  const removingRef = useRef(false);
  const tail = useRef(Promise.resolve());
  const addRef = useRef<HTMLDivElement>(null);
  const pasteRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const keywordTouched = useRef(false);
  const wantTextFocus = useRef(false);
  const leavingRef = useRef(false);
  const keywordRef = useRef("");
  const textRef = useRef("");
  const pasteTextRef = useRef("");
  /** Body, sources, and ETag the open editor started from. A later read must not become that baseline. */
  const editBase = useRef(new Map<string, { body: string; sources: unknown; etag: string | null }>());
  const composerRef = useRef<Composer | null>(null);
  keywordRef.current = keyword;
  textRef.current = text;
  pasteTextRef.current = pasteText;
  composerRef.current = composer;

  function run<T>(job: () => Promise<T>): Promise<T> {
    const p = tail.current.then(job, job);
    tail.current = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  function rowDirty(): boolean {
    return keywordRef.current.trim() !== "" || textRef.current.trim() !== "";
  }

  function openComposer(next: Composer, focusText = false) {
    const cur = composerRef.current;
    if (cur && cur.kind !== "paste" && rowDirty()) return;
    if (cur?.kind === "paste" && pasteTextRef.current.trim()) {
      setPasteNotice(true);
      return;
    }
    setError(null);
    setKeyword("");
    setText("");
    setFailLine(null);
    setPasteFault(null);
    setVaultTaken([]);
    setDiscardAsk(false);
    setPasteNotice(false);
    keywordTouched.current = false;
    keywordRef.current = "";
    textRef.current = "";
    if (focusText) wantTextFocus.current = true;
    setComposer(next);
  }

  function discardTyped() {
    setComposer(null);
    setKeyword("");
    setText("");
    setError(null);
    setDiscardAsk(false);
    keywordTouched.current = false;
    keywordRef.current = "";
    textRef.current = "";
    composerRef.current = null;
  }

  function discardPaste() {
    setComposer(null);
    setPasteText("");
    setPasteNotice(false);
    setFailLine(null);
    setPasteFault(null);
    setVaultTaken([]);
    pasteTextRef.current = "";
    composerRef.current = null;
  }

  function topLevelKeyword(): boolean {
    const cur = composerRef.current;
    if (!cur || (cur.kind !== "part" && cur.kind !== "sub")) return false;
    if (cur.kind === "part") return true;
    const parent = findNode(tree, cur.parentId);
    return !!parent && parent.tag === recordTag(record.facts);
  }

  onBindAdd(() => openComposer({ kind: "part" }, true));

  /** The screen list and the record's own list. Read-only: a missing row is not inserted. */
  function listsForFallback(): BaseRecord[][] {
    const ids = planVault === vaultId ? [planVault] : [planVault, vaultId];
    return ids.map((id) => host.cachedRecords(id));
  }

  /** Partial-level plan. `null` is a step past the end. A refusal is already not written. */
  async function levelOrders(
    parentUri: string,
    movedId: string,
    target: PartialTarget,
    shown?: ReadonlySet<string>,
  ): Promise<{ order: number; others: OrderChange<GridRecord>[] } | null> {
    const level = await planPartialWrite(host, planVault, parentUri, movedId, target, listsForFallback(), shown);
    if (!level) return null;
    if (!level.ok) {
      onNotice(level.notice);
      return null;
    }
    return { order: level.order, others: changesOf({ order: level.order, changes: level.changes }, level.byId) };
  }

  function nodeFor(rec: BaseRecord): DescriptionNode<GridRecord> {
    const place = whereIs(rec.id);
    if (place) return place.node;
    const grid = asGrid(rec);
    const tag = recordTag(grid.facts);
    return { row: grid, tag, keyword: partKeyword(tag) || grid.id, order: partOrder(grid), children: [] };
  }

  function changesOf(plan: LevelMovePlan, byId: Map<string, BaseRecord>): OrderChange<GridRecord>[] {
    const others: OrderChange<GridRecord>[] = [];
    for (const change of plan.changes) {
      const rec = byId.get(change.id);
      if (!rec) continue;
      others.push({ node: nodeFor(rec), order: change.order });
    }
    return others;
  }

  /** Shown orders on a full level. On a partial level, one past the highest stored order, or a refusal. */
  async function orderForNew(parentId: string, parentUri: string, shown: readonly number[]): Promise<number | null> {
    if (!partial(parentId)) return nextOrder(shown);
    const level = await planPartialWrite(host, planVault, parentUri, "", { kind: "new" }, listsForFallback());
    if (!level) return null;
    if (!level.ok) {
      onNotice(level.notice);
      return null;
    }
    return level.order;
  }

  async function createPart(args: {
    typeName: "SpecificationElement" | "Assumption";
    tag: string;
    body: string;
    parentId: string;
    parentUri: string;
    order: number;
    source: string | null;
    /** A paste defers the level re-read until the paste stops. Every other create re-reads now. */
    refresh?: boolean;
  }): Promise<GridRecord> {
    const typeUri = host.typeUriForVaultNamespace(args.typeName, planVault);
    const facts: RecordCreateFacts = {
      unitTag: args.tag,
      body: args.body,
      partOf: { "@id": args.parentUri },
      elementOrder: args.order,
    };
    // Words the person gave are the source. Otherwise a part with text is theirs: they are the source (when known).
    const me = selfRef.current;
    if (args.source) facts.lineSources = writeLineSource([], "a:body", args.source);
    else if (me && args.body.trim()) facts.lineSources = writeLineSource([], "a:body", { statedBy: me["@id"] });
    const { id, etag } = await host.createRecord!(planVault, typeUri, facts, args.tag);
    if (!id) throw new Error("The record was not created.");
    const fresh = await host.readRecord(id, planVault).catch(() => null);
    const entityUri = fresh?.entityUri;
    await host.rememberRecord({ id, vaultId: planVault, typeUri, updatedAt: Date.now() });
    host.markFreshlyCreated(id);
    const stringFacts: Record<string, string> = {
      unitTag: args.tag,
      partOf: args.parentUri,
      elementOrder: String(args.order),
    };
    if (args.body) stringFacts.body = args.body;
    const servedFacts: Record<string, unknown> = {
      unitTag: args.tag,
      partOf: { "@id": args.parentUri },
      elementOrder: args.order,
    };
    if (args.body) servedFacts.body = args.body;
    if (facts.lineSources) servedFacts.lineSources = facts.lineSources;
    const row: GridRecord = {
      id,
      ...(entityUri ? { entityUri } : {}),
      typeUri,
      facts: stringFacts,
      opaqueFacts: [],
      etag,
      updatedAt: Date.now(),
      servedKeys: Object.keys(stringFacts),
      served: { facts: servedFacts, context: undefined, etag },
    };
    host.storePlanRow(planVault, row, { insert: true });
    host.invalidatePlanSearch(planVault);
    host.prependPlanFind(planVault, "a:partOf", args.parentId, row, {
      members: row.entityUri ? [row.entityUri] : [],
      ...(args.refresh === false ? { refresh: false } : {}),
    });
    // The tree reads a part's own a:partOf as soon as the row is shown. A paste fills that
    // cache so those reads are not one find per part; the touched levels are re-read once at the end.
    if (args.refresh === false) {
      if (host.getFind(planVault, "a:partOf", row.id) === undefined) {
        host.setFind(planVault, "a:partOf", row.id, { rows: [], total: 0, capped: false, unread: 0 });
      }
    }
    return row;
  }

  async function createChecked(args: Parameters<typeof createPart>[0]): Promise<GridRecord> {
    try {
      return await createPart(args);
    } catch (e) {
      if (httpStatus(e) !== 409) throw e;
      const err = new Error(duplicateTagSentence(args.tag)) as Error & { status: number; tag: string };
      err.status = 409;
      err.tag = args.tag;
      throw err;
    }
  }

  function partNoticeName(row: GridRecord): string {
    const place = whereIs(row.id);
    if (place?.node.keyword) return place.node.keyword;
    const tag = recordTag(row.facts);
    const word = tag ? partKeyword(tag) : "";
    return word || "This part";
  }

  function partLevelId(row: GridRecord): string {
    const place = whereIs(row.id);
    if (!place || place.trail.length === 0) return record.id;
    return place.trail[place.trail.length - 1]!.node.row.id;
  }

  async function patchPart(
    row: GridRecord,
    build: (row: GridRecord) => Patch,
    sameFor: (fresh: GridRecord) => boolean,
    opts?: { forceReread?: boolean },
  ): Promise<GridRecord> {
    let live = host.liveRow(planVault, row.id, row);
    // A null ETag is what makes ensureEtagUnchanged re-read and run sameFor. liveRow would
    // put the cached ETag back, so the null is applied after that lookup, only for this save.
    const gate = await host.ensureEtagUnchanged(planVault, opts?.forceReread ? { ...live, etag: null } : live, sameFor);
    if ("unreadable" in gate) {
      onNotice(VERSION_UNREAD);
      throw new Error(VERSION_UNREAD);
    }
    if ("conflict" in gate) {
      const fresh = host.liveRow(planVault, live.id, live);
      const name = partNoticeName(live);
      host.patchPlanFindRows(planVault, live.id, () => asGrid(fresh));
      onNotice(`${name} changed elsewhere. The card now shows the latest; your change was not saved.`);
      setOpenId((id) => (id === live.id ? null : id));
      try {
        await host.invalidatePlanFind(planVault, "a:partOf", partLevelId(live));
      } catch {
        // The notice already names the part. A failed re-read must not replace that sentence.
      }
      throw new Error(WRITE_CONFLICT);
    }
    live = gate.row;
    const patch = build(live);
    const src = writeSource(live);
    const pre = { ifMatch: live.etag };
    try {
      const { etag } = src.length
        ? await host.patchRecord!(live.id, patch, live.entityUri ?? null, src[0], pre)
        : await host.patchRecord!(live.id, patch, live.entityUri ?? null, undefined, pre);
      const apply = (current: GridRecord) => applyPatch(current, patch, etag);
      const stored = { ...apply(live), updatedAt: Date.now() };
      host.storePlanRow(planVault, stored);
      if (stored.entityUri) host.setRecordRead(stored.id, stored.entityUri, stored);
      host.patchPlanFindRows(planVault, live.id, (current) => apply(asGrid(current)));
      return stored;
    } catch (e) {
      if (!host.isConflict(e)) throw e;
      const fresh = await host.reconcileAfterConflict(planVault, live);
      const name = partNoticeName(live);
      if (fresh) {
        const grid = asGrid(fresh);
        host.patchPlanFindRows(planVault, live.id, () => grid);
      }
      onNotice(`${name} changed elsewhere. The card now shows the latest; your change was not saved.`);
      setOpenId((id) => (id === live.id ? null : id));
      if (fresh) {
        try {
          await host.invalidatePlanFind(planVault, "a:partOf", partLevelId(live));
        } catch {
          // The notice already names the part. A failed re-read must not replace that sentence.
        }
      }
      throw e;
    }
  }

  async function saveBody(row: GridRecord, value: string) {
    const live = host.liveRow(vaultId, row.id, row);
    const next = value.trim();
    if (next === partBody(live).trim()) return;
    const me = selfRef.current;
    const stamp = !!(me && next && !chosenParts.current.has(live.id));
    const base = editBase.current.get(live.id);
    const startedBody = base?.body ?? partBody(live);
    const startedSources = base?.sources ?? servedRaw(live, "lineSources");
    const forceReread = base?.etag != null && (live.etag ?? null) !== base.etag;
    const saved = await patchPart(
      live,
      (ready) => {
        const patch: Patch = { body: next ? next : null };
        // The new text is this person's: they are its source, in the same write, unless they chose a source for this part.
        if (stamp && me) {
          const prev = readLineSources(servedRaw(ready, "lineSources"))["a:body"] ?? {};
          const mine = sourceWithStatedBy(prev, me["@id"]);
          if (!planSourceEqual(mine, prev)) patch.lineSources = writeLineSource(servedRaw(ready, "lineSources"), "a:body", mine);
        }
        return patch;
      },
      (fresh) => {
        if (partBody(fresh).trim() !== startedBody.trim()) return false;
        if (stamp && !sameServedList(startedSources, servedRaw(fresh, "lineSources"))) return false;
        return true;
      },
      { forceReread },
    );
    // Tab stays in the section, so the editor stays open. The next commit in that
    // session started from what this save stored, not from the text at first open.
    if (editBase.current.has(saved.id)) {
      editBase.current.set(saved.id, {
        body: partBody(saved),
        sources: servedRaw(saved, "lineSources"),
        etag: saved.etag ?? null,
      });
    }
  }

  async function saveSource(row: GridRecord, next: PlanSourceValue) {
    const live = host.liveRow(vaultId, row.id, row);
    const prev = readLineSources(servedRaw(live, "lineSources"))["a:body"] ?? {};
    if (planSourceEqual(next, prev)) return;
    const base = editBase.current.get(live.id);
    const forceReread = base?.etag != null && (live.etag ?? null) !== base.etag;
    const baseline = forceReread ? (readLineSources(base?.sources)["a:body"] ?? {}) : prev;
    await patchPart(
      live,
      (ready) => ({ lineSources: writeLineSource(servedRaw(ready, "lineSources"), "a:body", next) }),
      (fresh) => planSourceEqual(readLineSources(servedRaw(fresh, "lineSources"))["a:body"] ?? {}, baseline),
      { forceReread },
    );
  }

  function fail(e: unknown) {
    onNotice(e instanceof Error ? e.message : "Couldn't save — your change was rolled back. Try again.");
  }

  async function submitAdd() {
    if (busyRef.current || !composer || composer.kind === "paste") return;
    const problem = keywordProblem(keyword, { topLevel: topLevelKeyword() });
    if (problem) {
      setError(problem);
      return;
    }
    const solutionTag = recordTag(record.facts);
    const here = record.entityUri;
    if (!solutionTag) {
      onNotice(tagFirstNotice(record.typeUri));
      focusTagInput();
      return;
    }
    if (!here) {
      onNotice(MISSING_ADDRESS);
      return;
    }
    const name = keyword.trim();
    const body = text.trim();
    let tag = `${solutionTag}.${name}`;
    let parentId = record.id;
    let parentUri = here;
    let order = nextOrder(tree.map((n) => n.order));
    let typeName: "SpecificationElement" | "Assumption" = "SpecificationElement";
    let assumptionParent: { tag: string; existing: DescriptionNode<GridRecord> | null } | null = null;
    if (composer.kind === "sub") {
      const parent = findNode(tree, composer.parentId);
      if (!parent?.row.entityUri || !parent.tag) {
        onNotice("This record's address was not read, so it was not linked.");
        return;
      }
      tag = `${parent.tag}.${name}`;
      parentId = parent.row.id;
      parentUri = parent.row.entityUri;
      order = nextOrder(parent.children.map((c) => c.order));
      if (isTypeName(parent.row.typeUri, "Assumption")) typeName = "Assumption";
    } else if (composer.kind === "assumption") {
      const parentTag = `${solutionTag}.Assumption`;
      tag = `${parentTag}.${name}`;
      const notAnAssumption = tree.find((n) => n.tag === parentTag && isTypeName(n.row.typeUri, "SpecificationElement"));
      if (notAnAssumption) {
        setError(ASSUMPTION_ELEMENT);
        return;
      }
      const existing = tree.find((n) => n.tag === parentTag && isTypeName(n.row.typeUri, "Assumption")) ?? null;
      if (!existing && tagTaken(tagPool, parentTag)) {
        setError(duplicateTagSentence(parentTag));
        return;
      }
      assumptionParent = { tag: parentTag, existing };
      if (existing) order = nextOrder(existing.children.map((c) => c.order));
    }
    if (tagTaken(tagPool, tag)) {
      setError(duplicateTagSentence(tag));
      return;
    }
    setError(null);
    busyRef.current = true;
    setBusy(true);
    // The parent of the create in flight. A 409 re-reads that one level.
    let levelOfAdd = parentId;
    try {
      // Both tags, before any write, so a taken child does not leave an Assumption parent behind.
      if (assumptionParent && !assumptionParent.existing && (await host.tagUsedInVault(planVault, assumptionParent.tag))) {
        setError(duplicateTagSentence(assumptionParent.tag));
        return;
      }
      if (await host.tagUsedInVault(planVault, tag)) {
        setError(duplicateTagSentence(tag));
        return;
      }
      // A partial level is numbered from every stored child, not from the parts the card drew.
      if (assumptionParent && !assumptionParent.existing) {
        const parentOrder = await orderForNew(record.id, here, tree.map((n) => n.order));
        if (parentOrder == null) return;
        order = parentOrder;
      } else if (assumptionParent?.existing?.row.entityUri) {
        const next = await orderForNew(
          assumptionParent.existing.row.id,
          assumptionParent.existing.row.entityUri,
          assumptionParent.existing.children.map((c) => c.order),
        );
        if (next == null) return;
        order = next;
      } else if (composer.kind === "sub") {
        const parent = findNode(tree, parentId);
        const next = await orderForNew(parentId, parentUri, parent ? parent.children.map((c) => c.order) : []);
        if (next == null) return;
        order = next;
      } else {
        const next = await orderForNew(record.id, here, tree.map((n) => n.order));
        if (next == null) return;
        order = next;
      }
      if (assumptionParent) {
        let assumptionUri = assumptionParent.existing?.row.entityUri;
        let assumptionId = assumptionParent.existing?.row.id;
        if (!assumptionParent.existing) {
          const parent = await createChecked({
            typeName: "Assumption",
            tag: assumptionParent.tag,
            body: "",
            parentId: record.id,
            parentUri: here,
            order,
            source: null,
          });
          if (!parent.entityUri) throw new Error("The record was made, but its address was not read, so it was not linked.");
          assumptionUri = parent.entityUri;
          assumptionId = parent.id;
          order = 1;
        }
        if (!assumptionUri || !assumptionId) throw new Error("This record's address was not read, so it was not linked.");
        levelOfAdd = assumptionId;
        await createChecked({
          typeName: "Assumption",
          tag,
          body,
          parentId: assumptionId,
          parentUri: assumptionUri,
          order,
          source: null,
        });
        if (assumptionHedge(body)) setKeptWarning(true);
      } else {
        await createChecked({ typeName, tag, body, parentId, parentUri, order, source: null });
      }
      setComposer(null);
      setKeyword("");
      setText("");
      keywordRef.current = "";
      textRef.current = "";
      composerRef.current = null;
      onNotice(null);
    } catch (e) {
      if (httpStatus(e) === 409) {
        setError(duplicateTagSentence(conflictTag(e) ?? tag));
        await reReadLevels(host, planVault, [levelOfAdd], []);
      } else fail(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function pastePreview(text: string) {
    const solutionTag = recordTag(record.facts);
    const taken = (tag: string) => tagTaken(tagPool, tag) || vaultTaken.includes(tag);
    const preview = previewPaste(text, solutionTag, taken, partTags);
    if (vaultTaken.length === 0) return preview;
    const blocked = new Set(vaultTaken);
    return {
      ...preview,
      parts: preview.parts.map((part) => {
        if (part.skipped || !part.assumption || !part.parentTag) return part;
        if (assumptionTags.has(part.parentTag) || !blocked.has(part.parentTag)) return part;
        return { ...part, skipped: true };
      }),
    };
  }

  async function writePaste() {
    if (busyRef.current) return;
    const here = record.entityUri;
    const solutionTag = recordTag(record.facts);
    if (!solutionTag) {
      onNotice(tagFirstNotice(record.typeUri));
      focusTagInput();
      return;
    }
    if (!here) {
      onNotice(MISSING_ADDRESS);
      return;
    }
    const preview = pastePreview(pasteText);
    const todo = preview.parts.filter((p) => !p.skipped);
    if (todo.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setFailLine(null);
    setPasteFault(null);
    const look: string[] = [];
    const seenTag = new Set<string>();
    const addLook = (tag: string) => {
      if (!tag || seenTag.has(tag)) return;
      seenTag.add(tag);
      look.push(tag);
    };
    for (const part of todo) {
      addLook(part.tag);
      if (part.assumption && part.parentTag && !assumptionTags.has(part.parentTag)) addLook(part.parentTag);
    }
    let topCursor = nextOrder(tree.map((n) => n.order));
    const childCursor = new Map<string, number>();
    const everyNode: DescriptionNode<GridRecord>[] = [];
    const collect = (nodes: readonly DescriptionNode<GridRecord>[]) => {
      for (const n of nodes) {
        everyNode.push(n);
        collect(n.children);
      }
    };
    collect(tree);
    for (const node of everyNode) childCursor.set(node.tag, nextOrder(node.children.map((c) => c.order)));
    const made = new Map<string, string>();
    const madeId = new Map<string, string>();
    const fresh = new Set<string>();
    const uriFor = (tag: string, assumptionOnly: boolean): string | undefined => {
      const minted = made.get(tag);
      if (minted) return minted;
      if (assumptionOnly) {
        return everyNode.find((n) => n.tag === tag && isTypeName(n.row.typeUri, "Assumption"))?.row.entityUri;
      }
      return everyNode.find((n) => n.tag === tag)?.row.entityUri;
    };
    const idFor = (tag: string): string | undefined => madeId.get(tag) ?? everyNode.find((n) => n.tag === tag)?.row.id;
    let written = 0;
    // Parents a create actually landed on. Re-read each once when the paste stops, not after every part.
    const touched = new Set<string>();
    try {
      let hits: { tag: string; used: boolean }[];
      try {
        hits = await mapWithConcurrency(look, MAX_PARALLEL_DEREFERENCES, async (tag) => ({
          tag,
          used: await host.tagUsedInVault(planVault, tag),
        }));
      } catch {
        setPasteFault(TAGS_NOT_CHECKED);
        return;
      }
      const found = hits.filter((hit) => hit.used).map((hit) => hit.tag);
      if (found.length > 0) {
        setVaultTaken((prev) => [...new Set([...prev, ...found])]);
        return;
      }
      const landed = new Map<string, { uri: string; tag: string | null }>();
      for (const part of todo) {
        if (part.top || !part.parentTag) {
          if (partial(record.id)) landed.set(record.id, { uri: here, tag: null });
          continue;
        }
        const parent = everyNode.find((n) => n.tag === part.parentTag);
        if (!parent?.row.entityUri) {
          if (partial(record.id)) landed.set(record.id, { uri: here, tag: null });
          continue;
        }
        if (partial(parent.row.id)) landed.set(parent.row.id, { uri: parent.row.entityUri, tag: parent.tag });
      }
      for (const level of landed.values()) {
        const resolved = await planPartialWrite(host, planVault, level.uri, "", { kind: "new" }, listsForFallback());
        if (!resolved) continue;
        if (!resolved.ok) {
          onNotice(resolved.notice);
          return;
        }
        if (level.tag == null) topCursor = resolved.order;
        else childCursor.set(level.tag, resolved.order);
      }
      for (const part of todo) {
        try {
          await writeOne(part);
          written += 1;
        } catch (e) {
          if (httpStatus(e) === 409) {
            const tag = conflictTag(e) ?? part.tag;
            setPasteFault(`${duplicateTagSentence(tag)} Written: ${written} of ${todo.length}. Stopped at ${tag}.`);
          } else setFailLine(part.line);
          return;
        }
      }
      setComposer(null);
      setPasteText("");
      setPasteNotice(false);
      setVaultTaken([]);
      pasteTextRef.current = "";
      composerRef.current = null;
      onNotice(null);
    } finally {
      try {
        if (touched.size > 0) await reReadLevels(host, planVault, [...touched], []);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    }

    async function writeOne(part: PastePart) {
      if (fresh.has(part.tag) || tagTaken(tagPool, part.tag)) throw new Error("taken");
      let parentId = record.id;
      let parentUri = here!;
      let order = topCursor;
      if (!part.top) {
        const pTag = part.parentTag ?? "";
        let uri = uriFor(pTag, part.assumption);
        if (part.assumption && !uri) {
          if (tagTaken(tagPool, pTag) || fresh.has(pTag)) throw new Error("parent");
          const parent = await createChecked({
            typeName: "Assumption",
            tag: pTag,
            body: "",
            parentId: record.id,
            parentUri: here!,
            order: topCursor,
            source: null,
            refresh: false,
          });
          touched.add(record.id);
          topCursor += 1;
          if (!parent.entityUri) throw new Error("parent");
          uri = parent.entityUri;
          made.set(pTag, uri);
          madeId.set(pTag, parent.id);
          fresh.add(pTag);
          childCursor.set(pTag, 1);
        }
        const holder = idFor(pTag);
        if (!uri || !holder) throw new Error("parent");
        parentId = holder;
        parentUri = uri;
        order = childCursor.get(pTag) ?? 1;
      }
      const created = await createChecked({
        typeName: part.assumption ? "Assumption" : "SpecificationElement",
        tag: part.tag,
        body: part.text,
        parentId,
        parentUri,
        order,
        source: part.source,
        refresh: false,
      });
      touched.add(parentId);
      fresh.add(part.tag);
      madeId.set(part.tag, created.id);
      if (created.entityUri) made.set(part.tag, created.entityUri);
      childCursor.set(part.tag, 1);
      if (part.top) topCursor += 1;
      else childCursor.set(part.parentTag ?? "", order + 1);
    }
  }

  /**
   * The find cache, not the tree captured at click time. A queued move plans after the previous
   * move has stored its orders, before React has painted that tree.
   */
  function syncTree() {
    const top = host.getFind(planVault, "a:partOf", record.id);
    if (!top) return;
    const rows: GridRecord[] = [];
    const seen = new Set<string>();
    const add = (row: BaseRecord) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      rows.push(asGrid(row));
    };
    for (const data of host.getFinds(planVault)) {
      for (const row of planFindRows(data)) add(row);
    }
    treeRef.current = descriptionTree(record, rows);
  }

  /** One move at a time. The next move waits until the levels it touched have been re-read. A failed write's notice is the reason. */
  function runMove(job: () => Promise<MoveJob | string | null | undefined | void>): Promise<string | null> {
    return run(async () => {
      movingRef.current = true;
      setMoving(true);
      try {
        const out = await job();
        if (out && typeof out === "object" && "levels" in out) {
          await reReadLevels(host, planVault, out.levels, out.members);
          syncTree();
          return out.reason || null;
        }
        syncTree();
        return typeof out === "string" && out ? out : null;
      } catch (e) {
        fail(e);
        return null;
      } finally {
        movingRef.current = false;
        setMoving(false);
      }
    });
  }

  /**
   * Write a move as one queued sequence: the moved part first (`a:partOf` and `a:elementOrder` in one PATCH), then each
   * sibling whose order changes, one PATCH per record. The part keeps its `a:unitTag`; its own children keep their `a:partOf`.
   * A failure stops the sequence and says which part was not written.
   */
  async function writeMove(
    node: DescriptionNode<GridRecord>,
    from: { id: string },
    to: { id: string; uri: string },
    order: number,
    others: readonly OrderChange<GridRecord>[],
  ): Promise<MoveJob> {
    // Within one level the part keeps its `a:partOf`: only the orders are written.
    const sameLevel = from.id === to.id;
    const steps: { node: DescriptionNode<GridRecord>; patch: Patch }[] = [
      { node, patch: sameLevel ? { elementOrder: order } : { partOf: { "@id": to.uri }, elementOrder: order } },
      ...others.map((o) => ({ node: o.node, patch: { elementOrder: o.order } as Patch })),
    ];
    let done = 0;
    try {
      for (const step of steps) {
        const base = step.node.row;
        const next = await patchPart(base, () => step.patch, (fresh) => {
          if ("elementOrder" in step.patch && partOrder(fresh) !== partOrder(base)) return false;
          if ("partOf" in step.patch && linkAddress(fresh, "partOf") !== linkAddress(base, "partOf")) return false;
          return true;
        });
        if (done === 0 && !sameLevel) {
          // The queued re-read is the one that refreshes these two levels. Don't start a second one here.
          host.dropPlanFind(planVault, "a:partOf", from.id, node.row.id, { refresh: false });
          host.prependPlanFind(planVault, "a:partOf", to.id, next, { refresh: false });
        }
        done += 1;
      }
      onNotice(null);
      return moved(null, from.id, to.id, steps.map((step) => step.node.row.entityUri));
    } catch (e) {
      const written = steps.slice(0, done).map((step) => step.node.row.entityUri);
      void reReadLevels(host, planVault, [from.id, to.id], written.filter((uri): uri is string => !!uri));
      if (e instanceof Error && e.message === VERSION_UNREAD) {
        onNotice(VERSION_UNREAD);
        return { reason: VERSION_UNREAD, levels: [], members: [] };
      }
      if (e instanceof Error && e.message === WRITE_CONFLICT) {
        return { reason: WRITE_CONFLICT, levels: [], members: [] };
      }
      const why = e instanceof Error && e.message ? ` (${e.message})` : "";
      const notice =
        done === 0
          ? `Could not move ${node.keyword}; nothing was changed${why}`
          : `Moved ${node.keyword}, but ${steps[done]!.node.keyword} was not renumbered${why}`;
      onNotice(notice);
      // The catch already re-reads these levels. An empty list keeps runMove from reading them again.
      return { reason: notice, levels: [], members: [] };
    }
  }

  async function moveIn(node: DescriptionNode<GridRecord>, siblings: readonly DescriptionNode<GridRecord>[], index: number, fromId: string): Promise<MoveJob | null> {
    const plan = moveInPlan(siblings, index);
    const uri = plan?.parent.row.entityUri;
    if (!plan || !uri) return null;
    return writeMove(node, { id: fromId }, { id: plan.parent.row.id, uri }, plan.order, plan.closeGap);
  }

  async function moveOut(trail: readonly Trail[], node: DescriptionNode<GridRecord>, siblings: readonly DescriptionNode<GridRecord>[], index: number): Promise<MoveJob | null> {
    const up = trail[trail.length - 1];
    if (!up) return null;
    const grand = trail[trail.length - 2];
    const levelSiblings = grand ? grand.node.children : treeRef.current;
    const target = grand
      ? { id: grand.node.row.id, uri: grand.node.row.entityUri }
      : { id: record.id, uri: record.entityUri };
    if (!target.uri) return null;
    const plan = moveOutPlan(siblings, index, levelSiblings, up.index);
    return writeMove(node, { id: up.node.row.id }, { id: target.id, uri: target.uri }, plan.order, [...plan.shift, ...plan.closeGap]);
  }

  /** Where a part is in the tree: its level, its place, the parts above it. Read from the latest find cache. */
  function whereIs(id: string): { node: DescriptionNode<GridRecord>; siblings: readonly DescriptionNode<GridRecord>[]; index: number; trail: Trail[] } | null {
    syncTree();
    const walk = (nodes: readonly DescriptionNode<GridRecord>[], trail: Trail[]): ReturnType<typeof whereIs> => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        if (n.row.id === id) return { node: n, siblings: nodes, index: i, trail };
        const deeper = walk(n.children, [...trail, { node: n, siblings: nodes, index: i }]);
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(treeRef.current, []);
  }

  async function stepById(id: string, dir: -1 | 1): Promise<MoveJob | null> {
    const at = whereIs(id);
    if (!at) return null;
    const parent = at.trail[at.trail.length - 1];
    const parentId = parent ? parent.node.row.id : record.id;
    const parentUri = parent ? parent.node.row.entityUri : record.entityUri;
    if (!parentUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return null;
    }
    if (!partial(parentId)) {
      const plan = stepPlan(at.siblings, at.index, dir);
      if (!plan) return null;
      return writeMove(at.node, { id: parentId }, { id: parentId, uri: parentUri }, plan.order, plan.others);
    }
    const plan = await levelOrders(parentUri, id, { kind: "step", dir }, new Set(at.siblings.map((s) => s.row.id)));
    if (!plan) return null;
    return writeMove(at.node, { id: parentId }, { id: parentId, uri: parentUri }, plan.order, plan.others);
  }

  async function inById(id: string): Promise<MoveJob | null> {
    const at = whereIs(id);
    if (!at) return null;
    const ahead = moveInPlan(at.siblings, at.index);
    const uri = ahead?.parent.row.entityUri;
    if (!ahead || !uri) return null;
    const from = at.trail.length ? at.trail[at.trail.length - 1]!.node.row : record;
    if (!from.entityUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return null;
    }
    if (!partial(ahead.parent.row.id) && !partial(from.id)) {
      return writeMove(at.node, { id: from.id }, { id: ahead.parent.row.id, uri }, ahead.order, ahead.closeGap);
    }
    let order = ahead.order;
    const others: OrderChange<GridRecord>[] = [];
    if (partial(ahead.parent.row.id)) {
      const dest = await levelOrders(uri, id, { kind: "insert", index: Number.POSITIVE_INFINITY });
      if (!dest) return null;
      order = dest.order;
      others.push(...dest.others);
    }
    if (partial(from.id)) {
      const source = await levelOrders(from.entityUri, id, { kind: "remove" });
      if (!source) return null;
      others.push(...source.others);
    } else others.push(...ahead.closeGap);
    return writeMove(at.node, { id: from.id }, { id: ahead.parent.row.id, uri }, order, others);
  }

  async function outById(id: string): Promise<MoveJob | null> {
    const at = whereIs(id);
    if (!at || at.trail.length === 0) return null;
    const up = at.trail[at.trail.length - 1]!;
    const grand = at.trail[at.trail.length - 2];
    const target = grand
      ? { id: grand.node.row.id, uri: grand.node.row.entityUri }
      : { id: record.id, uri: record.entityUri };
    if (!target.uri || !up.node.row.entityUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return null;
    }
    const levelSiblings = grand ? grand.node.children : treeRef.current;
    const shown = moveOutPlan(at.siblings, at.index, levelSiblings, up.index);
    if (!partial(target.id) && !partial(up.node.row.id)) {
      return writeMove(at.node, { id: up.node.row.id }, { id: target.id, uri: target.uri }, shown.order, [...shown.shift, ...shown.closeGap]);
    }
    let order = shown.order;
    const others: OrderChange<GridRecord>[] = [];
    if (partial(target.id)) {
      const after = levelSiblings[up.index + 1]?.row.id ?? null;
      const plan = await levelOrders(target.uri, id, (stored) => ({ kind: "insert", index: indexBefore(stored, id, after) }));
      if (!plan) return null;
      order = plan.order;
      others.push(...plan.others);
    } else others.push(...shown.shift);
    if (partial(up.node.row.id)) {
      const source = await levelOrders(up.node.row.entityUri, id, { kind: "remove" });
      if (!source) return null;
      others.push(...source.others);
    } else others.push(...shown.closeGap);
    return writeMove(at.node, { id: up.node.row.id }, { id: target.id, uri: target.uri }, order, others);
  }

  /** The Assumption rule of the arrows, for a drop: a part never changes kind, so it never changes level across that boundary. */
  function refuseMove(m: { activeId: string; parentId: string | null; index: number }): string | null {
    const at = whereIs(m.activeId);
    if (!at) return null;
    const currentParent = at.trail.length ? at.trail[at.trail.length - 1]!.node.row.id : null;
    if (m.parentId === currentParent) return null;
    const next = m.parentId ? findNode(treeRef.current, m.parentId) : null;
    if (m.parentId && !next) return null;
    if ((next ? next.row.entityUri : record.entityUri) == null) return "This record's address was not read, so it was not linked.";
    const partKind = isAssumptionPart(at.node.row);
    const parentKind = next ? isAssumptionPart(next.row) : false;
    if (partKind === parentKind) return null;
    return partKind
      ? `${at.node.keyword} is an assumption: it stays under the Assumption part.`
      : `${at.node.keyword} is not an assumption: it cannot go under the Assumption part.`;
  }

  /**
   * A drop is one of the moves above. One place up or down in its level is `stepPlan` (the two stored orders swapped
   * when that pair is clean, otherwise the 1..n renumber), the same plan as the
   * arrows. To the end of the part above is "in"; to just after its parent is "out"; anything else is the same sequence
   * (the part first, then each part whose order changes) planned for that place. Queued with `run`, written by `writeMove`.
   */
  async function dropPart(drop: DropTarget): Promise<MoveJob | null> {
    const at = whereIs(drop.activeId);
    if (!at) return null;
    const root = treeRef.current;
    const { node, siblings, index, trail } = at;
    const up = trail[trail.length - 1];
    const fromId = up ? up.node.row.id : record.id;
    const toId = drop.parentId ?? record.id;
    const newParent = drop.parentId ? findNode(root, drop.parentId) : null;
    const toUri = newParent ? newParent.row.entityUri : record.entityUri;
    if (!toUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return null;
    }
    if (partial(fromId) || partial(toId)) {
      if (fromId === toId) {
        const step = drop.index - index;
        if (step === 0) return null;
        if (Math.abs(step) === 1) {
          const plan = await levelOrders(toUri, node.row.id, { kind: "step", dir: step < 0 ? -1 : 1 }, new Set(siblings.map((s) => s.row.id)));
          if (!plan) return null;
          return writeMove(node, { id: fromId }, { id: toId, uri: toUri }, plan.order, plan.others);
        }
        const movingDown = drop.index > index;
        const before = siblings[movingDown ? drop.index + 1 : drop.index]?.row.id ?? null;
        const plan = await levelOrders(toUri, node.row.id, (stored) => ({
          kind: "index",
          index: indexBefore(stored, node.row.id, before),
        }));
        if (!plan) return null;
        return writeMove(node, { id: fromId }, { id: toId, uri: toUri }, plan.order, plan.others);
      }
      const levelShown = newParent ? newParent.children : root;
      const fromUri = up ? up.node.row.entityUri : record.entityUri;
      if (!fromUri) {
        onNotice("This record's address was not read, so it was not linked.");
        return null;
      }
      const shown = dropPlan(siblings, index, levelShown, drop.index);
      let order = shown.order;
      const others: OrderChange<GridRecord>[] = [];
      if (partial(toId)) {
        const before = levelShown[drop.index]?.row.id ?? null;
        const plan = await levelOrders(toUri, node.row.id, (stored) => ({
          kind: "insert",
          index: indexBefore(stored, node.row.id, before),
        }));
        if (!plan) return null;
        order = plan.order;
        others.push(...plan.others);
      } else others.push(...shown.shift);
      if (partial(fromId)) {
        const source = await levelOrders(fromUri, node.row.id, { kind: "remove" });
        if (!source) return null;
        others.push(...source.others);
      } else others.push(...shown.closeGap);
      return writeMove(node, { id: fromId }, { id: toId, uri: toUri }, order, others);
    }
    if (fromId === toId) {
      const step = drop.index - index;
      if (step === 0) return null;
      if (Math.abs(step) === 1) {
        const plan = stepPlan(siblings, index, step < 0 ? -1 : 1);
        if (!plan) return null;
        return writeMove(node, { id: fromId }, { id: toId, uri: toUri }, plan.order, plan.others);
      }
      const plan = reorderPlan(siblings, index, drop.index);
      return writeMove(node, { id: fromId }, { id: toId, uri: toUri }, plan.order, plan.others);
    }
    const level = newParent ? newParent.children : root;
    if (index > 0 && siblings[index - 1]!.row.id === toId && drop.index === level.length) {
      return moveIn(node, siblings, index, fromId);
    }
    const grand = trail.length >= 2 ? trail[trail.length - 2]! : null;
    if (up && (grand ? grand.node.row.id : record.id) === toId && drop.index === up.index + 1) {
      return moveOut(trail, node, siblings, index);
    }
    const plan = dropPlan(siblings, index, level, drop.index);
    return writeMove(node, { id: fromId }, { id: toId, uri: toUri }, plan.order, [...plan.shift, ...plan.closeGap]);
  }

  function onDropPart(drop: DropTarget): Promise<string | null> {
    return runMove(() => dropPart(drop));
  }

  /** After a keyboard arrow, say where the part landed and put focus back on that arrow. */
  async function onArrow(
    detail: number,
    id: string,
    which: "up" | "down" | "out" | "in",
    job: () => Promise<MoveJob | string | null | undefined | void>,
  ) {
    const keyboard = detail === 0;
    const reason = await runMove(job);
    if (!keyboard || reason) return;
    const at = whereIs(id);
    if (!at) return;
    setMoveStatus(`Moved ${at.node.keyword} ${which}. Now ${at.index + 1} of ${at.siblings.length}.`);
    focusAfter.current = { id, which };
    setFocusTick((n) => n + 1);
  }

  async function removeById(id: string): Promise<void> {
    if (removingRef.current || movingRef.current || busyRef.current) return;
    const at = whereIs(id);
    if (!at) return;
    const parent = at.trail[at.trail.length - 1];
    const parentId = parent ? parent.node.row.id : record.id;
    removingRef.current = true;
    busyRef.current = true;
    setBusy(true);
    try {
      let plan: { pre: Gone[]; post: Gone[]; kept: Kept[] };
      try {
        plan = await removalPlan(host, at.node.row, at.node.keyword, parentId, planVault, new Set());
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const guard = msg === REMOVAL_TOO_DEEP || msg === REMOVAL_TOO_MANY;
        const shown = guard
          ? `${msg}. Nothing was removed.`
          : msg.includes("could not be read") || msg.includes("other record")
            ? msg
            : `Could not read the sub-parts of ${at.node.keyword}; nothing was removed.`;
        onNotice(shown);
        void reReadLevels(host, planVault, [parentId], []);
        return;
      }
      const removed = new Set<string>();
      // The card still observes each part's child find. removeQueries would build a new
      // query and read it again, one per deleted part, all at once. Empty the cached
      // children instead. The parent find is re-read once after the loop.
      const clearChildFind = (id: string) => {
        host.setFind(planVault, "a:partOf", id, {
          rows: [],
          total: 0,
          capped: false,
          unread: 0,
        });
      };
      for (const g of plan.post) {
        try {
          await del!.mutateAsync({ id: g.id, entityUri: g.entityUri });
          host.dropPlanFind(planVault, "a:partOf", g.parentId, g.id, { members: [], refresh: false });
          clearChildFind(g.id);
          removed.add(g.id);
        } catch (e) {
          const why = whyOf(e);
          const base =
            removed.size === 0
              ? `Could not remove ${at.node.keyword}; nothing was removed: ${why}.`
              : partialRemoval(plan.pre, removed, why);
          const tail = removed.size === 0 ? null : keptTail(plan.kept);
          onNotice(tail ? `${base} ${tail}` : base);
          for (const id of removed) clearChildFind(id);
          void reReadLevels(host, planVault, [plan.pre[0]?.parentId ?? parentId], []);
          return;
        }
      }
      setConfirmId(null);
      onNotice(keptNotice(at.node.keyword, plan.kept));
      await reReadLevels(host, planVault, [parentId], []);
    } finally {
      removingRef.current = false;
      busyRef.current = false;
      setBusy(false);
    }
  }

  function attemptLeave() {
    if (leavingRef.current || busyRef.current) return;
    const cur = composerRef.current;
    if (!cur) return;
    if (cur.kind === "paste") {
      if (pasteTextRef.current.trim()) {
        setPasteNotice(true);
        return;
      }
      setComposer(null);
      setPasteNotice(false);
      setFailLine(null);
      composerRef.current = null;
      return;
    }
    if (!rowDirty()) {
      setComposer(null);
      setError(null);
      setDiscardAsk(false);
      composerRef.current = null;
      return;
    }
    const problem = keywordProblem(keywordRef.current, { topLevel: topLevelKeyword() });
    if (problem) {
      setError(problem);
      return;
    }
    leavingRef.current = true;
    void run(() => submitAdd()).finally(() => {
      leavingRef.current = false;
    });
  }

  const leaveRef = useRef(attemptLeave);
  leaveRef.current = attemptLeave;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!composerRef.current) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (insideOpenLayer(t)) return;
      if (t instanceof Element && t.closest("[data-help-button]")) return;
      if (addRef.current?.contains(t)) return;
      if (pasteRef.current?.contains(t)) return;
      leaveRef.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen()) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key !== "Escape") return;
      const cur = composerRef.current;
      if (!cur || cur.kind === "paste") return;
      if (!keywordRef.current.trim() && !textRef.current.trim()) return;
      e.preventDefault();
      e.stopPropagation();
      setDiscardAsk(true);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // A choice lasts while its part is open (or the card is in Edit); after that the next edit of the part is a new one.
  useEffect(() => {
    for (const id of [...chosenParts.current]) if (!cardEditing && openId !== id) chosenParts.current.delete(id);
  });

  useEffect(() => {
    if (moving) return;
    const want = focusAfter.current;
    if (!want) return;
    const root = document.querySelector(`[data-part="${want.id}"]`);
    const moves = root?.querySelector("[data-part-moves]");
    const buttons = moves ? [...moves.querySelectorAll("button")] : [];
    const named = (which: "up" | "down" | "out" | "in") =>
      buttons.find((button) => {
        const name = button.getAttribute("aria-label") ?? "";
        if (which === "up") return name.endsWith(" up");
        if (which === "down") return name.endsWith(" down");
        if (which === "out") return name.includes(" out a level");
        return name.includes(" in under") || name.includes(" in (");
      });
    const enabled = (button: Element | undefined): button is HTMLButtonElement =>
      button instanceof HTMLButtonElement && !button.disabled;
    const same = named(want.which);
    const other = named(want.which === "up" ? "down" : want.which === "down" ? "up" : want.which === "out" ? "in" : "out");
    const handle = root?.querySelector('button[aria-label^="Drag"]');
    const target = enabled(same) ? same : enabled(other) ? other : handle instanceof HTMLElement ? handle : null;
    focusAfter.current = null;
    target?.focus();
  }, [focusTick, moving]);

  const wasEditing = useRef(cardEditing);
  useEffect(() => {
    const prev = wasEditing.current;
    wasEditing.current = cardEditing;
    if (prev && !cardEditing) leaveRef.current();
  }, [cardEditing]);

  useEffect(() => {
    if (!wantTextFocus.current) return;
    const el = textInputRef.current;
    if (!el) return;
    wantTextFocus.current = false;
    el.focus();
  });

  function renderLevelNote(id: string): ReactNode {
    return (
      <>
        <PlanFindLimitNote data={noteFor(id)} word="parts" singular="part" onRetry={retryFind} partialSentence={PARTIAL_LEVEL} />
        {findState(id) === "error" ? <p className={quiet}>{PARTIAL_LEVEL}</p> : null}
      </>
    );
  }

  function retryFind() {
    void host.invalidatePlanFind(planVault, "a:partOf", record.id);
    for (const id of parentIds) void host.invalidatePlanFind(planVault, "a:partOf", id);
  }

  function onEnter(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void run(() => submitAdd());
  }

  function renderAddRow() {
    return (
      <div ref={addRef} className="flex w-full flex-col gap-2 py-2">
        {error ? <p className="text-[12px] text-[var(--bad)]">{error}</p> : null}
        <input
          aria-label="Keyword"
          placeholder="Keyword"
          className={`${box} max-w-xs`}
          value={keyword}
          onChange={(e) => {
            keywordTouched.current = true;
            setKeyword(e.target.value);
          }}
          onKeyDown={onEnter}
        />
        <input
          ref={textInputRef}
          aria-label="Text"
          placeholder="Text"
          className={box}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (!keywordTouched.current) setKeyword(suggestKeyword(next));
          }}
          onKeyDown={onEnter}
        />
        {discardAsk ? (
          <div className="flex flex-wrap items-center justify-end gap-2 py-1">
            <p className="mr-auto text-[13px] text-[var(--ink)]">Discard what you typed?</p>
            <PlanButtonRow className="!w-auto">
              <button type="button" className="min-h-11 px-3 text-[15px] text-[var(--ink-soft)]" onClick={() => setDiscardAsk(false)}>
                Keep
              </button>
              <button type="button" className="min-h-11 px-3 text-[15px] font-semibold text-[var(--bad)]" onClick={discardTyped}>
                Discard
              </button>
            </PlanButtonRow>
          </div>
        ) : (
          <PlanButtonRow>
            <button type="button" className="min-h-11 px-3 text-[15px] text-[var(--ink-soft)]" onClick={discardTyped}>
              Discard
            </button>
            <button type="button" className={addAction} disabled={busy} onClick={() => void run(() => submitAdd())}>
              Add
            </button>
          </PlanButtonRow>
        )}
      </div>
    );
  }

  function renderPart(
    node: DescriptionNode<GridRecord>,
    index: number,
    siblings: readonly DescriptionNode<GridRecord>[],
    trail: readonly Trail[],
  ): ReactNode {
    const open = openId === node.row.id;
    const body = partBody(node.row);
    const sub = trail.length > 0;
    const assumption = isAssumptionPart(node.row);
    const prev = index > 0 ? siblings[index - 1] : undefined;
    // In and out never cross between the Assumption part's subtree and the rest: the part would change type.
    const canIn = !!prev && !!prev.row.entityUri && isAssumptionPart(prev.row) === assumption;
    const grand = trail.length >= 2 ? trail[trail.length - 2]!.node : null;
    const canOut = trail.length > 0 && (grand ? !!grand.row.entityUri : !!record.entityUri) && (grand ? isAssumptionPart(grand.row) : false) === assumption;
    const here: Trail = { node, siblings, index };
    const source = readLineSources(servedRaw(node.row, "lineSources"))["a:body"];
    const locked = busy || moving;
    const moveButtons = (
      <div className="flex shrink-0 items-center gap-0" data-part-moves={node.row.id}>
        <button
          type="button"
          aria-label={`Move ${node.keyword} up`}
          className={tap}
          disabled={index === 0 || locked}
          onClick={(e) => void onArrow(e.detail, node.row.id, "up", () => stepById(node.row.id, -1))}
        >
          {"\u2191"}
        </button>
        <button
          type="button"
          aria-label={`Move ${node.keyword} down`}
          className={tap}
          disabled={index === siblings.length - 1 || locked}
          onClick={(e) => void onArrow(e.detail, node.row.id, "down", () => stepById(node.row.id, 1))}
        >
          {"\u2193"}
        </button>
        <button
          type="button"
          aria-label={`Move ${node.keyword} out a level`}
          className={tap}
          disabled={!canOut || locked}
          onClick={(e) => {
            if (locked) return;
            void onArrow(e.detail, node.row.id, "out", () => outById(node.row.id));
          }}
        >
          {"\u2190"}
        </button>
        <button
          type="button"
          aria-label={prev ? `Move ${node.keyword} in under ${prev.keyword}` : `Move ${node.keyword} in (no part above to go under)`}
          className={tap}
          disabled={!canIn || locked}
          onClick={(e) => {
            if (locked) return;
            void onArrow(e.detail, node.row.id, "in", () => inById(node.row.id));
          }}
        >
          {"\u2192"}
        </button>
        {confirmId === node.row.id ? null : (
          <button
            type="button"
            aria-label={`Remove ${node.keyword}`}
            className={tap}
            disabled={locked || undefined}
            onClick={() => {
              if (locked) return;
              setConfirmId(node.row.id);
            }}
          >
            {"\u00d7"}
          </button>
        )}
      </div>
    );
    return (
      <div
        key={node.row.id}
        data-part={node.row.id}
        data-part-tag={node.tag}
        className={`w-full ${cardEditing ? "py-0" : "py-1"} text-[16px] leading-relaxed text-[var(--ink)]${sub ? " pl-6" : ""}`}
      >
        <TreeItem id={node.row.id} label={node.keyword} depth={trail.length} handle={cardEditing}>
          {cardEditing ? (
            // Arrange mode: one 44 px row per part. Keyword, tag and a one-line text on the left, the five buttons on the right.
            <div className="flex min-h-11 w-full items-center gap-1" data-part-row={node.row.id}>
              <div className="flex min-w-0 flex-1 items-baseline gap-1">
                <span className="shrink-0">
                  {sub ? `${EN} ` : null}
                  <button type="button" className="min-h-11 px-3 text-[15px] font-semibold" title={node.tag} onClick={() => onOpen(node.row.id)}>
                    {node.keyword}
                  </button>
                </span>
                <span className="shrink-0 text-[12px] font-normal text-[var(--ink-soft)]">{node.tag}</span>
                {open ? null : (
                  <>
                    <span className="shrink-0" aria-hidden="true">
                      {"\u2014"}
                    </span>
                    <button type="button" className="min-h-11 min-w-0 flex-1 truncate px-3 text-left text-[15px]" title={body} onClick={() => {
                      editBase.current.set(node.row.id, { body, sources: servedRaw(node.row, "lineSources"), etag: node.row.etag ?? null });
                      setOpenId(node.row.id);
                    }}>
                      {body}
                    </button>
                  </>
                )}
              </div>
              {moveButtons}
            </div>
          ) : (
            <div>
              {sub ? `${EN} ` : null}
              <button type="button" className="min-h-11 px-3 text-[15px] font-semibold" title={node.tag} onClick={() => onOpen(node.row.id)}>
                {node.keyword}
              </button>
              {": "}
              {open ? null : canEdit ? (
                <button type="button" className="min-h-11 px-3 text-left text-[15px]" onClick={() => {
                  editBase.current.set(node.row.id, { body, sources: servedRaw(node.row, "lineSources"), etag: node.row.etag ?? null });
                  setOpenId(node.row.id);
                }}>
                  {body}
                </button>
              ) : (
                <span>{body}</span>
              )}
            </div>
          )}
          {confirmId === node.row.id && cardEditing ? (
            <div className="flex flex-wrap justify-end gap-3 py-1">
              <button type="button" className="min-h-11 px-3 text-[15px] text-[var(--ink-soft)]" onClick={() => setConfirmId(null)}>
                Keep
              </button>
              <button
                type="button"
                className="min-h-11 px-3 text-[15px] font-semibold text-[var(--bad)]"
                disabled={locked || undefined}
                onClick={() => {
                  if (locked) return;
                  void run(() => removeById(node.row.id));
                }}
              >
                Confirm delete
              </button>
            </div>
          ) : null}
          {open ? (
            <FieldRow
              label={node.keyword}
              hideLabel
              multiline
              initialEditing
              enterCard={false}
              retainFocusWithinSection
              value={body}
              readOnly={!canEdit}
              onEditingChange={(next) => {
                if (!next) {
                  editBase.current.delete(node.row.id);
                  setOpenId((id) => (id === node.row.id ? null : id));
                }
              }}
              onCommitValue={(v) => {
                void run(() => saveBody(node.row, v).catch((e) => {
                  if (host.isConflict(e)) return;
                  if (e instanceof Error && e.message === WRITE_CONFLICT) return;
                  fail(e);
                }));
              }}
            />
          ) : null}
          {/* Reading: the source sits right under the text, small, no gap. Arrange mode: only an open part shows it (set it there). */}
          {open || (!cardEditing && source) ? (
            <div className="mt-0 text-[12px] leading-tight" data-part-source={node.row.id}>
              <PlanSource
                value={source}
                editing={open}
                vaultId={vaultId}
                record={node.row}
                inputLabel={`${node.keyword} source`}
                onOpen={onOpen}
                onCommit={(next) => {
                  chosenParts.current.add(node.row.id);
                  void run(() => saveSource(node.row, next).catch((e) => {
                    if (host.isConflict(e)) return;
                    if (e instanceof Error && e.message === WRITE_CONFLICT) return;
                    fail(e);
                  }));
                }}
              />
            </div>
          ) : null}
        </TreeItem>
        {node.children.map((child, i) => renderPart(child, i, node.children, [...trail, here]))}
        {renderLevelNote(node.row.id)}
        {canEdit && open && !cardEditing ? (
          <button
            type="button"
            className={addAction}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openComposer({ kind: "sub", parentId: node.row.id })}
          >
            + Sub-part
          </button>
        ) : null}
        {composer?.kind === "sub" && composer.parentId === node.row.id ? renderAddRow() : null}
      </div>
    );
  }

  const solutionTag = recordTag(record.facts);
  const kind = planTypePair(record.typeUri).plainWord as "Solution" | "Function";
  const preview = composer?.kind === "paste" ? pastePreview(pasteText) : null;
  const creatable = preview ? preview.parts.filter((p) => !p.skipped).length : 0;
  const previewRows = preview
    ? [
        ...preview.parts.map((part) => ({ kind: "part" as const, line: part.line, part, why: undefined as string | undefined })),
        ...preview.bad.map((item) => ({ kind: "bad" as const, line: item.line, part: null, why: item.why })),
      ].sort((a, b) => a.line - b.line)
    : [];
  const showWarning = keptWarning || (composer?.kind === "assumption" && assumptionHedge(text));
  // The older text is on this record, not on the parts find. A child find still loading must not hide it.
  const olderBody = partBody(record);
  const showEmpty = !pending && !failed && tree.length === 0 && !olderBody.trim() && composer == null;
  const showTree = !topLoading && !topError;

  return (
    <div className="flex w-full flex-col">
      {failed ? (
        <button type="button" className="min-h-11 px-3 text-[15px] text-[var(--ink-soft)]" onClick={retryFind}>
          Could not read the parts — try again
        </button>
      ) : null}
      {olderBody.trim() ? (
        <div>
          <p className="whitespace-pre-line py-2 text-[16px] leading-relaxed text-[var(--ink)]">{olderBody}</p>
          <PlanSource
            value={readLineSources(rowServedFact(record, "lineSources"))["a:body"]}
            editing={false}
            vaultId={vaultId}
            record={record}
            inputLabel="Older description source"
            onOpen={onOpen}
            onCommit={() => {}}
          />
          <p className="text-[12px] text-[var(--ink-soft)]">
            {tree.length === 0
              ? "Older description — add parts below"
              : "Older description — written before parts. Move its text into parts."}
          </p>
        </div>
      ) : null}
      {showTree ? (
        <SortableTree
          rows={flattenTree(tree, (n) => ({ id: n.row.id, label: n.keyword, children: n.children }))}
          disabled={!cardEditing || busy || moving}
          refuse={refuseMove}
          onDrop={onDropPart}
          status={moveStatus}
        >
          {tree.map((node, i) => renderPart(node, i, tree, []))}
        </SortableTree>
      ) : null}
      {renderLevelNote(record.id)}
      {showEmpty ? <p className="py-2 text-[12px] text-[var(--ink-soft)]">No description yet</p> : null}
      {composer && composer.kind !== "sub" && composer.kind !== "paste" ? renderAddRow() : null}
      {cardEditing ? (
        <div className="flex flex-wrap gap-3 py-1">
          <span className="inline-flex items-center">
            <button type="button" className={addAction} onClick={() => openComposer({ kind: "part" })}>
              + Part
            </button>
            <host.HelpButton label="Help: + Part" title="Help: the Description" startAt="desc-part">
              <DescriptionHelp tag={solutionTag} kind={kind} />
            </host.HelpButton>
          </span>
          <span className="inline-flex items-center">
            <button type="button" className={addAction} onClick={() => openComposer({ kind: "assumption" })}>
              + Assumption
            </button>
            <host.HelpButton label="Help: + Assumption" title="Help: the Description" startAt="desc-assumption">
              <DescriptionHelp tag={solutionTag} kind={kind} />
            </host.HelpButton>
          </span>
          <span className="inline-flex items-center">
            <button
              type="button"
              className={addAction}
              onClick={() => {
                if (!solutionTag) {
                  onNotice(tagFirstNotice(record.typeUri));
                  focusTagInput();
                  return;
                }
                openComposer({ kind: "paste" });
              }}
            >
              Paste parts
            </button>
            <host.HelpButton label="Help: Paste parts" title="Help: the Description" startAt="desc-paste">
              <DescriptionHelp tag={solutionTag} kind={kind} />
            </host.HelpButton>
          </span>
        </div>
      ) : null}
      {composer?.kind === "paste" ? (
        <div ref={pasteRef} className="flex w-full flex-col gap-2 py-2">
          <textarea
            aria-label="Paste parts"
            placeholder="Keyword: text"
            rows={8}
            className={box}
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setFailLine(null);
              setPasteFault(null);
              setVaultTaken([]);
            }}
          />
          {previewRows.length > 0 ? (
            <ul className="flex flex-col gap-1 text-[13px] text-[var(--ink)]">
              {previewRows.map((row) =>
                row.kind === "bad" ? (
                  <li key={`bad-${row.line}`} className="text-[var(--bad)]">
                    {row.why ?? "not a part"}
                  </li>
                ) : (
                  <li key={`part-${row.line}`}>
                    <span>{row.part!.tag}</span>
                    {row.part!.text ? ` ${row.part!.text}` : ""}
                    {row.part!.note ? ` ${row.part!.note}` : row.part!.skipped ? " skipped" : ""}
                  </li>
                ),
              )}
            </ul>
          ) : null}
          {pasteFault ? (
            <p role="alert" className="text-[12px] text-[var(--bad)]">
              {pasteFault}
            </p>
          ) : null}
          {failLine != null ? (
            <p role="alert" className="text-[12px] text-[var(--bad)]">{`Line ${failLine} was not written.`}</p>
          ) : null}
          {pasteNotice ? <p className={quiet}>{`Not created yet — Create ${creatable} ${plural(creatable, "part")} or Discard`}</p> : null}
          <PlanButtonRow>
            <button type="button" className="min-h-11 px-3 text-[15px] text-[var(--ink-soft)]" onClick={discardPaste}>
              Discard
            </button>
            <button type="button" className={addAction} disabled={creatable === 0 || busy} onClick={() => void run(() => writePaste())}>
              {`Create ${creatable} ${plural(creatable, "part")}`}
            </button>
          </PlanButtonRow>
        </div>
      ) : null}
      {showWarning ? <p className="text-[12px] text-[var(--ink-soft)]">{ASSUMPTION_WARNING}</p> : null}
    </div>
  );
}
