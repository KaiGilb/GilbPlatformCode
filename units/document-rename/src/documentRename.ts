/**
 * Rename fields for a standards document.
 * The title is read as stored. It is not trimmed. A blank string is still a title.
 */

export const DOCUMENT_TITLE_CARRIER = "title" as const;

export type StandardsDocumentFields = { title: string };

/**
 * Bare `title` wins when it is a string, including "" and a string of spaces.
 * A missing or non-string bare title falls through to `a:title` when that is a string.
 * Anything else, including a missing document, is "".
 */
export function prefillDocumentRename(
  doc: Record<string, unknown> | null | undefined,
): StandardsDocumentFields {
  if (!doc) return { title: "" };
  const bare = doc[DOCUMENT_TITLE_CARRIER];
  if (typeof bare === "string") return { title: bare };
  const wire = doc[`a:${DOCUMENT_TITLE_CARRIER}`];
  if (typeof wire === "string") return { title: wire };
  return { title: "" };
}

/**
 * The bare slug `title` when the two strings differ. Same text, including spaces, is {}.
 * An empty edited title is the string "", not a null delete. No other key is written.
 */
export function buildDocumentRenamePatch(
  original: StandardsDocumentFields,
  edited: StandardsDocumentFields,
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (edited.title !== original.title) patch[DOCUMENT_TITLE_CARRIER] = edited.title;
  return patch;
}
