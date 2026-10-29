// The skill a person picks from the catalogue, and the one place its canonical referent is chosen. A copy of the app's `ThinSkill` and `skillReferentUri`
// (the other functions of that file, the search and the grouping, belong to the picker, which is the host's).

import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export interface ThinSkill {
  tag: string;
  /**
   * ⚠ ENTITY STORAGE ADDRESS (`<ontology origin>/base/e/<opaque-id>`) — **not** the
   * referent. Retained for provenance. Never use it to key a claim: use
   * {@link skillReferentUri}.
   */
  uri: string;
  /**
   * 🔴 THE CANONICAL SKILL REFERENT — `<ontology origin>/base/t/<PascalName>`.
   *
   * The ontology publishes exactly four routes and `/base/e/:id` is not among them, so the opaque
   * id is a storage address that 404s to every anonymous consumer. This is the form the source
   * actually publishes and the form the claim path canonicalizes and accepts.
   */
  typeUri: string;
  does: string;
  escoUri: string | null;
  harnessRole: string | null;
  /** Immediate broader label (ESCO hierarchy / is-a parent). */
  parentLabel?: string;
  /** Breadcrumb from root toward the skill (excludes the skill itself). Multi-level ESCO path. */
  path?: string[];
  /** ESCO hierarchy concept code when known (e.g. S1.6.1). */
  hierarchyCode?: string;
}

/**
 * The URI a claim is keyed on. **The one place the referent is chosen.**
 *
 * Refuses rather than falling back to {@link ThinSkill.uri}. A fallback to the storage address
 * would be invisible: the claim would POST happily, the platform's validator would 400 it, and
 * the user would see a save failure with no indication that the catalog was the cause. Failing here names the real fault.
 *
 * @param skill catalog entry the user picked
 * @returns the canonical `/base/t/<PascalName>` referent
 */
export function skillReferentUri(skill: ThinSkill): string {
  const t = skill.typeUri;
  const MASTER = termOrigin().replace(/[.*+?^$()|[\]\\/{}]/g, "\\$&");
  const CANONICAL_REFERENT = new RegExp(`^${MASTER}/base/t/[A-Z][A-Za-z0-9]*$`);
  if (!t || !CANONICAL_REFERENT.test(t)) {
    throw new Error(
      `Skill "${skill.tag}" has no canonical BaseVeda referent (typeUri=${JSON.stringify(t)}). ` +
        `The claim referent must be ${termOrigin()}/base/t/<PascalName>; the /base/e/ ` +
        "storage address is not a published identifier and Base refuses it.",
    );
  }
  return t;
}
