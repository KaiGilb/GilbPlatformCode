// Which slugs of a record came off the vault's own served document: a write passes this so the vault can spell them as it served them.
// Copied from the app unchanged (see the README).

/** Where a patch's slugs came from: the record's own address, and the slugs its served document carried. */
export interface WriteSource {
  readonly at: string | null;
  readonly servedKeys: readonly string[] | undefined;
}

/** The write source of a record, or nothing when the record carries no served document. */
export function writeSource(
  rec: { entityUri?: string; servedKeys?: readonly string[] },
): [] | [WriteSource] {
  if (!rec.servedKeys?.length) return [];
  return [{ at: rec.entityUri ?? null, servedKeys: rec.servedKeys }];
}
