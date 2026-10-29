/**
 * One My Note and one Where / How we met per person, in the vault, however many apps read them.
 *
 * WHY. Apps write `t:ContactPrivateNote` / `t:ConnectionOrigin` through `GET/PUT /base/connect/annotations`, keyed to
 * `a:heldParty`. One app keyed a held stakeholder record by the RECORD's address, another a contact by the person's PRINCIPAL. The route
 * matches the key exactly and does not follow `a:sameAs`, so a note written in one app was not seen in the other.
 *
 * THE RULE (one copy, every app): each app reads and writes ONLY this key. A person linked to an online card is keyed by the
 * principal; only a local stakeholder with no link keeps the record's address. Notes written earlier under the record of a
 * linked person are no longer read; they are left in the vault as they are (⛔ no delete, ⛔ no rewrite, ⛔ no move). ⛔ Never by name: the principal is the one the app already holds
 * or the platform's resolver named for the record's `a:sameAs`.
 */

import type { ResolveOutcome } from "./anchorResolver";

/**
 * The resolver's DEFINITE answers that a link is not to a person.
 * ⛔ Not "none": the platform's one 404 is also its answer when the target cannot be
 * reached or is not the caller's to open, so it says nothing definite about who the link is to. It is UNKNOWN, like a failed lookup.
 * ⛔ Not from the stored `a:sameAs` either: a person's principal and a group vault's address have the same shape (`https://<host>/vault`).
 */
const NOT_A_PERSON: ReadonlySet<ResolveOutcome["kind"]> = new Set(["organization"]);

/**
 * The ONE key (`a:heldParty`) a person's My Note and Where / How we met are read and written under.
 *
 * 🔴 A record LINKED to a person NEVER uses the record's address. "Linked" is decided from the record's own link
 * (`a:sameAs` present), ⛔ not from whether the principal could be looked up: when the lookup has not answered or failed (500, time-out,
 * sign-in, busy, or the platform's one 404 "none") the key is UNKNOWN (null): the caller reads nothing, writes nothing and shows the
 * fields as while the person is being looked up. Only a DEFINITE answer that the link is not a person (`linkAnswer` "organization")
 * keys the notes to the record, as before the shared key.
 *
 * @param subject `linkedPrincipal`: the principal the person is (linked to), when known; `linked`: the record carries a link (`a:sameAs`);
 *   `linkAnswer`: the resolver's answer kind for that link, when it answered; `record`: the holder's record
 * @returns the principal when there is one; the record's address for a record that is not linked, or whose link is definitely not a
 *   person (organization); else null (a link whose answer is not known, including "none")
 */
export function heldNoteKey(subject: {
  linkedPrincipal?: string | null;
  linked?: boolean;
  linkAnswer?: ResolveOutcome["kind"] | null;
  record?: string | null;
}): string | null {
  const p = subject.linkedPrincipal?.trim();
  if (p) return p;
  if (subject.linked && !(subject.linkAnswer && NOT_A_PERSON.has(subject.linkAnswer))) return null;
  const r = subject.record?.trim();
  return r ? r : null;
}
