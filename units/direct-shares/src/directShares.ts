/**
 * Direct reader and writer names already written on one record.
 * This is not the vault grant, not a group, and not a public flag.
 */

export interface DirectShareEntry {
  principal: string;
  /** `write` is always paired with `read` in this list, even if the reader fact is absent. */
  modes: ReadonlyArray<"read" | "write">;
}

/**
 * Split a joined list of principals.
 * The cut is a comma followed by whitespace (`/,\s+/`), which is how a framed
 * array is joined. `a,b` with no space stays one entry. Blanks are dropped.
 */
export function parseGrantPrincipals(raw: string | undefined | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/,\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * One row per principal named in `directReader` / `a:directReader` or
 * `directWriter` / `a:directWriter`.
 *
 * A writer is listed as read and write, even when the reader fact does not
 * name them. A reader who is not a writer is read only.
 * Rows are sorted with `localeCompare` and no locale, so the order follows
 * the runtime. Do not snapshot the order across machines for names that differ
 * only by case.
 */
export function listDirectShares(
  facts: Record<string, string> | undefined | null,
): DirectShareEntry[] {
  if (!facts) return [];
  const readers = new Set(parseGrantPrincipals(facts.directReader ?? facts["a:directReader"]));
  const writers = new Set(parseGrantPrincipals(facts.directWriter ?? facts["a:directWriter"]));
  const all = new Set<string>([...readers, ...writers]);
  const out: DirectShareEntry[] = [];
  for (const principal of all) {
    const modes: Array<"read" | "write"> = [];
    if (writers.has(principal)) modes.push("read", "write");
    else if (readers.has(principal)) modes.push("read");
    if (modes.length > 0) out.push({ principal, modes });
  }
  out.sort((a, b) => a.principal.localeCompare(b.principal));
  return out;
}
