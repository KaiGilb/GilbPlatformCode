// The stakeholder kinds: which types a stakeholder record may have. Read, never listed: the role concept's `a:playableBy` names the
// types whose instances may play it, and every type under those, by is-a, may too.

import { VocabularyUnavailableError, nameOfIri, refsUnder, spellingOfTermDoc, textUnder, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { StakeholderPredicates } from "./predicates";
import { resolvePredicates } from "./predicates";

/** The role concept whose players are stakeholders: its address on the master. */
export const STAKEHOLDER_ROLE_TERM = "t/Stakeholder";

export interface StakeholderKindType {
  /** The type's IRI, as the master serves it. */
  term: string;
  /** Its bare name, the form a typed read's `?type=` takes. */
  name: string;
  /** Its label from the children listing. `null` for a member: members are not dereferenced
   *  here, so their label is not read here. ⛔ Never filled with a guess. */
  label: string | null;
  /** True for a type named directly in `a:playableBy`. */
  isMember: boolean;
  /** The is-a parents of this type that are also in the set, as the children listings showed
   *  them. Usually empty for a member; not empty when one member sits under another. */
  parents: string[];
  /** The member(s) this type descends from (itself, for a member). */
  members: string[];
}

/** The address of the term that says which of a role's players a create picker offers first. */
export const CREATE_SHORTCUT_TERM = "a/createShortcut";

/** One create shortcut: a type a create picker offers first (`a:createShortcut` on the role). */
export interface CreateShortcut {
  /** The type's IRI, as the master serves it. */
  term: string;
  /** Its bare name, the form a typed read's `?type=` takes. */
  name: string;
  /** Its own `a:label`. `null` when its term did not answer: ⛔ never a guess. */
  label: string | null;
}

/** What the master said about shortcuts: `declared` (the role carries some), `none-declared` (the term is minted and the
 *  role carries none), `unreadable` (the term did not answer: no shortcuts, the picker lists everything alike). */
export type ShortcutState = "declared" | "none-declared" | "unreadable";

export interface StakeholderKinds {
  /** The role concept that was read. */
  role: string;
  /** Its `a:playableBy`, verbatim and in served order. */
  members: string[];
  /** Members plus every transitive is-a child, each once. */
  types: StakeholderKindType[];
  /** False when any children listing said it was not complete. The set is then a floor. */
  complete: boolean;
  /** Which listings were incomplete, so a reader can say where the gap is. */
  incompleteAt: string[];
  /** The spellings used, so a later read in the same pass need not resolve them again. */
  predicates: StakeholderPredicates;
  /**
   * the role's `a:createShortcut`, in the master's order, kept to types that are players of the role.
   * A create picker offers these first and keeps every other type under "More types". Empty, never an error, when the
   * master does not carry them (`shortcuts` says why): the picker then lists everything alike, ⛔ not a typed list.
   */
  createShortcuts: CreateShortcut[];
  shortcuts: ShortcutState;
}

export interface ResolveKindsOptions {
  /** Override the role concept's address (a path under `/base/`). */
  roleTerm?: string;
  /** Spellings already resolved in this pass. */
  predicates?: StakeholderPredicates;
  /** Some spellings already resolved in this pass; the rest are read here. Ignored when
   *  `predicates` is given. */
  knownPredicates?: Partial<StakeholderPredicates>;
}

/**
 * Read the role's players from the master and expand them down is-a.
 *
 * Reads that do not wait on each other are made at the same time (for the page's latency
 * bands): the role's term with the predicate terms, and each level of the is-a
 * walk down as one round of children reads. The answer, and the order of `types`, are those of
 * a walk made one read at a time.
 */
export async function resolveStakeholderKinds(
  source: VocabularySource,
  opts: ResolveKindsOptions = {},
): Promise<StakeholderKinds> {
  const role = source.termIri(opts.roleTerm ?? STAKEHOLDER_ROLE_TERM);
  // The role's term through the named read where the source has one: one indexed read on the
  // master, where the per-term route costs about 100 ms of the master's time.
  const [predicates, roleDoc, shortcutKeys] = await Promise.all([
    opts.predicates ?? resolvePredicates(source, opts.knownPredicates),
    source.terms ? source.terms([role])[0]! : source.term(role),
    // The shortcut term is read in this same round, so it adds no round of its own.
    readShortcutSpelling(source),
  ]);
  const members = refsUnder(roleDoc, predicates.playableBy.readKeys);
  if (members.length === 0) {
    // Loud on purpose. An empty kind set would render an empty Stakeholders list, which looks
    // exactly like a person who has recorded no one.
    throw new VocabularyUnavailableError(
      `${role} declares no players under ${predicates.playableBy.readKeys.join(" / ")}; ` +
        `the stakeholder kinds cannot be read`,
    );
  }

  // The shortcuts' own terms are read WHILE the children are walked (one round, not one more): a shortcut that turns out not to be
  // a player is dropped afterwards. Never rejects (see `readShortcuts`).
  const shortcutsRead = readShortcuts(source, roleDoc, shortcutKeys, predicates);
  const { types, incompleteAt } = await expandDownIsA(source, members);

  const { createShortcuts, shortcuts } = settleShortcuts(await shortcutsRead, new Set(types.map((k) => k.term)));

  return {
    role,
    members,
    types,
    complete: incompleteAt.length === 0,
    incompleteAt,
    predicates,
    createShortcuts,
    shortcuts,
  };
}

/**
 * The members and every type below them by is-a, each once, in the order a walk made one read at a time gives (
 * shared by `resolveStakeholderKinds` and `readStakeholderKindSet`, so the two cannot walk differently).
 *
 * @param source the master
 * @param members the role's players, in served order
 * @returns the types (members first) and the listings that said they were not complete
 */
export async function expandDownIsA(
  source: VocabularySource,
  members: readonly string[],
): Promise<{ types: StakeholderKindType[]; incompleteAt: string[] }> {
  const byTerm = new Map<string, StakeholderKindType>();
  const incompleteAt: string[] = [];
  for (const m of members) {
    byTerm.set(m, { term: m, name: nameOfIri(m), label: null, isMember: true, parents: [], members: [m] });
  }

  // Breadth-first down is-a. Each type is expanded once, however many paths reach it, so a
  // cycle in the served graph cannot loop and a diamond cannot duplicate. A level's children
  // listings are read at the same time, then applied in queue order, so the result is the one a
  // queue served one read at a time gives.
  const expanded = new Set<string>();
  let level = [...members];
  while (level.length > 0) {
    const parents: string[] = [];
    for (const t of level) {
      if (expanded.has(t)) continue;
      expanded.add(t);
      parents.push(t);
    }
    const pages = await Promise.all(parents.map((t) => source.children(t)));
    const nextLevel: string[] = [];
    parents.forEach((parent, i) => {
      const page = pages[i]!;
      if (!page.complete) incompleteAt.push(parent);
      for (const child of page.children) {
        let entry = byTerm.get(child.term);
        if (!entry) {
          entry = {
            term: child.term,
            name: nameOfIri(child.term),
            label: typeof child.label === "string" && child.label.trim() ? child.label : null,
            isMember: false,
            parents: [],
            members: [],
          };
          byTerm.set(child.term, entry);
        } else if (entry.label === null && typeof child.label === "string" && child.label.trim()) {
          entry.label = child.label;
        }
        if (!entry.parents.includes(parent)) entry.parents.push(parent);
        nextLevel.push(child.term);
      }
    });
    level = nextLevel;
  }

  // Which members each type descends from, computed once the whole graph is known, so a type
  // reached by a second path after it was expanded still carries every member above it.
  const membersOf = (term: string, seen: Set<string>): string[] => {
    const entry = byTerm.get(term)!;
    if (seen.has(term)) return [];
    seen.add(term);
    const out = entry.isMember ? [term] : [];
    for (const p of entry.parents) for (const m of membersOf(p, seen)) if (!out.includes(m)) out.push(m);
    return out;
  };
  for (const entry of byTerm.values()) entry.members = membersOf(entry.term, new Set());

  return { types: [...byTerm.values()], incompleteAt };
}

/** The spellings of the shortcut term, or null when it is not minted or does not answer: SOFT, ⛔ never thrown. */
export async function readShortcutSpelling(source: VocabularySource): Promise<string[] | null> {
  try {
    const iri = source.termIri(CREATE_SHORTCUT_TERM);
    return spellingOfTermDoc(await source.term(iri), iri).readKeys;
  } catch {
    return null;
  }
}

export interface ShortcutsRead {
  state: "unreadable" | "none-declared" | "named";
  named: CreateShortcut[];
}

/**
 * The role's create shortcuts, as named, each with the label its own term carries. A shortcut whose own term does
 * not answer keeps its place without a label. Never rejects.
 */
async function readShortcuts(
  source: VocabularySource,
  roleDoc: Record<string, unknown>,
  readKeys: string[] | null,
  predicates: StakeholderPredicates,
): Promise<ShortcutsRead> {
  if (readKeys === null) return { state: "unreadable", named: [] };
  const named = refsUnder(roleDoc, readKeys);
  if (named.length === 0) return { state: "none-declared", named: [] };
  const withLabels = await Promise.all(
    named.map(async (iri): Promise<CreateShortcut> => {
      let label: string | null = null;
      try {
        label = textUnder(await source.term(iri), predicates.label.readKeys);
      } catch {
        label = null;
      }
      return { term: iri, name: nameOfIri(iri), label };
    }),
  );
  return { state: "named", named: withLabels };
}

/** Keep only the shortcuts that are players of the role; nothing is offered that cannot be created. */
export function settleShortcuts(read: ShortcutsRead, players: ReadonlySet<string>): { createShortcuts: CreateShortcut[]; shortcuts: ShortcutState } {
  if (read.state === "unreadable") return { createShortcuts: [], shortcuts: "unreadable" };
  const createShortcuts = read.named.filter((s) => players.has(s.term));
  return { createShortcuts, shortcuts: createShortcuts.length > 0 ? "declared" : "none-declared" };
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
export function kindDescendants(kinds: Pick<StakeholderKinds, "types">, term: string): KindDescendant[] {
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
