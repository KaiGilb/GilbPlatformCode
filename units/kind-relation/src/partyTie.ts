/**
 * The DEFAULT PREDICATE of a new link between two records. A link between two PARTIES (a person or an organization, on both ends) starts as
 * `t:AssociatedWith` (the generic social tie); every other link keeps `t:ConnectedTo` (files, folders, tasks, documents, equipment).
 *
 * WHAT A PARTY IS, read from the master, ⛔ no type named here: a type that some relationship kind with a predicate may be said of (`a:playableBy`
 * of the `t:RelationshipKind` entries that carry `a:kindPredicate`: Person and Organization today), the record's own type and every type above it
 * by is-a. Both reads are the ones the kind chips already make and keep for 30 minutes (`contactKindCatalogue.ts`).
 *
 * When either type cannot be classified (the master could not be read, a node with no type), the link keeps `t:ConnectedTo` as before. The write
 * door still refuses `t:AssociatedWith` when the live user-plane catalogue does not list it (`writePairRelation`): nothing else is written in its place.
 */
import { useQuery } from "@tanstack/react-query";
import { GENERIC_PREDICATE_CURIE } from "@kaigilb/gilbplatformcode-lws-relations";
import { DEFAULT_PARTY_TIE_CURIE } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { CATALOGUE_TTL_MS, readMasterCatalogue, typeAncestry } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { isPartyType } from "./kindRelation";

/** A type in any spelling (`Person`, `t:Person`, `…/t/Person`) as the master's address; "" when none. */
export function masterTypeAddress(typeRef: string | null | undefined): string {
  const name = (typeRef ?? "").trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  return name ? `${termOrigin()}/base/t/${name}` : "";
}

/** True when the type is a party (see the file note); false when it is not; throws when the master could not be read. */
export async function isPartyTypeRef(typeRef: string | null | undefined): Promise<boolean> {
  const t = masterTypeAddress(typeRef);
  if (!t) return false;
  const [cat, types] = await Promise.all([readMasterCatalogue("relationshipKind"), typeAncestry(t)]);
  return isPartyType(cat.entries, types);
}

/** The default predicate of a new link between two records of these types (see the file note). Never throws: an unclassified pair keeps the generic. */
export async function defaultLinkPredicate(a: string | null | undefined, b: string | null | undefined): Promise<string> {
  try {
    const [pa, pb] = await Promise.all([isPartyTypeRef(a), isPartyTypeRef(b)]);
    return pa && pb ? DEFAULT_PARTY_TIE_CURIE : GENERIC_PREDICATE_CURIE;
  } catch {
    return GENERIC_PREDICATE_CURIE;
  }
}

/** The same, as a React Query read for a dialog that shows the default before saving. `null` while it is being read. */
export function useDefaultLinkPredicate(a: string | null | undefined, b: string | null | undefined, enabled = true): string | null {
  const q = useQuery({
    queryKey: ["contact-labels", "default-link-predicate", masterTypeAddress(a), masterTypeAddress(b)] as const,
    queryFn: () => defaultLinkPredicate(a, b),
    enabled: enabled && !!a && !!b,
    staleTime: CATALOGUE_TTL_MS,
    retry: false,
  });
  if (!enabled || !a || !b) return GENERIC_PREDICATE_CURIE;
  return q.data ?? null;
}
