// Copied from GilbApp src/lib/base/records.ts (WriteSource, writeSource) and the MergePatchValue type.

/** Where a patch's slugs came from, which decides their stored spelling when the host writes them. */
export interface WriteSource {
  /** The record's own entity URI — names the vault whose `@context` governs the inversion. */
  readonly at: string | null;
  /** The slugs that came off the vault's served document (`servedKeys` of the record).
   *  Empty / absent: nothing to invert, so the host spells each slug with its own `a:` prefix. */
  readonly servedKeys: readonly string[] | undefined;
}

/**
 * The {@link WriteSource} for a record, as a spread: `[]` when the record carries no served document, so a call made with it
 * has the same number of arguments as one made without a source.
 */
export function writeSource(
  rec: { entityUri?: string; servedKeys?: readonly string[] },
): [] | [WriteSource] {
  if (!rec.servedKeys?.length) return [];
  return [{ at: rec.entityUri ?? null, servedKeys: rec.servedKeys }];
}

/** One member of a JSON Merge Patch: `null` deletes the attribute, any other value replaces it. */
export type MergePatchValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: unknown }
  | readonly unknown[];
