/**
 * The words a person reads for a relation on the card: a human label and a one-line helper.
 *
 * `a:actsOnBehalfOf` is an ontology term: "REPRESENTATION: X acts-on-behalf-of Y … directed, representative →
 * represented" (read 2026-10-16). It says the person speaks or acts for another party: a lawyer for a client, a contact
 * person for their company. The master's label is the hyphenated "Acts-On-Behalf-Of" (the term's own name), which a person
 * cannot read as a sentence; this module gives the card its human label and one line that says what it means.
 *
 * ⚠ DISPLAY copy keyed by the TERM's name (`termName`), as `PICKED_BY_TERM` is for the pickers: it names no field, writes
 * nothing, and a term that is not listed keeps the master's own label and no helper. ⛔ Not a term, not data (UI
 * labels are out of the term plane).
 */
import type { CardIconName } from "./cardIconName";

export interface RelationCopy {
  /** The card's title for the frame. */
  readonly label: string;
  /** One line under the title: what the relation means. */
  readonly helper: string;
  readonly icon: CardIconName;
}

const COPY: Readonly<Record<string, RelationCopy>> = Object.freeze({
  actsOnBehalfOf: {
    label: "Represents",
    helper: "Acts or speaks for another party: a lawyer for a client, a contact person for their company.",
    icon: "represents",
  },
  memberOf: {
    label: "Member of",
    helper: "The groups, companies or teams this record belongs to.",
    icon: "memberOf",
  },
});

/** The human copy for a relation term (`actsOnBehalfOf`, as `termName` gives it), or null when the master's label stands. */
export function relationCopyOf(term: string | null | undefined): RelationCopy | null {
  return term ? (COPY[term] ?? null) : null;
}
