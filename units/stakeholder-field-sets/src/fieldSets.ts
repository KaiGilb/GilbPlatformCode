// The field set per stakeholder kind, read from the ontology master: which fields a kind of stakeholder offers, and which slot holds a
// party's name.
//
// Read, never listed. An attribute term declares `a:fieldOf <Type>`: instances of that type, and of every type under it, may carry the
// attribute as a field. So, for a kind K:
//
//     ancestors(K) = K and every type above it by is-a
//     fields(K)    = every attribute whose a:fieldOf names a type in ancestors(K)
//
// Each field is labelled from the attribute's OWN `a:label`, and its spellings come from its own `a:predicateAttribute`. A party's name is
// `a:name`, never `a:label`: see `readPartyName` below.
//
// What a field set decides: what a card OFFERS. Not what exists. A fact already on a record is shown because the authorized read
// returned it, whether or not it is in this set. A caller must not use this set to hide a fact the read returned.
import {
  cardinalityOf,
  encodingOf,
  refsUnder,
  spellingOfTermDoc,
  textUnder,
  typeAttributeOf,
  type PredicateSpelling,
  type TermDoc,
  type VocabularySource,
} from "@kaigilb/gilbplatformcode-vocabulary-source";
import {
  resolvePredicate,
  resolvePredicates,
  resolveStakeholderKinds,
  stakeholderKindsOf,
  type StakeholderKindSet,
  type StakeholderKinds,
  type StakeholderPredicates,
} from "@kaigilb/gilbplatformcode-stakeholder-kinds";

export interface StakeholderField {
  /** The attribute's IRI as the declarations source served it. The master's listing serves
   *  the `…/base/t/<TypeName>` form, not the `…/base/a/<slug>` form its per-term
   *  route answers with; compare fields by this value only within one source. To read or write
   *  a value, use `readKeys` / `writeKey`, never this IRI. */
  term: string;
  /** The attribute's own label. `null` when the term carries none: ⛔ never a guessed name. */
  label: string | null;
  /** Every key a stored value of this field may carry. */
  readKeys: string[];
  /** The one spelling to write, or `null` with the reason in `writeKeyProblem`. */
  writeKey: string | null;
  writeKeyProblem: string | null;
  /** The attribute's declared value encoding, as served. */
  encoding: string | null;
  /** True when the attribute's own term declares cardinality `multi`: it may hold several
   *  values. Anything else, a term that declares none included, is one value. */
  many: boolean;
  /** Which of the kind's own types (itself or an ancestor) the declaration names. */
  declaredOn: string[];
  /** Set when the field holds a RECORD OF ITS OWN: its term carries `a:fieldRecordType`
   *  (a field that holds a record of its own). Each value is then a reference to a separately
   *  held record of that type, made when the entry is made, in the same vault as its carrier.
   *  `null` (or absent, in a reading stored before this existed) means the field holds its value
   *  inline, or points at an existing record the writer picks. */
  record: FieldRecord | null;
}

/** A field of a record a field holds. It has no record of its own here: one level is derived. */
export type RecordField = Omit<StakeholderField, "declaredOn" | "record">;

export interface FieldRecord {
  /** The record type's IRI: the `a:fieldRecordType` target, as served. */
  type: string;
  /** The string a writer stamps as the record's type: the `a:typeAttribute` of the term that
   *  defines the type. `null` when that term was not read or publishes none. ⛔ Never guessed. */
  typeName: string | null;
  /** The field's own `many`, repeated here: the carrier may hold several entries. */
  many: boolean;
  /** The record's own fields: the attributes whose `a:fieldOf` names the record type or a type
   *  above it. */
  fields: RecordField[];
}

export interface KindFieldSet {
  kind: string;
  name: string;
  label: string | null;
  /** The kind and every type above it that was read, nearest first. */
  ancestors: string[];
  /** Order carries no meaning: sorted by term IRI so two readings compare equal. An app that
   *  wants a display order decorates; it does not decide membership. */
  fields: StakeholderField[];
}

export interface FieldDeclarationProblem {
  term: string;
  reason: string;
}

export interface StakeholderFieldSets {
  kinds: StakeholderKinds;
  /** Keyed by the kind's IRI. A plain record, so a resolved reading can be stored and reloaded. */
  byKind: Record<string, KindFieldSet>;
  /** False when the declarations listing, a children listing or an ancestor walk was not whole,
   *  or a declaration could not be read. The sets are then a floor, ⛔ not the full answer. */
  complete: boolean;
  incompleteAt: string[];
  /** Declarations that name a kind but could not be read as a field, stated, ⛔ not dropped. */
  unreadable: FieldDeclarationProblem[];
}

export interface DeriveInput {
  kinds: { term: string; name: string; label: string | null; ancestors: string[] }[];
  /** Term documents carrying `a:fieldOf`. Any others are ignored. */
  declarations: TermDoc[];
  predicates: Pick<StakeholderPredicates, "fieldOf" | "label"> & Partial<Pick<StakeholderPredicates, "fieldRecordType">>;
  /** What was read about each record type a field names with `a:fieldRecordType`. A type not
   *  listed here gives its field a record with no type name and no fields. */
  recordTypes?: { type: string; typeName: string | null; ancestors: string[] }[];
}

/** The pure step: given each kind's ancestors and the declaring terms, build the field sets. */
export function deriveFieldSets(input: DeriveInput): {
  byKind: Record<string, KindFieldSet>;
  unreadable: FieldDeclarationProblem[];
} {
  const unreadable: FieldDeclarationProblem[] = [];
  const fields: { field: RecordField; targets: string[]; recordTypes: string[] }[] = [];
  const recordKeys = input.predicates.fieldRecordType?.readKeys ?? [];
  const seen = new Set<string>();
  const kindAncestry = new Set(input.kinds.flatMap((k) => k.ancestors));

  for (const doc of input.declarations) {
    const targets = refsUnder(doc, input.predicates.fieldOf.readKeys);
    if (targets.length === 0) continue;
    const term = typeof doc["@id"] === "string" ? (doc["@id"] as string) : null;
    // A declaration that names none of the kinds' types is not ours to judge.
    const relevant = targets.some((t) => kindAncestry.has(t));
    if (!term) {
      if (relevant) unreadable.push({ term: "(no @id)", reason: "a:fieldOf carrier served without an @id" });
      continue;
    }
    if (seen.has(term)) continue;
    seen.add(term);
    let spelling: PredicateSpelling;
    try {
      spelling = spellingOfTermDoc(doc, term);
    } catch (err) {
      if (relevant) unreadable.push({ term, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }
    fields.push({
      field: {
        term,
        label: textUnder(doc, input.predicates.label.readKeys),
        readKeys: spelling.readKeys,
        writeKey: spelling.writeKey,
        writeKeyProblem: spelling.writeKeyProblem,
        encoding: encodingOf(doc),
        many: cardinalityOf(doc) === "multi",
      },
      targets,
      recordTypes: recordKeys.length > 0 ? refsUnder(doc, recordKeys) : [],
    });
  }

  // A field that holds a record of its own: the record's type, and that record's own fields.
  const knownRecordTypes = new Map((input.recordTypes ?? []).map((r) => [r.type, r] as const));
  const recordOf = (entry: (typeof fields)[number]): FieldRecord | null => {
    if (entry.recordTypes.length === 0) return null;
    if (entry.recordTypes.length > 1) {
      // Two record types on one field: which one a writer makes is not this package's to pick.
      if (!unreadable.some((u) => u.term === entry.field.term))
        unreadable.push({ term: entry.field.term, reason: `names ${entry.recordTypes.length} record types; one was expected` });
      return null;
    }
    const type = entry.recordTypes[0]!;
    const known = knownRecordTypes.get(type);
    const above = new Set(known?.ancestors ?? [type]);
    return {
      type,
      typeName: known?.typeName ?? null,
      many: entry.field.many,
      fields: fields
        .filter((f) => f.targets.some((t) => above.has(t)))
        .map((f) => f.field)
        .sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : 0)),
    };
  };

  const byKind: Record<string, KindFieldSet> = {};
  for (const kind of input.kinds) {
    const own = new Set(kind.ancestors);
    const set: StakeholderField[] = [];
    for (const entry of fields) {
      const declaredOn = entry.targets.filter((t) => own.has(t));
      if (declaredOn.length > 0) set.push({ ...entry.field, declaredOn, record: recordOf(entry) });
    }
    set.sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
    byKind[kind.term] = {
      kind: kind.term,
      name: kind.name,
      label: kind.label,
      ancestors: kind.ancestors,
      fields: set,
    };
  }
  return { byKind, unreadable };
}

export interface ResolveFieldSetsOptions {
  /** Kinds already resolved in this pass. */
  kinds?: StakeholderKinds;
  /** The cached kind set (`stakeholderKindReader(...).get()`): the kinds are taken from it and NOT walked again; only the predicate
   *  terms are read. Ignored when `kinds` is given. */
  kindSet?: StakeholderKindSet;
  /** A ceiling on the upward is-a walk. Reaching it is reported, ⛔ never silent. */
  maxDepth?: number;
}

/**
 * Read the `a:fieldOf` declarations, then the kinds, walk each kind up is-a, and derive.
 *
 * The order, and what is read at the same time, is set by the page's latency bands:
 *   1. the `a/fieldOf` term, which names the spelling to ask for;
 *   2. the carrier selector, BEFORE any kind or type read, so a master without the selector
 *      refuses after these two requests ("not known yet", `CarrierSelectorMissingError`)
 *      instead of after the whole kind walk;
 *   3. the other predicate terms and the role's term, at the same time;
 *   4. the kinds' children listings, one round per level of the walk down;
 *   5. every kind's and every record type's walk up is-a, all at the same time, one round per
 *      level, each term read once through one shared cache.
 * Every read still goes to the master and checks back (the source's `no-cache`). The answer is
 * the one a read made one request at a time gives: each ancestor list keeps its nearest-first
 * order, and every list keeps its served order.
 */
export async function resolveFieldSets(
  source: VocabularySource,
  opts: ResolveFieldSetsOptions = {},
): Promise<StakeholderFieldSets> {
  // 1-2. The selector first. It needs only a/fieldOf's spelling.
  const fieldOf = opts.kinds?.predicates.fieldOf ?? (await resolvePredicate(source, "fieldOf"));
  const declarations = await source.carriersOf(fieldOf.readKeys);

  // 3-4. The kinds, with the predicates not read yet. From the cached set: the predicates only, ⛔ no second kind walk.
  const kinds =
    opts.kinds ??
    (opts.kindSet
      ? stakeholderKindsOf(opts.kindSet, await resolvePredicates(source, { fieldOf, ...opts.kindSet.spellings }))
      : await resolveStakeholderKinds(source, { knownPredicates: { fieldOf } }));
  const p = kinds.predicates;
  const maxDepth = opts.maxDepth ?? 64;
  const incompleteAt = [...kinds.incompleteAt.map((t) => `children of ${t}`)];

  // Parents inside the set are known from the children listings. A member, and anything above
  // a member, is read upward from its own term document.
  const listed = new Map(kinds.types.map((t) => [t.term, t] as const));
  const docLabels = new Map<string, string | null>();
  const docCache = new Map<string, Promise<TermDoc>>();
  // Term reads asked for in one turn of the event loop go to the master as one named read (the
  // source's `terms`), so each level of every walk up is one request, ⛔ not one per term.
  let queued: { term: string; settle: (doc: Promise<TermDoc>) => void }[] = [];
  const flush = () => {
    const batch = queued;
    queued = [];
    // This runs on a timer, outside any awaiting caller: a source that throws instead of rejecting
    // (its contract allows it) must reject the terms it was asked for, ⛔ never escape and leave
    // them unsettled.
    const rejectAll = (err: unknown) => batch.map(() => Promise.reject(err) as Promise<TermDoc>);
    const one = (term: string): Promise<TermDoc> => {
      try {
        return source.term(term);
      } catch (err) {
        return Promise.reject(err);
      }
    };
    let docs: Promise<TermDoc>[];
    try {
      docs = source.terms ? source.terms(batch.map((q) => q.term)) : batch.map((q) => one(q.term));
    } catch (err) {
      docs = rejectAll(err);
    }
    batch.forEach((q, i) => q.settle(docs[i]!));
  };
  const termDoc = (term: string): Promise<TermDoc> => {
    const hit = docCache.get(term);
    if (hit) return hit;
    if (queued.length === 0) setTimeout(flush, 0);
    const next = new Promise<TermDoc>((resolve) => queued.push({ term, settle: resolve }));
    docCache.set(term, next);
    return next;
  };
  const parentCache = new Map<string, Promise<string[]>>();
  const parentsOf = (term: string): Promise<string[]> => {
    const hit = parentCache.get(term);
    if (hit) return hit;
    const entry = listed.get(term);
    const next =
      entry && !entry.isMember && entry.parents.length > 0
        ? Promise.resolve(entry.parents)
        : termDoc(term).then((doc) => {
            docLabels.set(term, textUnder(doc, p.label.readKeys));
            return refsUnder(doc, p.subTypeOf.readKeys);
          });
    parentCache.set(term, next);
    return next;
  };

  // One level of the walk up is one round: the level's parents are read at the same time, then
  // taken in the level's order, so the list is the one a walk made one read at a time gives.
  const ancestorsOf = async (start: string): Promise<{ ancestors: string[]; stopped: string | null }> => {
    const out: string[] = [];
    let frontier = [start];
    for (let depth = 0; frontier.length > 0; depth++) {
      if (depth > maxDepth) return { ancestors: out, stopped: `is-a walk from ${start} stopped at depth ${maxDepth}` };
      const level: string[] = [];
      for (const t of frontier) {
        if (out.includes(t)) continue;
        out.push(t);
        level.push(t);
      }
      const parents = await Promise.all(level.map(parentsOf));
      const nextFrontier: string[] = [];
      for (const ps of parents) for (const parent of ps) if (!out.includes(parent)) nextFrontier.push(parent);
      frontier = nextFrontier;
    }
    return { ancestors: out, stopped: null };
  };

  // The record types fields name with a:fieldRecordType: each one's type name (from the term
  // that defines it) and the types above it, read the same way a kind's are.
  const recordTypeIris: string[] = [];
  for (const doc of declarations.terms)
    for (const type of refsUnder(doc, p.fieldRecordType.readKeys)) if (!recordTypeIris.includes(type)) recordTypeIris.push(type);

  // 5. Every walk up at once: the kinds' and the record types'.
  const [kindWalks, recordWalks] = await Promise.all([
    Promise.all(kinds.types.map((t) => ancestorsOf(t.term))),
    Promise.all(
      recordTypeIris.map(async (type) => {
        try {
          const typeName = typeAttributeOf(await termDoc(type));
          return { type, typeName, walk: await ancestorsOf(type), error: null };
        } catch (err) {
          return { type, typeName: null, walk: null, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    ),
  ]);

  const kindInputs: DeriveInput["kinds"] = [];
  kinds.types.forEach((t, i) => {
    const walk = kindWalks[i]!;
    if (walk.stopped) incompleteAt.push(walk.stopped);
    kindInputs.push({ term: t.term, name: t.name, label: t.label ?? docLabels.get(t.term) ?? null, ancestors: walk.ancestors });
  });
  if (!declarations.complete) incompleteAt.push(...declarations.incompleteAt.map((s) => `declarations: ${s}`));
  if (declarations.complete && declarations.incompleteAt.length === 0 && declarations.terms.length === 0) {
    // Zero declarations over a complete listing is a claim about the master, and a surprising
    // one. It is reported, ⛔ not rendered as "no fields".
    incompleteAt.push("declarations: the listing was complete and held no a:fieldOf carrier");
  }

  const recordTypes: NonNullable<DeriveInput["recordTypes"]> = [];
  for (const r of recordWalks) {
    if (r.walk === null) {
      // The field is still offered; its record cannot be written until the type can be read.
      incompleteAt.push(`record type ${r.type}: ${r.error}`);
      continue;
    }
    if (r.walk.stopped) incompleteAt.push(r.walk.stopped);
    recordTypes.push({ type: r.type, typeName: r.typeName, ancestors: r.walk.ancestors });
  }

  const { byKind, unreadable } = deriveFieldSets({ kinds: kindInputs, declarations: declarations.terms, predicates: p, recordTypes });
  return {
    kinds,
    byKind,
    complete: incompleteAt.length === 0 && unreadable.length === 0,
    incompleteAt,
    unreadable,
  };
}

/**
 * A party record's display name:
 * read `a:name`; fall back to `label` only where no name is present (legacy person
 * records hold the name there). Both spellings come from the terms, not from this file.
 * ⛔ A writer writes the name under `name.writeKey` only, never under the label spelling.
 */
export function readPartyName(
  facts: Record<string, unknown>,
  predicates: Pick<StakeholderPredicates, "name" | "label">,
): string | null {
  return textUnder(facts, predicates.name.readKeys) ?? textUnder(facts, predicates.label.readKeys);
}
