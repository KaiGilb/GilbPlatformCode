// The card's save, rebased on the record as stored now, for a save refused with a 412. Pure.
// Taken from the app's saved-elsewhere file (`rebaseOnStored`, lines 40-74, and the one-line helper `val` of line 17 that it reads).
// `val` is also in `plan-record-hooks` (private there, beside `keysSavedElsewhere`); this unit keeps its own named copy of that one
// line because `plan-record-hooks` does not export it. Both compare 0 against the source.
import type { RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";

const val = (m: Readonly<RecordFacts>, k: string): string => m[k] ?? "";

/**
 * The card's save, rebased on the record as stored now (a card save refused with 412). Pure.
 *
 *   - A field the person changed since the card read the record keeps the person's value, unless it was also saved elsewhere to
 *     another value: then the stored value wins, the key is named in `conflicts`, and the card must show it and say so.
 *   - Every field the person did not change takes the stored value, so a value another session saved is NEVER sent back with the
 *     old value the card still showed.
 *   - A stored fact the editor does not hold, added or changed elsewhere, is carried as stored, so a save's retraction sweep does
 *     not take it away. One the card read unchanged is left out, so the sweep decides about it exactly as it did before the 412.
 */
export function rebaseOnStored(
  read: Readonly<RecordFacts>,
  held: Readonly<RecordFacts>,
  stored: Readonly<RecordFacts>,
): { facts: RecordFacts; conflicts: string[] } {
  const facts: RecordFacts = {};
  const conflicts: string[] = [];
  for (const k of Object.keys(held)) {
    const mine = val(held, k) !== val(read, k);
    const theirs = val(stored, k) !== val(read, k);
    if (mine && theirs && val(stored, k) !== val(held, k)) {
      conflicts.push(k);
      facts[k] = val(stored, k);
      continue;
    }
    facts[k] = mine ? val(held, k) : val(stored, k);
  }
  for (const k of Object.keys(stored)) {
    if (k in held) continue;
    if (!(k in read) || val(stored, k) !== val(read, k)) facts[k] = val(stored, k);
  }
  return { facts, conflicts: conflicts.sort() };
}
