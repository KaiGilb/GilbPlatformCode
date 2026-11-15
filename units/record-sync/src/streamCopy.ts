// A complete copy of one record type, read page by page and handed to a list as each page arrives. Read only.
// Plugs straight into optimistic-records' `useRecordList({ list })`: the list calls `list(emit)`, each walk page of `completeCopy` is
// mapped and emitted, and the promise answers the whole, consistent copy.

import { completeCopy, type CompleteCopy, type CompleteCopyOptions } from "./completeCopy";
import type { PlatformClient } from "./platform";
import type { RecordRow } from "./recordPages";

/** Options of {@link streamCopy}: those of `completeCopy` (without `onPage`), and the two below. */
export interface StreamCopyOptions<T> extends Omit<CompleteCopyOptions, "onPage"> {
  /** A row as your list shows it. Answer `null` or `undefined` to leave the row out (a record that is not one of yours). */
  map: (row: RecordRow) => T | null | undefined;
  /** Told when the copy is complete (or ends partial: `truncated`, `reason`), after the last `emit` and before the promise answers. */
  onDone?: (copy: CompleteCopy) => void;
}

/**
 * Makes the `list` of a record list from a vault's type: `list(emit)` walks the type with `completeCopy`, calls `emit(rows)` with the NEW rows
 * of each walk page (mapped, newest first), and answers all rows of the finished copy, mapped. The first page is on screen while the rest is
 * still being read. Without an `emit` it is a plain `completeCopy` with a map. The unit adds no request of its own: `completeCopy`'s pages, in
 * its order.
 *
 * The pages are an early view (see `CompletePage`): the answer is the consistent copy, and a list that merges pages should let that answer
 * replace what it showed. `partialOk` and the page cap work as in `completeCopy`; `onDone` tells which.
 */
export function streamCopy<T>(platform: PlatformClient, vaultId: string, typeName: string, opts: StreamCopyOptions<T>): (emit?: (rows: readonly T[]) => void) => Promise<T[]> {
  const { map, onDone, ...copyOpts } = opts;
  const mapAll = (rows: readonly RecordRow[]): T[] => {
    const out: T[] = [];
    for (const r of rows) {
      const m = map(r);
      if (m !== null && m !== undefined) out.push(m);
    }
    return out;
  };
  return async (emit) => {
    let told = 0; // rows of the walk already emitted
    const copy = await completeCopy(platform, vaultId, typeName, {
      ...copyOpts,
      ...(emit
        ? {
            onPage: (p) => {
              const fresh = p.records.slice(told);
              told = Math.max(told, p.records.length);
              if (fresh.length > 0) emit(mapAll(fresh));
            },
          }
        : {}),
    });
    onDone?.(copy);
    return mapAll(copy.records);
  };
}
