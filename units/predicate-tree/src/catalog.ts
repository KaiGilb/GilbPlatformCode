/** A term in a link catalogue the host already loaded. This unit does not fetch. */
export interface LinkTerm {
  iri: string;
  curie: string;
  label: string;
  parentIri: string | null;
  parentCurie: string | null;
  plane: string;
  directed: boolean;
  symmetric: boolean;
  typeAttribute: string | null;
  does: string | null;
  transitive: boolean;
  inverseOfCurie: string | null;
  inverseLabel: string | null;
  composesTo: readonly string[];
  genderedLabel: string | null;
}

export interface LinkPlaneCatalog {
  plane: string;
  terms: readonly LinkTerm[];
  roots: readonly LinkTerm[];
  stale: boolean;
  excludedUnwritable: readonly string[];
}

/** Direct children only. A term is not its own child. */
export function childrenOf(catalog: LinkPlaneCatalog, parentCurie: string): LinkTerm[] {
  return catalog.terms.filter((t) => t.parentCurie === parentCurie && t.curie !== parentCurie);
}
