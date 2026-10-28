// A write never replaces a value that was saved in the store after the card read the record, unless the person has been shown that value.
// Taken from the app's saved-elsewhere file: `keysSavedElsewhere` and the helper it reads (`rebaseOnStored` is not reached).

import type { RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";

const val = (m: Readonly<RecordFacts>, k: string): string => m[k] ?? "";

/**
 * The keys whose stored value was saved elsewhere since the card read the record (case (a) is an empty answer, case (b) a non-empty
 * one). A key removed elsewhere counts too. A value the card itself holds or is about to send is the card's own (its own save, landed
 * after the retype's PUT went out; a name it saved and the retype moves).
 */
export function keysSavedElsewhere(
  stored: Readonly<RecordFacts>,
  read: Readonly<RecordFacts>,
  own: readonly Readonly<RecordFacts>[],
): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(stored), ...Object.keys(read)])) {
    const now = val(stored, k);
    if (now === val(read, k)) continue;
    if (own.some((o) => val(o, k) === now)) continue;
    out.push(k);
  }
  return out.sort();
}
