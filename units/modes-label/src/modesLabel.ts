/**
 * The words for a mode set.
 *
 * One sentence, not one chip per mode. The detail pane that draws a chip for
 * each mode is a different surface. Do not split this sentence to match it,
 * and do not replace those chips with this sentence.
 *
 * `append` and `control` are not words here. They do not produce a fourth
 * sentence. Call vault-modes first when the wire list may contain them.
 * This function does not lowercase. One call site lowercases the result.
 */

/**
 * `Read + write`, `Write only`, `Read only`, or `No access modes`.
 *
 * The array order does not matter. `["write", "read"]` is still `Read + write`.
 * Matching is exact. `READ` is not read, so it falls through to `No access modes`.
 * An empty list is `No access modes`, not a blank string.
 */
export function modesLabel(modes: readonly string[]): string {
  const read = modes.includes("read");
  const write = modes.includes("write");
  if (read && write) return "Read + write";
  if (write) return "Write only";
  if (read) return "Read only";
  return "No access modes";
}
