/**
 * Ordinals for process steps.
 *
 * A new step takes one more than the highest finite number already stored.
 * A drag plans writes only for the steps whose stored number is not already
 * the dense position they just landed in. A create writes that number as a
 * number, and the owning process as `{ "@id": address }`, not as a string.
 */

export type StepOrderRecord = {
  "@id": string;
  stepOrder?: number | null;
  "step-order"?: number | null;
};

export type StepReorderWrite = {
  /** Last slash segment of `@id`. A query stays on it. Not decoded. */
  stepIdTail: string;
  /** Dense 1-based position in the new order. */
  targetOrdinal: number;
  /** True when the record has its own `step-order` key, even if the value is null. */
  retireKebab: boolean;
};

export type StepReorderPlan = {
  /** Same step objects, new array. Not a deep copy. */
  newOrder: StepOrderRecord[];
  /** Only the steps whose stored number is not the new position. Ascending. */
  writes: StepReorderWrite[];
};

function wireField(doc: Record<string, unknown>, camel: string, kebab: string): unknown {
  if (doc[camel] !== undefined && doc[camel] !== null) return doc[camel];
  if (doc[kebab] !== undefined && doc[kebab] !== null) return doc[kebab];
  return undefined;
}

function slashTail(value: string): string {
  const marker = value.lastIndexOf("/");
  return marker === -1 ? value : value.slice(marker + 1);
}

/**
 * The ordinal a new step takes at the end of the list you pass.
 *
 * Starts at 0. A finite number strictly greater than the running max replaces
 * it. The result is that max plus 1, and at least 1.
 *
 * Camel `stepOrder` wins over kebab `step-order`, including when the camel
 * value is `0`. `0` is not greater than the start, so it does not raise the
 * max, and it does hide the kebab value. Null and a missing key fall through.
 * A string, `NaN`, a negative, and `Infinity` are ignored.
 */
export function nextStepOrder(steps: readonly Record<string, unknown>[]): number {
  let max = 0;
  for (const step of steps) {
    const served = wireField(step, "stepOrder", "step-order");
    if (typeof served === "number" && Number.isFinite(served) && served > max) max = served;
  }
  return max + 1;
}

/**
 * Plan a drag from `fromIndex` to `toIndex` in the array you already have.
 *
 * The same index, or an index outside the array, returns a shallow copy and
 * no writes. It does not throw, and it does not heal a messy numbering.
 * Healing happens only when a real move is planned: every position whose
 * stored number is not its new 1-based index is a write. Positions that
 * already match are omitted.
 *
 * `retireKebab` is true when the key `step-order` is present on that object.
 * The caller deletes that key. This function does not.
 *
 * Writes are sorted by the new ordinal. The loop already produces that order.
 */
export function computeStepReorder(steps: readonly StepOrderRecord[], fromIndex: number, toIndex: number): StepReorderPlan {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= steps.length ||
    toIndex >= steps.length
  ) {
    return { newOrder: steps.slice(), writes: [] };
  }

  const newOrder = steps.slice();
  const moved = newOrder.splice(fromIndex, 1)[0];
  if (moved === undefined) return { newOrder, writes: [] };
  newOrder.splice(toIndex, 0, moved);

  const writes: StepReorderWrite[] = [];
  for (let i = 0; i < newOrder.length; i++) {
    const step = newOrder[i];
    if (step === undefined) continue;
    const targetOrdinal = i + 1;
    const served = wireField(step, "stepOrder", "step-order");
    if (served === targetOrdinal) continue;
    writes.push({
      stepIdTail: slashTail(step["@id"]),
      targetOrdinal,
      retireKebab: Object.prototype.hasOwnProperty.call(step, "step-order"),
    });
  }

  writes.sort((a, b) => a.targetOrdinal - b.targetOrdinal);
  return { newOrder, writes };
}

/**
 * Facts for a new step. Not a request.
 *
 * `processOf` is `{ "@id": processEntityUri }`. A string in that slot is a
 * different value. `stepOrder` is the number you pass. It is not turned into
 * a string.
 *
 * `instruction` is trimmed. Empty or whitespace-only is omitted. The key is
 * absent, not `""`.
 */
export function buildStepCreateFacts(
  processEntityUri: string,
  order: number,
  instruction: string,
): { processOf: { "@id": string }; stepOrder: number; instruction?: string } {
  const facts: { processOf: { "@id": string }; stepOrder: number; instruction?: string } = {
    processOf: { "@id": processEntityUri },
    stepOrder: order,
  };
  const text = instruction.trim();
  if (text !== "") facts.instruction = text;
  return facts;
}
