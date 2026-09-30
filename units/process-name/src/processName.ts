/**
 * The name a process document states.
 *
 * This is not the entity-name unit. That unit reads a label before a title,
 * and a miss becomes `Untitled` unless the caller passed another fallback.
 * This unit reads title, then label, then the machine handle, and a miss is
 * `""`. Do not run one and then the other on the same document.
 *
 * The id is not a name. A tag is not a name. `a:processName` is not read.
 * The machine handle is `processName`, or `process-name` when `processName`
 * is absent. An empty string on `processName` blocks `process-name`.
 */

function wireField(doc: Record<string, unknown>, camel: string, kebab: string): unknown {
  if (doc[camel] !== undefined && doc[camel] !== null) return doc[camel];
  if (doc[kebab] !== undefined && doc[kebab] !== null) return doc[kebab];
  return undefined;
}

/**
 * Title, then label, then the machine handle.
 *
 * Title and label are trimmed, and a string that is empty after trim is skipped.
 * The machine handle is returned with its spaces when it is not empty after trim.
 * A value that is not a string is skipped, so a numeric title does not win.
 * A camel key that is present and not null blocks the kebab key, even when the
 * camel value is `""` or a number.
 */
export function processDisplayName(process: Record<string, unknown>): string {
  const title = wireField(process, "title", "a:title");
  if (typeof title === "string" && title.trim() !== "") return title.trim();
  const label = wireField(process, "label", "a:label");
  if (typeof label === "string" && label.trim() !== "") return label.trim();
  const name = wireField(process, "processName", "process-name");
  if (typeof name === "string" && name.trim() !== "") return name;
  return "";
}
