// The stakeholder kind set as the Plan card reads it: the types of the set, their is-a parents, and the walk down
// from one type. Nothing here names a kind; the set comes from the master vocabulary.

export interface StakeholderKindType {
  /** The type's IRI, as the master serves it. */
  term: string;
  /** Its bare name, the form a typed read's `?type=` takes. */
  name: string;
  /** Its label from the children listing. `null` for a member: members are not dereferenced
   *  here, so their label is not read here. Never filled with a guess. */
  label: string | null;
  /** True for a type named directly in `a:playableBy`. */
  isMember: boolean;
  /** The is-a parents of this type that are also in the set, as the children listings showed
   *  them. Usually empty for a member; not empty when one member sits under another. */
  parents: string[];
  /** The member(s) this type descends from (itself, for a member). */
  members: string[];
}

/** One type below another by is-a, with how far below (1 = a direct child). */
export interface KindDescendant {
  type: StakeholderKindType;
  term: string;
  name: string;
  label: string | null;
  depth: number;
}

/**
 * Every type of the set that sits below `term` by is-a, the direct children first and each one's own children right after it,
 * each once (a diamond lists a type once). Read from the set the master gave; nothing is named here. Used for the System
 * shortcut's second step: the master's own sub-types of Software System are the choices, and the pick IS the record's type.
 */
export function kindDescendants(kinds: { types: StakeholderKindType[] }, term: string): KindDescendant[] {
  const out: KindDescendant[] = [];
  const seen = new Set<string>([term]);
  const walk = (parent: string, depth: number) => {
    for (const child of kinds.types) {
      if (!child.parents.includes(parent) || seen.has(child.term)) continue;
      seen.add(child.term);
      out.push({ type: child, term: child.term, name: child.name, label: child.label, depth });
      walk(child.term, depth + 1);
    }
  };
  walk(term, 1);
  return out;
}

/** The type set the Stakeholders entry writes into the working set, with how sure the read is. */
export interface StakeholderTypeSet {
  /** Bare type names, the form `?wst=` and a typed read's `?type=` take. Served order, each once. */
  names: string[];
  /** False when a children listing on the master said it was not complete: the set is a floor. */
  complete: boolean;
  /**
   * Each type of the set as the master served it: its term address, its bare name, and the master's word for it
   * (`a:label`; the kind reader reads the players' words too, so no type needs a read of its own). `null` only when the
   * type's term did not answer. Served order, each once. Never filled with a guess.
   */
  /**
   * The is-a parents the master listed for this type (term IRIs). Copied through so a caller can walk
   * down from a root. Absent on a set stored before that copy: the walk then has no children.
   */
  types: { term: string; name: string; label: string | null; parents?: readonly string[] }[];
}
