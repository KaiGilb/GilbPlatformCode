/**
 * Whether one condition left the list the vault served, and the array to write
 * when removing one by position.
 *
 * A condition has no id. Sameness is the canonical text from
 * `canonicaliseCondition`, not object identity and not the `text` field alone.
 *
 * `removeConditionAt` is the array to send. It shortens by one. It throws on a
 * bad index and returns [] when the last condition is removed. It never returns
 * null. A null would clear the whole attribute, which is a different act.
 *
 * `confirmConditionRemoval` compares the vault's own before list with the
 * vault's own after list. It does not look at the request body. Every arm runs,
 * in this order:
 *   1. target-not-present-before
 *   2. count-not-exactly-one
 *   3. target-multiplicity-wrong
 *   4. sibling-did-not-survive
 *   5. served-order-differs
 *
 * Arm 5 checks order. Arm 4 does not: it sorts. A list that contains the right
 * conditions in the wrong order fails arm 5 and can still pass arm 4.
 * Do not drop arm 5 because the earlier arms already passed on one page.
 *
 * Two conditions with the same canonical text are copies, not one. Removing one
 * must leave the other. That is a count, not "is it still there".
 * Step ids use step-removal, which is the opposite rule.
 *
 * The private carrier flip must stay in agreement with
 * `units/condition-tag` `invertConditionTagCarriers`. This folder does not
 * import that package. Framed `unitTag` / `tagScope` are written back as
 * `a:unitTag` / `a:tagScope`. A bare `tag` is left alone. If both spellings of
 * one carrier are present, the framed value replaces the stored one.
 *
 * Canonical form folds those two pairs at the top level only, and only when
 * exactly one spelling is present. Both spellings on one condition are kept
 * apart, so they do not compare equal to either spelling alone. No other `a:`
 * key is folded. `a:title` and `title` are different. Do not strip every `a:`.
 */

const CONDITION_UNIT_TAG_RAW = "a:unitTag";
const CONDITION_TAG_SCOPE_RAW = "a:tagScope";
const CONDITION_UNIT_TAG_FRAMED = "unitTag";
const CONDITION_TAG_SCOPE_FRAMED = "tagScope";

const CONDITION_CARRIER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [CONDITION_UNIT_TAG_FRAMED, CONDITION_UNIT_TAG_RAW],
  [CONDITION_TAG_SCOPE_FRAMED, CONDITION_TAG_SCOPE_RAW],
];

export type ConditionFacts = Record<string, unknown>;

export type ConditionRemovalArm =
  | "target-not-present-before"
  | "count-not-exactly-one"
  | "target-multiplicity-wrong"
  | "sibling-did-not-survive"
  | "served-order-differs";

export type ConditionRemovalVerdict =
  | { confirmed: true }
  | { confirmed: false; failedArms: ConditionRemovalArm[] };

function isConditionList(
  value: readonly ConditionFacts[] | ConditionFacts,
): value is readonly ConditionFacts[] {
  return Array.isArray(value);
}

function asConditionArray(
  conditions: readonly ConditionFacts[] | ConditionFacts | null | undefined,
): ConditionFacts[] {
  if (conditions == null) return [];
  if (isConditionList(conditions)) return [...conditions];
  return [conditions];
}

function invertConditionTagCarriers(condition: ConditionFacts): ConditionFacts {
  const next: ConditionFacts = { ...condition };
  if (Object.prototype.hasOwnProperty.call(next, CONDITION_UNIT_TAG_FRAMED)) {
    next[CONDITION_UNIT_TAG_RAW] = next[CONDITION_UNIT_TAG_FRAMED];
    delete next[CONDITION_UNIT_TAG_FRAMED];
  }
  if (Object.prototype.hasOwnProperty.call(next, CONDITION_TAG_SCOPE_FRAMED)) {
    next[CONDITION_TAG_SCOPE_RAW] = next[CONDITION_TAG_SCOPE_FRAMED];
    delete next[CONDITION_TAG_SCOPE_FRAMED];
  }
  return next;
}

function canonicalConditionKey(key: string): string {
  for (const pair of CONDITION_CARRIER_PAIRS) {
    const framed = pair[0];
    const raw = pair[1];
    if (framed !== undefined && raw !== undefined && key === raw) return framed;
  }
  return key;
}

function canonicaliseValue(value: unknown): string {
  if (value === undefined) return "\u0000undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicaliseValue).join(",")}]`;
  if (typeof value === "object") return canonicaliseObject(value as Record<string, unknown>, false);
  return JSON.stringify(value);
}

function canonicaliseObject(obj: Record<string, unknown>, foldCarriers: boolean): string {
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(obj)) {
    const canon = foldCarriers ? canonicalConditionKey(key) : key;
    const bucket = groups.get(canon);
    if (bucket) bucket.push(key);
    else groups.set(canon, [key]);
  }
  const entries: string[] = [];
  for (const [canon, sourceKeys] of groups) {
    if (sourceKeys.length === 1) {
      const only = sourceKeys[0];
      if (only === undefined) continue;
      entries.push(`${JSON.stringify(canon)}:${canonicaliseValue(obj[only])}`);
      continue;
    }
    for (const key of [...sourceKeys].sort()) {
      entries.push(`${JSON.stringify(`\u0000ambiguous:${key}`)}:${canonicaliseValue(obj[key])}`);
    }
  }
  entries.sort();
  return `{${entries.join(",")}}`;
}

/** The comparison text of one condition. Key order does not matter. See the file note. */
export function canonicaliseCondition(condition: ConditionFacts): string {
  return canonicaliseObject(condition, true);
}

/**
 * The conditions array with the member at `index` removed, carriers flipped to
 * the stored spelling. Throws when `index` is not an integer inside the list.
 * A single object is a one-element list. Null and undefined are an empty list,
 * so any index throws. The input list is not changed.
 */
export function removeConditionAt(
  conditions: readonly ConditionFacts[] | ConditionFacts | null | undefined,
  index: number,
): ConditionFacts[] {
  const items = asConditionArray(conditions);
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new Error(`removeConditionAt: index out of range (${index}, length ${items.length})`);
  }

  const writeReady = items.filter((_, i) => i !== index).map((c) => invertConditionTagCarriers(c));

  if (writeReady.length !== items.length - 1) {
    throw new Error("removeConditionAt: length mismatch after removal");
  }
  if (!writeReady.every((m) => m != null)) {
    throw new Error("removeConditionAt: null/undefined member after removal");
  }
  return writeReady;
}

export function confirmConditionRemoval(args: {
  servedBefore: readonly ConditionFacts[];
  servedAfter: readonly ConditionFacts[];
  index: number;
  clickedCondition: ConditionFacts;
}): ConditionRemovalVerdict {
  const { servedBefore, servedAfter, index, clickedCondition } = args;
  const beforeCanon = servedBefore.map(canonicaliseCondition);
  const afterCanon = servedAfter.map(canonicaliseCondition);
  const clickedCanon = canonicaliseCondition(clickedCondition);
  const inRange = Number.isInteger(index) && index >= 0 && index < beforeCanon.length;
  const atIndex = inRange ? beforeCanon[index] : undefined;
  const targetCanon = atIndex !== undefined ? atIndex : clickedCanon;
  const failedArms: ConditionRemovalArm[] = [];
  const occurrences = (xs: string[], v: string) => xs.reduce((n, x) => (x === v ? n + 1 : n), 0);

  if (!inRange || beforeCanon[index] !== clickedCanon) failedArms.push("target-not-present-before");

  if (afterCanon.length !== beforeCanon.length - 1) failedArms.push("count-not-exactly-one");

  if (occurrences(afterCanon, targetCanon) !== occurrences(beforeCanon, targetCanon) - 1) {
    failedArms.push("target-multiplicity-wrong");
  }

  const remaining = beforeCanon.slice();
  const dropAt = inRange ? index : remaining.indexOf(targetCanon);
  if (dropAt >= 0) remaining.splice(dropAt, 1);
  const sortedRemaining = remaining.slice().sort();
  const sortedAfter = afterCanon.slice().sort();
  if (
    sortedRemaining.length !== sortedAfter.length ||
    sortedRemaining.some((v, i) => v !== sortedAfter[i])
  ) {
    failedArms.push("sibling-did-not-survive");
  }

  const expectedCanon = inRange
    ? removeConditionAt(servedBefore, index).map(canonicaliseCondition)
    : null;
  if (
    expectedCanon == null ||
    expectedCanon.length !== afterCanon.length ||
    expectedCanon.some((v, i) => v !== afterCanon[i])
  ) {
    failedArms.push("served-order-differs");
  }

  return failedArms.length === 0 ? { confirmed: true } : { confirmed: false, failedArms };
}
