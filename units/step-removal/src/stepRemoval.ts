/**
 * Whether one step id left the list the vault served.
 *
 * Every arm runs. A refusal names every arm that failed, in this order:
 *   1. not-present-before
 *   2. count-not-exactly-one
 *   3. deleted-id-still-served
 *   4. sibling-did-not-survive
 *
 * This is not the condition check. A step is an id. Presence is "the id occurs
 * at least once", not "the id occurs one fewer time". Two copies of the same
 * id cannot be confirmed down to one copy: the id is still in the after list,
 * so deleted-id-still-served fails. Do not switch this to a count of copies.
 * Conditions, which have no id, use condition-removal for that.
 *
 * Ids are compared as given. They are not trimmed and not lower-cased.
 * The order of the after list does not matter. The length of the after list does.
 */

export type StepRemovalArm =
  | "not-present-before"
  | "count-not-exactly-one"
  | "deleted-id-still-served"
  | "sibling-did-not-survive";

export type StepRemovalVerdict =
  | { confirmed: true }
  | { confirmed: false; failedArms: StepRemovalArm[] };

export function confirmStepRemoval(args: {
  beforeIds: readonly string[];
  afterIds: readonly string[];
  deletedId: string;
}): StepRemovalVerdict {
  const { beforeIds, afterIds, deletedId } = args;
  const after = new Set(afterIds);
  const failedArms: StepRemovalArm[] = [];

  if (!beforeIds.includes(deletedId)) failedArms.push("not-present-before");

  if (afterIds.length !== beforeIds.length - 1) failedArms.push("count-not-exactly-one");

  if (after.has(deletedId)) failedArms.push("deleted-id-still-served");

  if (beforeIds.some((id) => id !== deletedId && !after.has(id))) {
    failedArms.push("sibling-did-not-survive");
  }

  return failedArms.length === 0 ? { confirmed: true } : { confirmed: false, failedArms };
}
