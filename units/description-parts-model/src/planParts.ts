// Description parts of a Solution or Solution Constraint. One record per Keyword line.
// A tag needs a Keyword, so "Assumption: <sentence>" is not a part. "Assumption:" alone
// starts the section; "Assumption: Keyword: text" is one assumption under it.

import { readLineSources, rowServedFact, type PlanSourceValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { duplicateTagSentence, isTypeName, pointsAt, recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { planStep } from "./planLevelRead";

/** A list row. A record that has no `updatedAt` yet is stamped as just read. */
export function asGrid(row: BaseRecord): GridRecord {
  return typeof (row as GridRecord).updatedAt === "number" ? (row as GridRecord) : { ...row, updatedAt: Date.now() };
}

export const KEYWORD_MESSAGE = "Keyword: letters only, starting with a capital, e.g. Sync";
export const ASSUMPTION_WARNING =
  "An assumption is a plain claim a test can prove wrong: no may, might, could or expected to.";
/** Top-level Keyword only. A sub-part may still be named Assumption. */
export const ASSUMPTION_KEPT = "Assumption is kept for the assumptions. Use + Assumption.";
export const ASSUMPTION_ELEMENT =
  "There is a part called Assumption that is not an assumption. Rename or remove it, then + Assumption works.";
export const PARENT_NOT_A_PART = "not written: its parent is not a part here";

const KEYWORD = /^[A-Z][a-zA-Z]*$/;
const LETTERS = /^[A-Za-z]+$/;
const HEDGE = /\b(?:may|might|could|expected to)\b/i;
const SOURCE_TAIL = /^(.*) <- (.*)$/;
const DASH_PART = /^((?:(?:-|\u2013)\s+)+)([A-Z][a-zA-Z]*):\s*(.*)$/;
const DASH_MARK = /(?:-|\u2013)\s+/g;
const DASH_START = /^(?:-|\u2013)\s+/;
const ASSUMPTION_MARKER = /^Assumption:\s*$/;
const ASSUMPTION_NAMED = /^Assumption:\s*([A-Z][a-zA-Z]*):\s*(.*)$/;
const TOP_PART = /^([A-Z][a-zA-Z]*):\s*(.*)$/;

export type PartRow = {
  id: string;
  entityUri?: string;
  typeUri: string;
  facts: Record<string, string>;
  served?: { facts?: Readonly<Record<string, unknown>> };
};

export type DescriptionNode<T extends PartRow = PartRow> = {
  row: T;
  tag: string;
  keyword: string;
  order: number;
  children: DescriptionNode<T>[];
};

export type PastePart = {
  line: number;
  tag: string;
  text: string;
  source: string | null;
  skipped: boolean;
  /** Set when the line is not written because its parent is not a part of this card. */
  note: string | null;
  assumption: boolean;
  top: boolean;
  parentTag: string | null;
};

export type PastePreview = {
  parts: PastePart[];
  bad: { line: number; why?: string }[];
};

/** `topLevel` reserves the Keyword Assumption (any case) for + Assumption. */
export function keywordProblem(raw: string, opts?: { topLevel?: boolean }): string | null {
  const name = raw.trim();
  if (opts?.topLevel && name.toLowerCase() === "assumption") return ASSUMPTION_KEPT;
  return KEYWORD.test(name) ? null : KEYWORD_MESSAGE;
}

/** The token before `:`, when it has a digit or other non-letter. A letters-only word, even in the wrong case, is not this case. */
function keywordWithNonLetter(raw: string): string | null {
  const body = raw.replace(/^(?:(?:-|\u2013)\s+)+/, "");
  const colon = body.indexOf(":");
  if (colon <= 0) return null;
  const keyword = body.slice(0, colon).trim();
  if (!keyword || LETTERS.test(keyword) || /^assumption$/i.test(keyword)) return null;
  return keyword;
}

function lettersOnlyWhy(keyword: string): string {
  return `not a part: a Keyword is letters only (${keyword} is not)`;
}

/** First word, letters only, first letter capital. `"walking on legs"` → `"Walking"`. */
export function suggestKeyword(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  const letters = first.replace(/[^A-Za-z]/g, "");
  if (!letters) return "";
  return letters.charAt(0).toUpperCase() + letters.slice(1);
}

export function assumptionHedge(text: string): boolean {
  return HEDGE.test(text);
}

export function partKeyword(tag: string): string {
  const parts = tag.split(".").filter((s) => s.length > 0);
  return parts.length ? parts[parts.length - 1]! : "";
}

function partFact(row: PartRow, slug: string): unknown {
  return rowServedFact(row, slug);
}

export function partBody(row: PartRow): string {
  const raw = partFact(row, "body");
  return typeof raw === "string" ? raw : "";
}

/** Sibling order. Missing, or not a finite number, is NaN (it does not raise the next order). */
export function partOrder(row: PartRow): number {
  const raw = partFact(row, "elementOrder");
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
}

/** `a:lineSources` on a part, in whatever spelling the vault served. */
export function partLineSources(row: PartRow): Record<string, PlanSourceValue> {
  return readLineSources(partFact(row, "lineSources"));
}

export function nextOrder(orders: readonly number[]): number {
  let max = 0;
  let any = false;
  for (const n of orders) {
    if (!Number.isFinite(n)) continue;
    any = true;
    if (n > max) max = n;
  }
  return any ? max + 1 : 1;
}

export function tagTaken(pool: readonly { facts: Record<string, string> }[], tag: string): boolean {
  const want = tag.trim();
  if (!want) return false;
  return pool.some((r) => recordTag(r.facts) === want);
}

export function duplicatePartTag(tag: string): string {
  return duplicateTagSentence(tag);
}

/** Equal orders break by tag, then id. A missing tag is "" so it ties with another missing tag. */
export function comparePartTie(tagA: string, idA: string, tagB: string, idB: string): number {
  const byTag = tagA.localeCompare(tagB);
  if (byTag !== 0) return byTag;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

function byOrder<T extends PartRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const oa = Number.isFinite(partOrder(a)) ? partOrder(a) : Number.POSITIVE_INFINITY;
    const ob = Number.isFinite(partOrder(b)) ? partOrder(b) : Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return comparePartTie(recordTag(a.facts), a.id, recordTag(b.facts), b.id);
  });
}

function nodeOf<T extends PartRow>(row: T): DescriptionNode<T> {
  const tag = recordTag(row.facts);
  return { row, tag, keyword: partKeyword(tag), order: partOrder(row), children: [] };
}

/**
 * Parts at any depth. A part belongs to the part (or the Solution) its `a:partOf` names.
 * Siblings are ordered by element order, then tag, then id. A part is read once (a loop in the data cannot repeat it).
 */
export function descriptionTree<T extends PartRow>(
  solution: { id: string; entityUri?: string },
  pool: readonly T[],
): DescriptionNode<T>[] {
  const parts = pool.filter(
    (r) => isTypeName(r.typeUri, "SpecificationElement") || isTypeName(r.typeUri, "Assumption"),
  );
  const seen = new Set<string>();
  const level = (owner: { id: string; entityUri?: string }): DescriptionNode<T>[] => {
    const own = byOrder(parts.filter((r) => !seen.has(r.id) && pointsAt(r, "partOf", owner)));
    for (const r of own) seen.add(r.id);
    return own.map((row) => {
      const node = nodeOf(row);
      node.children = level(row);
      return node;
    });
  };
  return level(solution);
}

/** The order a part is read at: its own, or its place in the list (from 1) when it has none. */
export function effectiveOrder(list: readonly { order: number }[], index: number): number {
  const own = list[index]?.order;
  return Number.isFinite(own) ? (own as number) : index + 1;
}

export function isAssumptionPart(row: { typeUri: string }): boolean {
  return isTypeName(row.typeUri, "Assumption");
}

/** A Description part: a specification element or an assumption. Not any other type that names a part-of. */
export function isPartType(typeUri: string): boolean {
  return isTypeName(typeUri, "SpecificationElement") || isTypeName(typeUri, "Assumption");
}

export type OrderChange<T extends PartRow = PartRow> = { node: DescriptionNode<T>; order: number };

/**
 * One place up or down on a full level. The siblings are the stored level, in the order they are shown.
 * A clean pair swaps the two stored orders. A duplicate or a missing order numbers the level 1..n,
 * and only a part whose stored order is not already that number is listed.
 * A duplicated order is not a settled place, so that part is listed even when the new number matches.
 * Null at either end.
 */
export function stepPlan<T extends PartRow>(
  siblings: readonly DescriptionNode<T>[],
  index: number,
  dir: -1 | 1,
): { order: number; others: OrderChange<T>[] } | null {
  const to = index + dir;
  if (index < 0 || to < 0 || index >= siblings.length || to >= siblings.length) return null;
  const moved = siblings[index]!;
  const plan = planStep(
    siblings.map((node) => ({ id: node.row.id, order: Number.isFinite(node.order) ? node.order : null })),
    moved.row.id,
    dir,
  );
  if (!plan) return null;
  const head = plan.writes[0];
  if (!head) return null;
  const byId = new Map(siblings.map((node) => [node.row.id, node]));
  const others: OrderChange<T>[] = [];
  for (const write of plan.writes.slice(1)) {
    const node = byId.get(write.id);
    if (node) others.push({ node, order: write.order });
  }
  return { order: head.order, others };
}

/** Siblings below `index` take the places the list had, so the gap `index` leaves is closed. Only changes are listed. */
export function closeGap<T extends PartRow>(siblings: readonly DescriptionNode<T>[], index: number): OrderChange<T>[] {
  const out: OrderChange<T>[] = [];
  for (let k = index + 1; k < siblings.length; k++) {
    const order = effectiveOrder(siblings, k - 1);
    if (siblings[k]!.order !== order) out.push({ node: siblings[k]!, order });
  }
  return out;
}

/** "In": the part becomes the last child of the sibling above it. Null when there is no sibling above. */
export function moveInPlan<T extends PartRow>(
  siblings: readonly DescriptionNode<T>[],
  index: number,
): { parent: DescriptionNode<T>; order: number; closeGap: OrderChange<T>[] } | null {
  const parent = siblings[index - 1];
  if (!parent || index < 1) return null;
  let last = 0;
  for (let k = 0; k < parent.children.length; k++) last = Math.max(last, effectiveOrder(parent.children, k));
  return { parent, order: last + 1, closeGap: closeGap(siblings, index) };
}

/**
 * "Out": the part moves to its parent's level, directly after its parent. The later siblings of that level go up by one;
 * the gap at the old level is closed. `ownSiblings` is the parent's children, `parentSiblings` is the parent's level.
 */
export function moveOutPlan<T extends PartRow>(
  ownSiblings: readonly DescriptionNode<T>[],
  index: number,
  parentSiblings: readonly DescriptionNode<T>[],
  parentIndex: number,
): { order: number; shift: OrderChange<T>[]; closeGap: OrderChange<T>[] } {
  const shift: OrderChange<T>[] = [];
  for (let k = parentIndex + 1; k < parentSiblings.length; k++) {
    shift.push({ node: parentSiblings[k]!, order: effectiveOrder(parentSiblings, k) + 1 });
  }
  return { order: effectiveOrder(parentSiblings, parentIndex) + 1, shift, closeGap: closeGap(ownSiblings, index) };
}

/**
 * A drop within one level: the part goes from place `from` to place `to` (counted without it). The places keep the orders the
 * list had, strictly rising, so the parts in between move up or down one place; only a part whose order changes is listed.
 * Moving one place gives the same two writes as the up and down buttons: the part, then its neighbour.
 */
export function reorderPlan<T extends PartRow>(
  siblings: readonly DescriptionNode<T>[],
  from: number,
  to: number,
): { order: number; others: OrderChange<T>[] } {
  const slots: number[] = [];
  for (let k = 0; k < siblings.length; k++) {
    const own = effectiveOrder(siblings, k);
    slots.push(k > 0 ? Math.max(own, slots[k - 1]! + 1) : own);
  }
  const moved = siblings[from]!;
  const rest = siblings.filter((_, k) => k !== from);
  const next = [...rest.slice(0, to), moved, ...rest.slice(to)];
  const others: OrderChange<T>[] = [];
  next.forEach((node, k) => {
    if (node === moved || node.order === slots[k]) return;
    others.push({ node, order: slots[k]! });
  });
  return { order: slots[next.indexOf(moved)]!, others };
}

/**
 * A drop onto another level: the part goes to place `targetIndex` among `target` (the new parent's children, the part not in
 * them). It takes that place's order; the parts from there on go up only as far as they must; the gap it leaves at the old
 * level is closed. Dropped last, it gets the largest order + 1, as "in" does; dropped after its parent's place it gets the
 * order "out" does, with the later siblings above it going up.
 */
export function dropPlan<T extends PartRow>(
  ownSiblings: readonly DescriptionNode<T>[],
  index: number,
  target: readonly DescriptionNode<T>[],
  targetIndex: number,
): { order: number; shift: OrderChange<T>[]; closeGap: OrderChange<T>[] } {
  const shift: OrderChange<T>[] = [];
  let order: number;
  if (targetIndex >= target.length) {
    let last = 0;
    for (let k = 0; k < target.length; k++) last = Math.max(last, effectiveOrder(target, k));
    order = last + 1;
  } else {
    const before = targetIndex > 0 ? effectiveOrder(target, targetIndex - 1) : Number.NEGATIVE_INFINITY;
    order = Math.max(effectiveOrder(target, targetIndex), before + 1);
    let floor = order;
    for (let k = targetIndex; k < target.length; k++) {
      const own = target[k]!.order;
      if (Number.isFinite(own) && own > floor) break;
      floor += 1;
      shift.push({ node: target[k]!, order: floor });
    }
  }
  return { order, shift, closeGap: closeGap(ownSiblings, index) };
}

/**
 * The paste template. Blank lines are skipped. A trailing ` <- Source` is that part's text source.
 * Depth is the number of leading `- ` marks, plus one for every two spaces (or a tab) of indent.
 * A line that is not a Keyword part is `bad` (shown as "not a part", not written).
 * `lawfulParentTags` is this card's part tags. When it is passed, a line whose parent was not
 * made and is not one of those parts is skipped: it is not attached to some other record.
 */
export function previewPaste(
  text: string,
  solutionTag: string,
  taken: (tag: string) => boolean,
  lawfulParentTags?: ReadonlySet<string>,
): PastePreview {
  const parts: PastePart[] = [];
  const bad: { line: number; why?: string }[] = [];
  const seen = new Set<string>();
  const willWrite = new Set<string>();
  // stack[d] is the last part read at depth d; a part at depth d + 1 is its child.
  let stack: { tag: string; assumption: boolean }[] = [];
  const parent = solutionTag.trim();

  const push = (part: Omit<PastePart, "skipped" | "note">) => {
    let skipped = seen.has(part.tag) || taken(part.tag);
    let note: string | null = null;
    if (lawfulParentTags && !part.top && part.parentTag) {
      const parentReady = lawfulParentTags.has(part.parentTag) || willWrite.has(part.parentTag);
      // The assumptions' parent is created with the line. It is not looked up as some other record.
      const assumptionParent = part.assumption && part.parentTag.endsWith(".Assumption");
      if (!parentReady && !assumptionParent) {
        skipped = true;
        note = PARENT_NOT_A_PART;
      }
    }
    seen.add(part.tag);
    if (!skipped) willWrite.add(part.tag);
    parts.push({ ...part, skipped, note });
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const untrimmed = lines[i]!.replace(/\s+$/, "");
    if (!untrimmed.trim()) continue;
    let raw = untrimmed.trim();
    let source: string | null = null;
    const src = raw.match(SOURCE_TAIL);
    if (src) {
      raw = src[1]!.trim();
      const words = src[2]!.trim();
      source = words || null;
    }
    if (!raw) {
      bad.push({ line });
      continue;
    }
    const dash = raw.match(DASH_PART);
    if (dash) {
      const indent = untrimmed.match(/^[ \t]*/)![0].replace(/\t/g, "  ").length;
      const depth = (dash[1]!.match(DASH_MARK) ?? []).length + Math.floor(indent / 2);
      const up = stack[depth - 1];
      if (!up || !parent) {
        bad.push({ line });
        continue;
      }
      const keyword = dash[2]!;
      const tag = `${up.tag}.${keyword}`;
      push({
        line,
        tag,
        text: dash[3]!.trim(),
        source,
        assumption: up.assumption,
        top: false,
        parentTag: up.tag,
      });
      stack = [...stack.slice(0, depth), { tag, assumption: up.assumption }];
      continue;
    }
    if (DASH_START.test(raw)) {
      const keyword = keywordWithNonLetter(raw);
      bad.push(keyword ? { line, why: lettersOnlyWhy(keyword) } : { line });
      continue;
    }
    if (!parent) {
      bad.push({ line });
      continue;
    }
    if (ASSUMPTION_MARKER.test(raw)) {
      stack = [{ tag: `${parent}.Assumption`, assumption: true }];
      continue;
    }
    const named = raw.match(ASSUMPTION_NAMED);
    if (named) {
      const keyword = named[1]!;
      const parentTag = `${parent}.Assumption`;
      const tag = `${parentTag}.${keyword}`;
      push({
        line,
        tag,
        text: named[2]!.trim(),
        source,
        assumption: true,
        top: false,
        parentTag,
      });
      stack = [{ tag: parentTag, assumption: true }, { tag, assumption: true }];
      continue;
    }
    if (/^Assumption:/i.test(raw)) {
      const head = raw.slice(0, raw.indexOf(":")).trim();
      const why = keywordProblem(head, { topLevel: true });
      bad.push(why ? { line, why } : { line });
      stack = [];
      continue;
    }
    const top = raw.match(TOP_PART);
    if (!top) {
      const keyword = keywordWithNonLetter(raw);
      bad.push(keyword ? { line, why: lettersOnlyWhy(keyword) } : { line });
      continue;
    }
    const keyword = top[1]!;
    const reserved = keywordProblem(keyword, { topLevel: true });
    if (reserved === ASSUMPTION_KEPT) {
      bad.push({ line, why: reserved });
      stack = [];
      continue;
    }
    const tag = `${parent}.${keyword}`;
    stack = [{ tag, assumption: false }];
    push({
      line,
      tag,
      text: top[2]!.trim(),
      source,
      assumption: false,
      top: true,
      parentTag: null,
    });
  }
  return { parts, bad };
}
