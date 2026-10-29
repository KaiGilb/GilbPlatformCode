/**
 * What a link field of a stakeholder card may point at, for its PICKER: every field is a type lookup, nothing is hard-coded.
 *
 * ⛔ No kind is named here. Which records a link may point at is the PACKAGE's rule
 * (`REFERENCE_RULES` of `holder-reference` and its reference reading, read from the master): the picker
 * offers exactly what `checkReference` would admit, and every add still goes through the package's
 * checked write (`addReference`), which checks again and refuses anything else with nothing sent.
 *   - `membership` (`a:memberOf`): a group whose type is a role relation's reference end, where the
 *     CARRIER's kind is among that relation's players;
 *   - `party` (`a:actsOnBehalfOf`): a record of one of the party kinds (`t/PartyMemberOf`'s);
 *   - `contact-term` (`a:preferredChannel`): ⛔ not a record: one of the carrier's own contact fields
 *     (a field of its kind whose type is under `t/ContactPoint`) under which the record holds a value,
 *     named by the attribute's own address;
 *   - `held-party`: written only by the record-and-claims door; no picker.
 * WHICH VAULT: the carrier's own (the vault that holds the record). The package never admits a target in
 * another vault, a held one included ("⛔ Never into another vault, including another vault the same
 * holder holds"), so no other vault is searched.
 *
 * Pure but for `findLinkTargets` (one walk of the vault's typed list, the package's `findCandidates`).
 */
import type { ReferenceReading, ReferenceRule } from "@kaigilb/gilbplatformcode-holder-reference";
import { findCandidates, type Candidate, type PickerReading } from "@kaigilb/gilbplatformcode-pick-or-create";
import { platformFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import type { KindFieldSet, StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** The bare type names a record target of this rule may have, for a carrier of this kind. */
export function admittedTargetNames(reading: ReferenceReading, rule: ReferenceRule, carrierKind: string): string[] {
  switch (rule) {
    case "membership":
      return [...new Set(reading.relations.filter((r) => r.playerNames.includes(carrierKind)).map((r) => r.groupName))];
    case "party":
      return [...reading.party.names];
    default:
      return [];
  }
}

/** The candidates in the carrier's vault a record link may point at: the package's find, kept to the
 *  admitted types. `complete` is the find's: false means the list is a floor, ⛔ never "no such record". */
export async function findLinkTargets(
  fieldSets: StakeholderFieldSets,
  vaultId: string,
  admitted: readonly string[],
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<{ candidates: Candidate[]; complete: boolean }> {
  if (admitted.length === 0) return { candidates: [], complete: true };
  // `findCandidates` reads only the reading's field sets (the kinds it lists for); the tag grammar and
  // the stater's spelling a full picker reading also holds are for CREATE, which a link never does, so
  // they are not read for it (the create panel reads them).
  const reading = { fieldSets } as PickerReading;
  const found = await findCandidates(
    { platform: { origin: vaultOriginOf(vaultId), fetch: fetchImpl ?? platformFetch() }, reading },
    { vaultId },
  );
  return { candidates: found.candidates.filter((c) => admitted.includes(typeLocalName(c.type))), complete: found.complete };
}

/** The candidates whose name holds the typed text, ignoring case (the package's own `text` rule). */
export function matchingTargets(candidates: readonly Candidate[], text: string): Candidate[] {
  const needle = text.trim().toLocaleLowerCase();
  if (!needle) return [...candidates];
  return candidates.filter((c) => (c.label ?? "").toLocaleLowerCase().includes(needle));
}

/** One contact field the record may name as its preferred channel. */
export interface ChannelChoice {
  /** The field's own label from the master (or its write spelling when it has none). */
  label: string;
  /** The value written: the attribute's address on the master (`…/base/a/<name>`). */
  target: string;
}

/**
 * The carrier's contact fields that hold a value: the choices for a `contact-term` link. The address is
 * the attribute's own (`<master>/base/a/<name>` from its write spelling, the route every term is read at); the package derives the same address from the term's own document and refuses any
 * other form, so a wrong address is refused with nothing sent.
 */
export function channelChoices(reading: ReferenceReading, kind: KindFieldSet, facts: Record<string, unknown>): ChannelChoice[] {
  const out: ChannelChoice[] = [];
  for (const f of kind.fields) {
    if (!reading.contactTypes.terms.includes(f.term) || !f.writeKey?.startsWith("a:")) continue;
    const held = f.readKeys.some((k) => {
      const v = facts[k.replace(/^a:/, "")] ?? facts[k];
      return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    });
    if (!held) continue;
    out.push({ label: f.label ?? f.writeKey, target: `${termOrigin()}/base/a/${f.writeKey.slice(2)}` });
  }
  return out;
}

/** The label of a stored preferred channel (an attribute address), from the carrier kind's fields. */
export function channelLabelOf(kind: KindFieldSet, target: string): string | null {
  const m = /\/base\/a\/([^/#?]+)$/.exec(target);
  if (!m) return null;
  const f = kind.fields.find((x) => x.writeKey === `a:${m[1]}`);
  return f ? (f.label ?? f.writeKey) : null;
}
