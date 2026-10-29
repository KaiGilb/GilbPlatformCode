// A party's name: where every reader takes it from, and what a save
// that changes it writes.
//
// THE RULE (read back on the ontology master):
//   - READ: `a:name`, then the legacy `a:label`, and nothing else. `a:title` is ⛔ not a spelling of
//     a party's name (on the master it is a document's headline, "rather than to an agent").
//   - WRITE: `a:name` only. A save that changes the name of a record that holds `a:label` also
//     retracts that `a:label` in the same write (`"a:label": null`). `a:title` is ⛔ never
//     written and ⛔ never retracted (equal value is resemblance, not identity).
//
// TWO SOURCES, ONE RULE:
//   - the package's `readPartyName`, with both spellings taken from the master's own terms, once the
//     session reading holds them (`predicates`);
//   - `PARTY_NAME_FLOOR` below, a DATED snapshot of the same three reads, for the synchronous
//     surfaces (the list, search, the graph, pickers) that cannot await the master.
// ⛔ No kind is named here: the read is keyed on the FACT, as the
//   rule allows for every instance record ("on any instance record that holds a:name,
//   a:name is its name"), ⛔ not on a list of party types.
import { readPartyName } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import type { StakeholderPredicates } from "@kaigilb/gilbplatformcode-stakeholder-kinds";

/**
 * The synchronous floor's seed (dated, naming its source and its
 * control). Read by the ontology steward, public GETs, 2026-10-04T16:11:28Z:
 *   `https://ontology.example.test/base/a/name`  → 200, Approved, `a:predicateAttribute` `a:name`;
 *   `https://ontology.example.test/base/a/label` → 200, Suggested, `a:label` (its `a:does` carries the
 *     clause: "a reader shows a:name and falls back to that label only where a:name is absent");
 *   `https://ontology.example.test/base/a/title` → 200, Approved, "rather than to an agent";
 *   control `https://ontology.example.test/base/a/zzqqnotanattr` → 404.
 * Fact keys are bare slugs, as `readRecord` serves them (one `a:` stripped).
 */
export const PARTY_NAME_FLOOR = {
  capturedAt: "2026-10-04T16:11:28Z",
  source: "the ontology host's /base/a/name, /base/a/label and /base/a/title (control /base/a/zzqqnotanattr 404); the party-name ruling §1",
  /** The name's one home: read first, and the only spelling a save writes. */
  name: "name",
  /** The legacy home: read only where `name` is absent; retracted by a save that changes the name. */
  legacy: ["label"] as readonly string[],
} as const;

/** The party's name spellings as fact keys (bare slugs). */
export interface PartyNameKeys {
  name: string;
  legacy: readonly string[];
}

/** The fact key a term's read spelling reaches: `readRecord` strips one `a:`. */
export function factKeyOfSpelling(spelling: string): string {
  return spelling.startsWith("a:") ? spelling.slice(2) : spelling;
}

/** The party name's keys from the session reading's predicates, or the dated floor. */
export function partyNameKeys(predicates?: Pick<StakeholderPredicates, "name" | "label"> | null): PartyNameKeys {
  if (!predicates) return PARTY_NAME_FLOOR;
  const name = predicates.name.writeKey ? factKeyOfSpelling(predicates.name.writeKey) : PARTY_NAME_FLOOR.name;
  // The term serves a spelling with and without `a:`; both reach the same fact key, once.
  const legacy = [...new Set(predicates.label.readKeys.map(factKeyOfSpelling))].filter((k) => k !== name);
  return { name, legacy: legacy.length > 0 ? legacy : PARTY_NAME_FLOOR.legacy };
}

function text(facts: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = facts?.[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * A record's party name, or null. With the session reading's predicates it is the package's own
 * `readPartyName` (bare fact keys put back under the spellings it reads); without them, the floor.
 * Both give `name`, then the legacy label, and never `title`.
 */
export function partyNameOf(
  facts: Record<string, unknown> | null | undefined,
  predicates?: Pick<StakeholderPredicates, "name" | "label"> | null,
): string | null {
  if (!facts) return null;
  if (predicates) {
    const spelled: Record<string, unknown> = {};
    for (const k of [...predicates.name.readKeys, ...predicates.label.readKeys]) {
      const v = facts[factKeyOfSpelling(k)];
      if (v !== undefined) spelled[k] = v;
    }
    const n = readPartyName(spelled, predicates);
    return n && n.trim() !== "" ? n.trim() : null;
  }
  const keys = PARTY_NAME_FLOOR;
  const own = text(facts, keys.name);
  if (own) return own;
  for (const k of keys.legacy) {
    const v = text(facts, k);
    if (v) return v;
  }
  return null;
}

/** A save of a party record: which keys hold its name, and which facts the save must leave alone. */
export interface PartySaveRule {
  keys: PartyNameKeys;
  /**
   * The retraction of the legacy label on a changed name. `false` only where the record is not
   * known to be a party (before the kinds are known, a record of a type the registry does
   * not mark is saved name-only, but ⛔ its label is not retracted, because the
   * retraction is licensed on a party record only). Absent means `true`.
   */
  retractLegacy?: boolean;
}

/**
 * The merge-patch body (bare slugs; `null` deletes) a save of a PARTY record sends. Pure.
 *
 *   - Only facts the person changed are sent; an unchanged fact is preserved by omission (the PATCH
 *     door is a read-modify-write that keeps what it is not told). This also stops a rename from
 *     re-sending facts nobody touched (`"a:email": null` on a rename).
 *   - The name is written under `keys.name` only. ⛔ No legacy label key and ⛔ no `title` is ever
 *     written from it, whatever the editor's map holds for them.
 *   - When the name changed and the record holds a legacy label, that label is retracted in the same
 *     write. ⛔ `title` is never retracted.
 *   - `keep` names facts the save neither writes nor retracts (a reference the card does not edit).
 *   - A fact the editor dropped is retracted only when `retractable` says so (the caller's sweep rule).
 */
export function partySavePatch(
  served: Readonly<Record<string, string | undefined>>,
  next: Readonly<Record<string, string | undefined>>,
  rule: PartySaveRule,
  opts: { keep?: ReadonlySet<string>; retractable?: (slug: string) => boolean } = {},
): Record<string, string | null> {
  const never = new Set<string>([...rule.keys.legacy, "title"]);
  const keep = opts.keep ?? new Set<string>();
  const patch: Record<string, string | null> = {};
  for (const [k, raw] of Object.entries(next)) {
    if (never.has(k) || keep.has(k)) continue;
    const v = raw ?? "";
    if (v === (served[k] ?? "")) continue;
    patch[k] = v === "" ? null : v;
  }
  for (const k of Object.keys(served)) {
    if (k in next || never.has(k) || keep.has(k)) continue;
    if (opts.retractable && !opts.retractable(k)) continue;
    patch[k] = null;
  }
  if (rule.retractLegacy !== false && rule.keys.name in patch) {
    for (const legacy of rule.keys.legacy) {
      if ((served[legacy] ?? "").trim() !== "") patch[legacy] = null;
    }
  }
  return patch;
}
