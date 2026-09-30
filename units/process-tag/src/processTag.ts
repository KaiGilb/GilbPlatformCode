/**
 * The document tag on a process, and the patch that changes it.
 *
 * This is not the tag-carrier unit. That unit reads unitTag and ruleId,
 * and it trims the text it returns. This unit reads the document only,
 * unitTag then a:unitTag, and it returns the stored text with its spaces.
 * A rule id on the same record is not this document's tag.
 *
 * The patch is also not a writer. The host sends it. The key in the patch
 * is the bare slug `unitTag`. The host adds one `a:` when it writes.
 * This patch never carries tagScope.
 */

/**
 * The document's unit tag, or undefined when the document does not have one.
 *
 * Framed `unitTag` wins over raw `a:unitTag`.
 * A value that is not a string is skipped.
 * A string that is empty after trim is skipped, and the other spelling is tried.
 * The string that is returned is not trimmed. `"  Proc  "` is returned as `"  Proc  "`.
 * Bare `tag`, `ruleId`, and a tag sitting on a step or a condition are not read.
 */
export function processUnitTag(process: {
  unitTag?: unknown;
  "a:unitTag"?: unknown;
}): string | undefined {
  const framed = process.unitTag;
  if (typeof framed === "string" && framed.trim() !== "") return framed;
  const raw = process["a:unitTag"];
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return undefined;
}

/**
 * The document-level tag patch.
 *
 * - Both sides the same text, character for character: `{}`. The key is absent.
 *   An unchanged tag is not written again.
 * - `edited` is exactly `""`: `{ unitTag: null }`. That is a delete.
 *   A string of spaces is not a delete.
 * - Both sides non-empty after trim, and those trimmed texts differ: throws.
 *   The tag is frozen. Clear it, then set the new one. Do not rename in place.
 * - Otherwise: `{ unitTag: edited }` using `edited` as passed, spaces included.
 *
 * Freeze compares trimmed text. The message does not. `served` in the message
 * is `original` unchanged. `edited` in the message is the trimmed draft.
 *
 * The thrown message is exactly:
 * `a:unitTag is frozen at assignment and cannot be renamed in place (served "<original>", edited "<trimmed draft>"). Clear the field to release the tag, then set the new one.`
 */
export function buildProcessUnitTagPatch(
  original: string,
  edited: string,
): { unitTag?: string | null } {
  const served = original.trim();
  const next = edited.trim();
  if (served !== "" && next !== "" && next !== served) {
    throw new Error(
      `a:unitTag is frozen at assignment and cannot be renamed in place (served "${original}", edited "${next}"). ` +
        `Clear the field to release the tag, then set the new one.`,
    );
  }
  if (edited === original) return {};
  if (edited === "") return { unitTag: null };
  return { unitTag: edited };
}
