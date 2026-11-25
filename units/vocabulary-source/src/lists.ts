// Reading a record's value or values for the predicate a term defines, by the term's own cardinality.
//
// The cardinality comes from the served term document's `a:cardinality`, and the keys from its `a:predicateAttribute`. No term name,
// key or list of "known list terms" is typed in here.
import { VocabularyUnavailableError, cardinalityOf, spellingOfTermDoc, valuesUnder, type TermDoc } from "./terms";

/**
 * Read `record`'s value(s) for the predicate that `term` defines.
 *
 * - `a:cardinality` `multi`: ALWAYS a new array. Absent (or null) -> `[]`; one bare value -> `[v]`;
 *   an array -> its elements, flattened one level, in order. Every spelling the term publishes is
 *   read (prefixed, bare, retired), values concatenated in binding order. Elements are returned
 *   as stored (an `{"@id": …}` stays an object); falsy values such as `0`, `false`, `""` are kept.
 * - `a:cardinality` `single`: the value UNCHANGED, as the server sent it: the first non-null value
 *   found in binding order, or `undefined` when there is none. It is not wrapped, and an array
 *   stored under a single term is passed through as is (that is the server's fact, not ours to fix).
 *
 * Throws `VocabularyUnavailableError` (never returns `[]`) when the term cannot say what it is: no
 * term document, no `a:predicateAttribute`, no `a:cardinality`, or a token other than `single` /
 * `multi`. "I could not read the definition" is a different claim from "there is nothing".
 *
 * Pure and synchronous. The record is never modified and the returned array never aliases it.
 * To read a term by IRI with the vocabulary fetched once per term, use `createListReader`.
 */
export function readList(record: Readonly<Record<string, unknown>>, term: TermDoc): unknown {
  if (term === null || typeof term !== "object" || Array.isArray(term)) {
    throw new VocabularyUnavailableError("readList was given no term document, so it cannot know the term's cardinality");
  }
  const spelling = spellingOfTermDoc(term, "(unnamed term)");
  const cardinality = cardinalityOf(term);
  if (cardinality === "multi") return valuesUnder(record, spelling.readKeys);
  if (cardinality === "single") {
    for (const k of spelling.readKeys) {
      const v = record[k];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }
  throw new VocabularyUnavailableError(
    cardinality === null
      ? `${spelling.term} carries no a:cardinality; it does not say whether it is a list`
      : `${spelling.term} carries a:cardinality "${cardinality}"; readList knows only "single" and "multi"`,
  );
}
