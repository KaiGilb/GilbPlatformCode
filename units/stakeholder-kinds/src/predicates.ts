// The predicates the kind reader uses, resolved to their spellings from their own term documents. The only literals are the terms'
// addresses on the master; the keys a stored fact carries come back from the document.

import { spellingOfTermDoc, type PredicateSpelling, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";

export interface StakeholderPredicates {
  playableBy: PredicateSpelling;
  fieldOf: PredicateSpelling;
  subTypeOf: PredicateSpelling;
  label: PredicateSpelling;
  name: PredicateSpelling;
  fieldRecordType: PredicateSpelling;
}

/** Each predicate's address on the master, as a path under `/base/`. */
export const PREDICATE_TERMS: Record<keyof StakeholderPredicates, string> = {
  playableBy: "a/playableBy",
  fieldOf: "a/fieldOf",
  subTypeOf: "a/subTypeOf",
  label: "a/label",
  name: "a/name",
  fieldRecordType: "a/fieldRecordType",
};

/** Dereference one predicate term and derive its spellings. */
export async function resolvePredicate(source: VocabularySource, key: keyof StakeholderPredicates): Promise<PredicateSpelling> {
  const iri = source.termIri(PREDICATE_TERMS[key]);
  return spellingOfTermDoc(await source.term(iri), iri);
}
