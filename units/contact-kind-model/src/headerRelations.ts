/**
 * The RELATION CHIPS of the shared contact header (`ContactHeader` of `contact-header`), as data. Pure: no read, no write.
 *
 * The header shows the predicates in use: not words made up for them, but the actual predicate used from the ontology.
 *
 * WHAT A CHIP SAYS, and where each word comes from (⛔ there is NO word list in this app; a predicate minted tomorrow shows with no release):
 * - a kind label on the record (`t:HeldPartyFieldClaim`, `a:relationshipKind`) whose catalogue entry names a predicate (`a:kindPredicate`):
 *   that PREDICATE, by the GilbVeda term's own `a:label` as served (`customer-of`), read from `GET /base/vocab?status=all&linkPlane=user`;
 * - a relation edge already stored between the contact's record and the seen-from vault's entity (contact -> vault, or either way for a
 *   symmetric predicate), with any user-plane predicate: the same, once (an edge and a kind of the same predicate are ONE chip);
 * - a predicate whose term carries no `a:label`, or a vocabulary that could not be read: the term's own NAME, its CURIE (`t:CustomerOf`), in
 *   the mono look, ⛔ never a made-up word;
 * - a kind label whose entry names NO predicate (the holder's own kind, "Book club"; the master's Competitor): its own label, DASHED, so it is
 *   never mistaken for a GilbVeda term.
 * The circle labels (`a:circleLabel`) are not relations and are not drawn here (they stay in the card body).
 */
import type { ContactHeaderRelation } from "@kaigilb/gilbplatformcode-contact-header";
import type { LinkPlaneCatalog, LinkTerm } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { ContactChip } from "./contactKindModel";

/**
 * The DEFAULT tie between two PARTIES
 * (a person or an organization and another party, or the vault a contact is held in): GilbVeda `t/AssociatedWith` ("associated-with",
 * Suggested, symmetric), the parent of every kind predicate (friend-of, customer-of ...). ⛔ NOT `t:ConnectedTo`, which in GilbVeda means
 * process / flow topology. A specific kind picked later REPLACES it (the specific is written, then the default is ended);
 * the two are never kept side by side. Links that are not between two parties keep a generic predicate of their own.
 * A write door refuses it when the live user-plane catalogue does not list it: nothing else is written in its place.
 */
export const DEFAULT_PARTY_TIE_CURIE = "t:AssociatedWith";

/** What the chip of a kind says while its words have not read (the kind-label reader): such a chip is not drawn in the header until it has. */
const PENDING = "…";

/** The canonical form of an entity address, for comparing two spellings of the same one (host lower-cased, no trailing slash, no query). */
export function canonicalEntity(u: string | null | undefined): string {
  if (!u) return "";
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host.toLowerCase()}${p.pathname.replace(/\/+$/, "")}`;
  } catch {
    return u.replace(/\/+$/, "");
  }
}
/** Two spellings of the same entity address (host case, trailing slash, query ignored). */
export const sameEntity = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && canonicalEntity(a) === canonicalEntity(b);

/** The local name of a type in any spelling (`t:FriendOf`, `https://…/t/FriendOf` → `FriendOf`). */
const typeTail = (t: string): string => t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf(":")) + 1);

/** The catalog's term for a CURIE (or a type IRI the reverse lookup reports), or null. */
function termOf(catalog: LinkPlaneCatalog | null, curieOrIri: string): LinkTerm | null {
  if (!catalog) return null;
  const tail = typeTail(curieOrIri);
  return catalog.terms.find((t) => t.curie === curieOrIri || typeTail(t.curie) === tail) ?? null;
}

/**
 * The catalog CURIE when `row` is a user-plane tie between this record and the vault entity, or null.
 * Kept: contact as source and the vault as target, or, for a SYMMETRIC predicate, either way round.
 * A row without `type` and `members` is not guessed at. A predicate that is not on the user plane
 * (membership, grant, process) is not a tie the header names. A directed row from the vault to the
 * contact is not drawn (its forward label would read the wrong way round).
 */
export function vaultKindCurie(
  row: RecordRelation,
  recordEntity: string | null | undefined,
  vaultEntity: string | null | undefined,
  catalog: LinkPlaneCatalog | null,
): string | null {
  if (!row.type || !row.members || row.members.length === 0) return null;
  if (!recordEntity || !vaultEntity || !catalog) return null;
  const term = termOf(catalog, row.type);
  if (!term) return null;
  const src = row.members.find((m) => /source$/.test(m.role))?.member;
  const tgt = row.members.find((m) => /target$/.test(m.role))?.member;
  const forward = sameEntity(src, recordEntity) && sameEntity(tgt, vaultEntity);
  const backward = term.symmetric && sameEntity(src, vaultEntity) && sameEntity(tgt, recordEntity);
  return forward || backward ? term.curie : null;
}

/**
 * The user-plane relations between the contact's record and the seen-from vault's entity, from the record's reverse lookup (the rows the
 * platform answers with `members` and `type`: exactly the relations the caller may read, C210).
 *
 * @returns the CURIEs, as the catalog spells them, in the order found, each once
 */
export function edgesToVault(
  rows: readonly RecordRelation[] | null | undefined,
  recordEntity: string | null | undefined,
  vaultEntity: string | null | undefined,
  catalog: LinkPlaneCatalog | null,
): string[] {
  if (!rows || !recordEntity || !vaultEntity || !catalog) return [];
  const out: string[] = [];
  for (const r of rows) {
    const curie = vaultKindCurie(r, recordEntity, vaultEntity, catalog);
    if (curie && !out.includes(curie)) out.push(curie);
  }
  return out;
}

/** One predicate chip, by its CURIE: the term's own label from the catalog, else its name. */
function predicateChip(curie: string, catalog: LinkPlaneCatalog | null, catalogFailed: boolean, contactName: string, holderName: string): ContactHeaderRelation {
  const term = termOf(catalog, curie);
  const id = term?.curie ?? curie;
  if (term && term.labelled !== false && term.label.trim()) {
    const label = term.label.trim();
    return { key: id, text: label, kind: "predicate", curie: id, title: `${contactName} ${label} ${holderName} · GilbVeda ${id} · private, grants nothing` };
  }
  const why = catalogFailed || !catalog ? "The GilbVeda vocabulary could not be read" : term ? `GilbVeda ${id} has no label yet` : `${id} is not in GilbVeda's user relations`;
  return { key: id, text: id, kind: "term-name", curie: id, title: `${why}; its own name is shown` };
}

export interface HeaderRelationsInput {
  /** The kind chips on the record, in their order (the kind-label reader's chips); null while not read. */
  kindChips: readonly ContactChip[] | null;
  /** Per entry: its `a:kindPredicate` reference; null = none; undefined = not read yet (the kind-label reader's entry predicates). */
  entryPredicates: ReadonlyMap<string, string | null | undefined>;
  /** Per predicate reference: its CURIE; null = it could not be read; undefined = not read yet (read once from the predicate's term). */
  predicateCuries: ReadonlyMap<string, string | null | undefined>;
  /** The user-plane catalog (`readUserLinkPlaneCatalog`); null while not read or when it could not be read. */
  catalog: LinkPlaneCatalog | null;
  /** True when the catalog read failed (the chips then show the terms' names). */
  catalogFailed: boolean;
  /** The CURIEs of the relation edges between the record and the vault (`edgesToVault`). */
  edges: readonly string[];
  contactName: string;
  holderName: string;
}

/**
 * The header's relation chips, in order: the record's kinds as the card orders them (each predicate kind by its GilbVeda label; each kind
 * with no predicate as the holder's own, dashed), then any relation edge not already named by a kind. Each predicate once.
 * A kind whose words, predicate or label are still being read is left out until they land (⛔ never a placeholder word).
 */
export function headerRelations(input: HeaderRelationsInput): ContactHeaderRelation[] {
  const { catalog, catalogFailed, contactName, holderName } = input;
  const out: ContactHeaderRelation[] = [];
  const seen = new Set<string>();
  const waitingForCatalog = !catalog && !catalogFailed;
  const push = (curie: string) => {
    const chip = predicateChip(curie, catalog, catalogFailed, contactName, holderName);
    if (seen.has(chip.key)) return;
    seen.add(chip.key);
    out.push(chip);
  };
  for (const c of input.kindChips ?? []) {
    if (c.axis !== "relationshipKind") continue;
    if (c.label === PENDING) continue;
    const ref = input.entryPredicates.get(c.entryId);
    if (ref === undefined) continue;
    if (ref === null) {
      const key = `own:${c.entryId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, text: c.label, kind: "own", curie: null, title: `${c.label}: your own label for ${contactName}. Not a GilbVeda relation; private; grants nothing.` });
      continue;
    }
    const curie = input.predicateCuries.get(ref);
    if (curie === undefined || waitingForCatalog) continue;
    if (curie === null) {
      // The predicate's term did not read after the retries : the kind's own word, in the dashed own-label look,
      // saying the relation term could not be read. ⛔ Never any part of the term's address. The next load shows the GilbVeda label once it reads.
      const key = `unread:${c.entryId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, text: c.label, kind: "own", curie: null, title: `${c.label}: relation term could not be read` });
      continue;
    }
    push(curie);
  }
  for (const curie of input.edges) push(curie);
  // The default tie (associated-with) is shown only while no specific kind is there. A specific kind
  // replaces it; if ending it failed after a pick, both may be live for a moment, and only the specific one is named. A holder's own label is not a
  // tie and does not hide it.
  const specific = out.some((c) => (c.kind === "own" ? c.key.startsWith("unread:") : !isDefaultPartyTie(c.curie)));
  return specific ? out.filter((c) => !isDefaultPartyTie(c.curie)) : out;
}

/** The default party tie (`t:AssociatedWith`), in any spelling of that CURIE. */
export function isDefaultPartyTie(curie: string | null | undefined): boolean {
  return !!curie && typeTail(curie) === typeTail(DEFAULT_PARTY_TIE_CURIE);
}
