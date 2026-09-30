/**
 * The purpose printed on an email slot.
 *
 * This is not an audience rung. "Private" here is the purpose word.
 * It is not the name of a narrow audience. This unit never reads a rung.
 *
 * Only these slots state a purpose:
 *   email, hasEmail                 → Work
 *   emailPrivate, hasEmailPrivate   → Private
 *
 * Anything else, including a phone slot, is null. Do not guess.
 * The match is exact after trim. " email " is Work. "Email" is not. Case is kept.
 */

export type ContactPointPurpose = "Work" | "Private";

/**
 * The purpose the slot states, or null when the slot states none.
 * Null and undefined are null. A blank string is null.
 */
export function purposeFromSlot(slot: string | undefined | null): ContactPointPurpose | null {
  if (slot == null) return null;
  const key = slot.trim();
  if (key === "email" || key === "hasEmail") return "Work";
  if (key === "emailPrivate" || key === "hasEmailPrivate") return "Private";
  return null;
}

/**
 * The vCard 3.0 TYPE token for a stated purpose.
 * Work → WORK. Private → HOME. The card still shows the word Private.
 * Null, and any other value, → null. Do not invent WORK.
 */
export function vcardPurposeType(purpose: ContactPointPurpose | null): "WORK" | "HOME" | null {
  if (purpose === "Work") return "WORK";
  if (purpose === "Private") return "HOME";
  return null;
}
