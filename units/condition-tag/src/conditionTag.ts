/** The stored spelling of the tag on a condition. */
export const CONDITION_UNIT_TAG_RAW = "a:unitTag";
/** The stored spelling of the tag's scope. */
export const CONDITION_TAG_SCOPE_RAW = "a:tagScope";
/** The spelling after the app has stripped one leading a:. */
export const CONDITION_UNIT_TAG_FRAMED = "unitTag";
/** The spelling after the app has stripped one leading a:. */
export const CONDITION_TAG_SCOPE_FRAMED = "tagScope";

/**
 * A condition the app already holds. Extra keys are kept.
 * `op` and `tag` are the only names this unit reads besides the four constants.
 */
export interface ConditionTagFacts {
  op?: string;
  tag?: unknown;
  [key: string]: unknown;
}

/**
 * The tag to show, or to put back in an edit box.
 * Framed unitTag, then a:unitTag, then a bare `tag` only when op is exactly "manual".
 * The returned text is not trimmed. Blank and whitespace-only do not count, and they
 * do not hide the next spelling.
 */
export function conditionUnitTag(condition: ConditionTagFacts): string | undefined {
  const framed = condition[CONDITION_UNIT_TAG_FRAMED];
  if (typeof framed === "string" && framed.trim() !== "") return framed;
  const raw = condition[CONDITION_UNIT_TAG_RAW];
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  if (condition.op === "manual") {
    const bare = condition.tag;
    if (typeof bare === "string" && bare.trim() !== "") return bare;
  }
  return undefined;
}

/**
 * The tag that was actually assigned. Framed unitTag, then a:unitTag.
 * A bare `tag` is never an assignment, including when op is "manual".
 * Returned text is not trimmed.
 */
export function conditionUnitTagCarrier(condition: ConditionTagFacts): string | undefined {
  const framed = condition[CONDITION_UNIT_TAG_FRAMED];
  if (typeof framed === "string" && framed.trim() !== "") return framed;
  const raw = condition[CONDITION_UNIT_TAG_RAW];
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return undefined;
}

/**
 * Put the framed keys back under the stored names, and drop the framed keys.
 * A bare `tag` is left where it is. Other keys are copied. The input is not changed.
 * If both spellings are present, the framed value replaces the stored one.
 */
export function invertConditionTagCarriers(condition: ConditionTagFacts): ConditionTagFacts {
  const next: ConditionTagFacts = { ...condition };
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
