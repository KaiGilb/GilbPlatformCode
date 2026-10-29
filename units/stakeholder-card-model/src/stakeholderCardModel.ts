// The pure rules of a Stakeholder card, over the vocabulary read from the ontology master (`stakeholder-card-vocabulary`): which
// fields the card shows and edits for a kind, how a party's name is read and saved, how a create or retype names a record, and
// which term a field is. No kind and no field is named here.

import { isAppAddressableSlug } from "@kaigilb/gilbplatformcode-addressable-slug";
import { REFERENCE_RULES, type ReferenceRule } from "@kaigilb/gilbplatformcode-holder-reference";
import type { RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";
import type { StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import type { StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import type { KindFieldSet, StakeholderField, StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
import { PARTY_NAME_FLOOR, factKeyOfSpelling, partyNameKeys, partyNameOf, type PartySaveRule } from "./partyName";
import { fieldOfTerm } from "./termFields";

/**
 * What the host answers about the session's kinds. Each member replaces one cache call of the app, made when the function
 * runs (never read once at render).
 */
export interface SessionKindsHost {
  /**
   * The card's session reading, if the page holds one. Replaces
   * `qc.getQueryData<StakeholderCardVocabulary>(STAKEHOLDER_CARD_VOCABULARY_QUERY_KEY)` (GilbApp
   * `src/lib/base/stakeholderCard.ts` line 513).
   */
  cardVocabulary(): StakeholderCardVocabulary | undefined;
  /**
   * The Stakeholders entry's type set, if the page holds one. Replaces
   * `qc.getQueryData<StakeholderTypeSet>(STAKEHOLDER_TYPE_SET_QUERY_KEY)` (line 515).
   */
  typeSet(): StakeholderTypeSet | undefined;
  /**
   * Reads the type set from the master, held for the session by the page. Replaces `qc.fetchQuery(STAKEHOLDER_TYPE_SET_QUERY)`
   * (line 563); the options are `staleTime: KIND_SET_MAX_AGE_MS` and `retry: false`.
   */
  fetchTypeSet(): Promise<StakeholderTypeSet>;
}

// ── One card's fields ──────────────────────────────────────────────────────────────────

/**
 * How the card treats one field of the set:
 *   - `card-edit`: a literal the card's own edit path writes, under the field's one write spelling;
 *   - `reference-add`: a reference the package's checked write (`addReference`) writes;
 *   - `shown`: shown, ⛔ not offered for edit, with the reason.
 */
export type CardFieldMode = "card-edit" | "reference-add" | "shown";

export interface CardField {
  /** The attribute's term IRI, as the package served it. */
  term: string;
  /** The attribute's own label, or `null`: ⛔ never a guessed name. */
  label: string | null;
  /** The fact keys (bare slugs, as `readRecord` serves them) a stored value may sit under. */
  factKeys: string[];
  /** For `card-edit`: the one slug the card writes (`a:<slug>` on the wire). */
  slug: string | null;
  /** The field's one write spelling as the master serves it, or null. */
  writeKey: string | null;
  mode: CardFieldMode;
  /** For `reference-add`: the ruled check the package applies. */
  rule: ReferenceRule | null;
  /** For `shown`: why the card does not offer an edit. */
  shownBecause: string | null;
  many: boolean;
}

/** The fact key a read spelling reaches, or null: `readRecord` strips one `a:`. */
function factKeyOf(spelling: string): string | null {
  const bare = spelling.startsWith("a:") ? spelling.slice(2) : spelling;
  return isAppAddressableSlug(bare) ? bare : null;
}

/** The ruled check the package pairs with a write spelling, or null. Read from the package's own
 *  table (`REFERENCE_RULES`, keyed by term address `a/<name>`); ⛔ no field is named here. */
function ruleOf(writeKey: string | null): ReferenceRule | null {
  if (!writeKey || !writeKey.startsWith("a:")) return null;
  return REFERENCE_RULES[`a/${writeKey.slice(2)}`] ?? null;
}

const holdsReference = (encoding: string | null | undefined): boolean => /reference/i.test(String(encoding ?? ""));

/** The card's reading of one field of the set. Pure: the same set gives the same card. */
export function cardFieldOf(field: StakeholderField): CardField {
  const factKeys: string[] = [];
  for (const k of field.readKeys) {
    const f = factKeyOf(k);
    if (f && !factKeys.includes(f)) factKeys.push(f);
  }
  const base = { term: field.term, label: field.label, factKeys, many: field.many, slug: null, rule: null, writeKey: field.writeKey };
  if (field.record)
    return { ...base, mode: "shown", shownBecause: "it holds a record of its own, which is made with the record, not on the card" };
  const rule = ruleOf(field.writeKey);
  if (rule === "held-party")
    return { ...base, mode: "shown", rule, shownBecause: "the package checks this reference, and only the record-and-claims door writes it" };
  if (rule) return { ...base, mode: "reference-add", rule, shownBecause: null };
  if (holdsReference(field.encoding))
    return { ...base, mode: "shown", shownBecause: "it holds a reference the package's checked write does not write" };
  // No single declared encoding (none, or several: the package reads one string only): the card
  // does not guess a literal, as the package's own create does not (fixtureTag "No encoding
  // declared: … not writable by a create that will not guess"). Found on production's `t/Skill`,
  // which declares two encodings.
  if (!field.encoding)
    return { ...base, mode: "shown", shownBecause: "the master declares no single value encoding for it, so the card does not guess how to write it" };
  if (!field.writeKey)
    return { ...base, mode: "shown", shownBecause: field.writeKeyProblem ?? "the master names no spelling to write" };
  const slug = factKeyOf(field.writeKey);
  if (!slug || !field.writeKey.startsWith("a:"))
    return { ...base, mode: "shown", shownBecause: `this app cannot address its write spelling ${field.writeKey}` };
  return { ...base, slug, mode: "card-edit", shownBecause: null };
}

/** The field set of the kind a record's type names, by the type's bare name, or null. */
export function kindFieldSetOf(fieldSets: StakeholderFieldSets, typeUri: string): KindFieldSet | null {
  const name = typeLocalName(typeUri);
  return Object.values(fieldSets.byKind).find((k) => k.name === name) ?? null;
}

/** What one card shows about its type and fields. */
export type StakeholderCardState =
  | { state: "not-a-stakeholder-kind" }
  | { state: "reading" }
  /** The kinds could not be read: the card cannot tell whether this is a stakeholder kind. */
  | { state: "kinds-not-known"; reason: string }
  /** A stakeholder kind whose fields are not known yet: shown, no edit. */
  | { state: "fields-not-known"; reason: string }
  | { state: "ready"; kind: KindFieldSet; fields: CardField[]; complete: boolean; incompleteAt: string[] };

/**
 * Is the type one of the stakeholder kinds the session's reading lists? Pure. The ONE kind check,
 * called by the create/retype name rule and the card's state, so a change to it
 * (for example reading the list's `complete` flag) is made once.
 */
export function isListedKind(typeUri: string, kindNames: readonly string[]): boolean {
  return kindNames.includes(typeLocalName(typeUri));
}

/**
 * The kinds that READ AS A PERSON: the stakeholder kinds whose master field set carries the given-name AND the family-name terms. This is
 * the card's own test (`RecordDetail`'s `personNames`: both name fields found BY TERM in the kind's field set), asked of the reading
 * instead of one card's fields; ⛔ no kind is named (a Person is whatever the master gives those two terms). `null` when the reading
 * holds no field sets: the answer is not known, ⛔ never "no person kind". Pure.
 */
export function personKindNamesOf(v: Pick<StakeholderCardVocabulary, "fieldSets">): string[] | null {
  if (!v.fieldSets) return null;
  const names: string[] = [];
  for (const kind of Object.values(v.fieldSets.byKind)) {
    const fields = kind.fields.map(cardFieldOf);
    if (fieldOfTerm(fields, "givenName")?.slug && fieldOfTerm(fields, "familyName")?.slug && !names.includes(kind.name)) names.push(kind.name);
  }
  return names;
}

/** The card's state for a record type, from the session reading. Pure. */
export function stakeholderCardState(
  typeUri: string,
  reading: { data?: StakeholderCardVocabulary; error?: unknown; pending: boolean },
): StakeholderCardState {
  if (reading.data === undefined) {
    if (reading.pending) return { state: "reading" };
    const why = reading.error instanceof Error ? reading.error.message : String(reading.error ?? "the read did not finish");
    return { state: "kinds-not-known", reason: why };
  }
  const v = reading.data;
  if (!isListedKind(typeUri, v.kindNames)) return { state: "not-a-stakeholder-kind" };
  if (!v.fieldSets) return { state: "fields-not-known", reason: v.fieldSetsRefusal ?? "the field sets were not read" };
  const kind = kindFieldSetOf(v.fieldSets, typeUri);
  if (!kind) return { state: "fields-not-known", reason: `the master lists ${typeLocalName(typeUri)} as a stakeholder kind, and its field set was not read` };
  return { state: "ready", kind, fields: kind.fields.map(cardFieldOf), complete: v.fieldSets.complete, incompleteAt: v.fieldSets.incompleteAt };
}

// ── The card's rules, pure ─────────────────────────────────────────────────────────────

/** The stored values of a field, under every fact key it may sit under, as display strings. */
export function storedValuesOf(field: CardField, facts: RecordFacts): string[] {
  const out: string[] = [];
  for (const k of field.factKeys) {
    const v = (facts as Record<string, unknown>)[k];
    for (const one of Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]) {
      const s =
        typeof one === "string"
          ? one
          : one && typeof one === "object" && typeof (one as { "@id"?: unknown })["@id"] === "string"
            ? String((one as { "@id": string })["@id"])
            : JSON.stringify(one);
      if (s.trim() !== "" && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

/**
 * Which of a ready card's set fields the card's own edit path edits, and every other field of the
 * set (shown, or written only through the package's reference write). A literal whose value sits
 * under another spelling, or a field holding several values, is shown and not edited: the card
 * writes one value under one spelling, and would leave the other behind. Pure.
 * (A legacy party name under the label key is not "another spelling" of the name field: `a/name`
 * reads `a:name` only. The card shows it in the Name box through `cardPartyName`.)
 */
export function splitSetFields(fields: readonly CardField[], facts: RecordFacts): { editable: CardField[]; other: CardField[] } {
  const editable: CardField[] = [];
  const other: CardField[] = [];
  const filled = (k: string) => {
    const v = (facts as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "";
  };
  for (const f of fields) {
    if (f.mode !== "card-edit" || !f.slug) {
      other.push(f);
      continue;
    }
    const elsewhere = f.factKeys.filter((k) => k !== f.slug && filled(k));
    const held = (facts as Record<string, unknown>)[f.slug];
    if (elsewhere.length > 0)
      other.push({ ...f, mode: "shown", shownBecause: `its value is held under ${elsewhere.join(", ")}, and the card writes only ${f.slug}` });
    else if (Array.isArray(held) && held.length > 1)
      other.push({ ...f, mode: "shown", shownBecause: "it holds several values, and the card edits one value" });
    else editable.push(f);
  }
  return { editable, other };
}

/** The card's states in which it is not yet known whether the type is a stakeholder kind. */
export function kindsUnknownOf(state: StakeholderCardState): boolean {
  return state.state === "reading" || state.state === "kinds-not-known";
}

/**
 * The fact keys of every reference the package writes through its checked write, from the
 * package's own table (`REFERENCE_RULES`, keyed `a/<name>`). ⛔ No field is named here.
 */
export function packageReferenceFactKeys(): Set<string> {
  const out = new Set<string>();
  for (const term of Object.keys(REFERENCE_RULES)) {
    const name = term.startsWith("a/") ? term.slice(2) : null;
    if (name && isAppAddressableSlug(name)) out.add(name);
  }
  return out;
}

/**
 * May the card's own edit path offer an extra fact (one outside a ready card's set) for edit? Pure.
 *   - ready: no, a ready card edits its set only;
 *   - while it is not known whether the type is a stakeholder kind: not a fact whose NAME is
 *     one of the package's reference fields, whatever value it holds, and not a fact whose value is
 *     a reference (decided by the fact's name, ⛔ not by its current value);
 *   - otherwise, as before.
 */
export function extraFactEditable(
  slug: string,
  valueIsReference: boolean,
  state: StakeholderCardState,
  referenceKeys: ReadonlySet<string> = packageReferenceFactKeys(),
): boolean {
  if (state.state === "ready") return false;
  if (kindsUnknownOf(state)) return !valueIsReference && !referenceKeys.has(slug);
  return true;
}

/**
 * The facts a card's save must neither write nor retract: while the kinds are not known, every
 * fact named as one of the package's references. Pure.
 */
export function factsTheCardKeeps(state: StakeholderCardState, facts: RecordFacts, referenceKeys: ReadonlySet<string> = packageReferenceFactKeys()): string[] {
  if (!kindsUnknownOf(state)) return [];
  return Object.keys(facts).filter((k) => referenceKeys.has(k));
}

/**
 * The party's name on the card, and how a save writes it. Pure.
 *   - ready, with the set offering the name field: the session reading's own spellings;
 *   - ready, with the set offering no editable name field: no name slot, and still the party rule,
 *     so the save sends only the facts the person changed and ⛔ never runs `withCanonicalLabel`
 *     (the fallback guard: a known stakeholder kind's save never copies a name
 *     into `a:label` or `a:title`);
 *   - a stakeholder kind whose fields are not known, or a type the registry marks, while the kinds
 *     are not known: the dated floor's spellings. A record with no name under its one home:
 *     the name is shown, not edited, "not known yet"; the save still follows the party rule;
 *   - a record NOT KNOWN TO BE A PARTY that holds a name under its one home, in every other state
 *     (not a stakeholder kind, the kinds not known yet, with or without a registry entry): the
 *     one Name box is that home; a rename writes it only, and ⛔ neither writes nor retracts the
 *     legacy label or `title` (`retractLegacy: false`: retracting a legacy label is a party record's licence);
 *   - while the kinds are not known, a record not known to be a party that holds no name under its
 *     one home: the same rule. The Name box shows the name the record has, and a rename writes the one home only;
 *   - anything else (a known non-party record holding no name under its one home): not a party
 *     save, today's behaviour. ⛔ The card never binds the name to
 *     the label slot of a party.
 * The not-a-party rule and the window path are keyed on the FACT and on the card's state, ⛔ never on a kind list;
 * the name's home is read from `PARTY_NAME_FLOOR` through
 * `partyNameKeys`, ⛔ no second copy.
 * `nameSlot` is the slug the Name box binds to, or null; `notKnownYet` says the name is shown and
 * not edited.
 */
export function cardPartyName(
  state: StakeholderCardState,
  vocab: StakeholderCardVocabulary | undefined,
  facts: RecordFacts,
  editableSlugs: readonly string[],
  registryMarksStakeholderKind: boolean,
): { nameSlot: string | null; name: string | null; rule: PartySaveRule | null; notKnownYet: boolean } {
  if (state.state === "ready" && vocab?.fieldSets) {
    const predicates = vocab.fieldSets.kinds.predicates;
    const w = predicates.name.writeKey;
    const slug = w && w.startsWith("a:") ? factKeyOfSpelling(w) : null;
    // The fallback guard: a known stakeholder kind whose set offers no editable
    // name field is still saved by the party rule, with no name slot.
    if (!slug || !editableSlugs.includes(slug))
      return { nameSlot: null, name: partyNameOf(facts, predicates), rule: { keys: partyNameKeys(predicates) }, notKnownYet: false };
    return { nameSlot: slug, name: partyNameOf(facts, predicates), rule: { keys: partyNameKeys(predicates) }, notKnownYet: false };
  }
  const keys = partyNameKeys(null);
  const holdsOwn = typeof facts[keys.name] === "string" && String(facts[keys.name]).trim() !== "";
  const name = partyNameOf(facts, null);
  // Known to be a party: a stakeholder kind whose fields are not known, or, while the kinds are
  // not known, a type the registry marks.
  const knownParty = state.state === "fields-not-known" || (kindsUnknownOf(state) && registryMarksStakeholderKind);
  if (knownParty) {
    // A record that already holds its name under its one home binds the Name box there (it is
    // read-only while the card is locked); otherwise the name is shown, ⛔ never bound to the label.
    if (holdsOwn) return { nameSlot: keys.name, name, rule: { keys }, notKnownYet: false };
    return { nameSlot: null, name, rule: { keys }, notKnownYet: true };
  }
  // Not known to be a party (in the window also the unknown-kinds path): the one home only, nothing
  // retracted, nothing copied.
  if (holdsOwn || kindsUnknownOf(state)) return { nameSlot: keys.name, name, rule: { keys, retractLegacy: false }, notKnownYet: false };
  return { nameSlot: null, name: null, rule: null, notKnownYet: false };
}

// ── A create's name ─────────────────────────────────────────────────────────────────

/**
 * The stakeholder kinds' bare names as this session has already read them, or `null` when it has
 * not: the card's session reading first, then the Stakeholders entry's type set. ⛔ No master read
 * is started here, and ⛔ no kind is named.
 */
export function sessionKindNames(host: SessionKindsHost): readonly string[] | null {
  const card = host.cardVocabulary();
  if (card) return card.kindNames;
  const set = host.typeSet();
  return set ? set.names : null;
}

/**
 * How a create or retype of this type names the record.
 * Pure; one decision for both acts:
 *   - `party`: the registry marks the type as a stakeholder kind, or the session's kinds list it;
 *   - `generic`: the registry gives the type its own name field (a non-party entry), or the
 *     session's kinds were read and do not list it (today's create);
 *   - `unknown`: the kinds are not known at that moment, so the type may be a party.
 */
export type NameRule = "party" | "generic" | "unknown";
export function nameRuleFor(
  typeUri: string,
  spec: { nameField?: string; fieldsFrom?: string } | null | undefined,
  kindNames: readonly string[] | null,
): NameRule {
  if (spec?.fieldsFrom === "stakeholder-package") return "party";
  if (spec?.nameField) return "generic";
  if (kindNames === null) return "unknown";
  return isListedKind(typeUri, kindNames) ? "party" : "generic";
}

/**
 * Does a create write the name under its one home only, with ⛔ no `a:label` and no `a:title`?
 * A party kind, yes; the kinds not known, yes, for any type ("the name may go under `a:name` only
 * for any type; ⛔ never under `a:label` for a type that may be a party"); otherwise today's create.
 */
export function createWritesNameOnly(
  typeUri: string,
  spec: { nameField?: string; fieldsFrom?: string } | null | undefined,
  kindNames: readonly string[] | null,
): boolean {
  return nameRuleFor(typeUri, spec, kindNames) !== "generic";
}

/**
 * The kinds as this session holds them; when it holds none, read the Stakeholders entry's type set
 * (one master read, held for the session), waiting at most `timeoutMs`. `null` when they cannot be
 * known in that time. For acts that may wait (a retype), ⛔ never a render path.
 */
export async function sessionKindNamesSettled(host: SessionKindsHost, timeoutMs = 2500): Promise<readonly string[] | null> {
  const held = sessionKindNames(host);
  if (held) return held;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const set = await Promise.race([
      host.fetchTypeSet(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return set ? set.names : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The facts a retype sends when the new type's name rule is `party` or `unknown`. Pure.
 * The PUT replaces the record's facts, so what is left out is retracted:
 *   - the name goes under its one home (`PARTY_NAME_FLOOR.name`): the home's own value, else the
 *     value of the slot the Name box was bound to, else the name the card showed;
 *   - `party`: the slot that held the name (`label` or `title`) and the legacy label are ⛔ not
 *     re-asserted (a party's name under them is not written; retracting a legacy label is a party record's licence);
 *   - `unknown`: ⛔ nothing is left out. The record is not known to be a party, so nothing of it
 *     may be retracted; its facts ride along as they are;
 *   - every other fact rides along, a separate `title` included.
 */
export function nameOnlyRetypeFacts(
  facts: Readonly<Record<string, string>>,
  nameSlot: string,
  shownName: string | null,
  rule: Exclude<NameRule, "generic"> = "party",
): Record<string, string> {
  const home = PARTY_NAME_FLOOR.name;
  const out: Record<string, string> = { ...facts };
  const moved = (out[home] ?? "").trim() || (out[nameSlot] ?? "").trim() || (shownName ?? "").trim();
  if (moved) out[home] = moved;
  if (rule !== "party") return out;
  if (nameSlot !== home && (nameSlot === "title" || PARTY_NAME_FLOOR.legacy.includes(nameSlot))) delete out[nameSlot];
  for (const legacy of PARTY_NAME_FLOOR.legacy) if (legacy !== home) delete out[legacy];
  return out;
}

/**
 * The registry's field list the card offers beside the Name box. Where the card binds
 * the name to its one home and the registry names another fact as the type's name field, that
 * field is ⛔ not offered as a second name box (it stays shown as its own fact). Pure.
 */
export function registryFieldsBesideName<F extends { slug: string }>(
  fields: readonly F[] | undefined,
  registryNameField: string | undefined,
  nameSlot: string | null,
): readonly F[] {
  const all = fields ?? [];
  return nameSlot && registryNameField && registryNameField !== nameSlot ? all.filter((f) => f.slug !== registryNameField) : all;
}

/**
 * The window path while the kinds are not known (a record not known to be a party, `retractLegacy: false`): while its Name
 * box shows a name read from the legacy label (nothing is held under the name's one home yet), that
 * label is the box's value and is not listed a second time. Once a name is held under the home, a
 * leftover label is shown as its own fact. A known party's card is unchanged. Pure.
 */
export function legacyShownInNameBox(
  slug: string,
  party: { nameSlot: string | null; rule: PartySaveRule | null },
  draft: Readonly<Record<string, unknown>>,
): boolean {
  return (
    !!party.nameSlot &&
    party.rule?.retractLegacy === false &&
    party.rule.keys.legacy.includes(slug) &&
    String(draft[party.nameSlot] ?? "").trim() === ""
  );
}

