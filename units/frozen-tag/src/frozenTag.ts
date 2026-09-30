/**
 * Document-level tag on a process or a standards kind.
 *
 * The read is the same two spellings as condition-tag's conditionUnitTagCarrier:
 * framed `unitTag`, then `a:unitTag`. Blank and whitespace-only do not count
 * and do not hide the next spelling. The text returned is not trimmed.
 * A bare `tag` is never read, even when some other field says the row is manual.
 * If conditionUnitTagCarrier changes, this read must change with it.
 * Do not add the manual bare-tag branch from conditionUnitTag. That branch is
 * for a condition, not for a document.
 *
 * The patch is the document door. A set and a clear are allowed. A rename is
 * refused. The key written is the bare slug `unitTag`. The host's patch call
 * adds the single `a:`. Do not pass `a:unitTag` or the host will write
 * `a:a:unitTag`.
 */

export interface DocumentTagFacts {
  unitTag?: unknown;
  "a:unitTag"?: unknown;
  tag?: unknown;
  [key: string]: unknown;
}

/**
 * The document's assigned tag, or undefined when neither spelling holds text.
 * Null facts return undefined. A non-string is skipped.
 */
export function readDocumentUnitTag(
  facts: DocumentTagFacts | null | undefined,
): string | undefined {
  if (!facts) return undefined;
  const framed = facts.unitTag;
  if (typeof framed === "string" && framed.trim() !== "") return framed;
  const raw = facts["a:unitTag"];
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return undefined;
}

export interface FrozenUnitTagPatch {
  unitTag?: string | null;
}

/**
 * The patch for one document tag.
 *
 * Order, and it matters:
 *
 * 1. Both sides trim to something, and those trims differ → throw a plain Error.
 *    The message quotes `original` as given, and quotes `edited.trim()`, not
 *    `edited`. The second sentence is part of the message. Do not drop it.
 *    This is a plain Error. There is no subclass to catch.
 * 2. `edited === original` (byte for byte, not trimmed) → {}. Send nothing.
 * 3. `edited === ""` exactly → `{ unitTag: null }`. That is a delete.
 *    Whitespace is not a delete. `" "` is a write of a space.
 * 4. Otherwise → `{ unitTag: edited }` with `edited` not trimmed.
 *
 * A whitespace-only original does not freeze, because its trim is empty.
 * Changing `" a "` to `"a"` is not a rename: the trims match, so step 1 does
 * not throw, and step 2 does not match, so the edited text is written.
 */
export function buildFrozenUnitTagPatch(original: string, edited: string): FrozenUnitTagPatch {
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
