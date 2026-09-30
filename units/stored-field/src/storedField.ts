/**
 * Read a fact that may arrive under a camelCase key or a kebab-case key.
 * CamelCase wins when it is present, including when it is an empty string.
 * Null and a missing key fall through. An empty string does not.
 */

export function wireField<T>(
  doc: Record<string, unknown>,
  camel: string,
  kebab: string,
): T | undefined {
  if (doc[camel] !== undefined && doc[camel] !== null) return doc[camel] as T;
  if (doc[kebab] !== undefined && doc[kebab] !== null) return doc[kebab] as T;
  return undefined;
}

/**
 * The name to show for a process-family document, from facts already on it.
 *
 * Order: title (or a:title), then label (or a:label), then processName
 * (or process-name). A missing name is "". The id is not used.
 *
 * Title and label are returned trimmed. The machine handle is returned as
 * stored, once it contains a non-space character. Do not trim it if you need
 * the same bytes the app shows.
 *
 * An empty string on the camelCase key blocks the kebab spelling of THAT
 * field. It does not block the next kind of name. title: "" hides a:title
 * and the function moves on to label.
 */
export function storedProcessName(doc: Record<string, unknown>): string {
  const title = wireField<string>(doc, "title", "a:title");
  if (typeof title === "string" && title.trim() !== "") return title.trim();
  const label = wireField<string>(doc, "label", "a:label");
  if (typeof label === "string" && label.trim() !== "") return label.trim();
  const name = wireField<string>(doc, "processName", "process-name");
  if (typeof name === "string" && name.trim() !== "") return name;
  return "";
}
