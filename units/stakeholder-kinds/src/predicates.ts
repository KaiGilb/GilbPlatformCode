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

/** Dereference each predicate term and derive its spellings, all at once. Fails loudly if any
 *  cannot be read: a resolver missing a predicate would read nothing, and nothing looks like "no
 *  stakeholders". `known` holds spellings this pass already read; those terms are not read again
 *  (the field-set read reads `a/fieldOf` first, to ask the carrier selector before anything else). */
export async function resolvePredicates(
  source: VocabularySource,
  known: Partial<StakeholderPredicates> = {},
): Promise<StakeholderPredicates> {
  const entries = await Promise.all(
    (Object.keys(PREDICATE_TERMS) as (keyof StakeholderPredicates)[]).map(
      async (key) => [key, known[key] ?? (await resolvePredicate(source, key))] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as StakeholderPredicates;
}
