/**
 * The reads behind the relation chips of the shared contact header (the rules are in `headerRelations` of `contact-kind-model`).
 *
 * WHAT A CARD PAYS (the vocabulary is read once per session, ⛔ not per card):
 * - the record's kind labels: the card's OWN read (`useContactLabels`, the same React Query keys as the chips in the card body), so nothing more;
 *   the predicate reference is on the entry document that read already brings;
 * - each DISTINCT predicate a kind names: ONE small read of its term entity on the master, for its CURIE, kept for the session;
 * - the user-plane vocabulary (`GET /base/vocab?status=all&linkPlane=user`, the existing `readUserLinkPlaneCatalog`): ONE read per session
 *   (`USER_VOCAB_KEY`, kept for the session), and only once some card has a kind with a predicate or a relation to name;
 * - the record's relations (reverse lookup): the record pane's own query (`useRelations`, the same key as the relations section and the graph).
 * A read that FAILED is not kept: the next card asks again.
 *
 * "+ Relation" opens the app's EXISTING "+ Kind" chooser (`ContactKindChooser`, the card body's add flow) and writes through its existing door
 * (`useContactLabels().add`). Kind-as-relation: a kind with a predicate is written as a private relation contact -> the vault's entity
 * (the app's kind-relation write), replacing the default associated-with; a holder's own kind stays a private label claim.
 */
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { USER_VOCAB_KEY, readHeaderVocab, readPredicateCurie } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { edgesToVault, headerRelations } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { annotationsFit } from "@kaigilb/gilbplatformcode-contact-annotation";
import type { ContactHeaderRelation } from "@kaigilb/gilbplatformcode-contact-header";
import { useStakeholderContactHeaderHost, type ContactLabelsState } from "./stakeholderContactHeaderHost";

export { USER_VOCAB_KEY, VocabUnreadableError, readHeaderVocab } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";

export const predicateCurieKey = (ref: string) => ["s5c-predicate-curie", ref] as const;

export interface HeaderRelationsArgs {
  /** The vault that HOLDS the record (the side the card is seen from). */
  vaultId: string | null;
  /** That vault's own entity (`ReachableVault.entity`): the far end of a relation edge. */
  vaultEntity: string | null;
  /** What that vault represents (`ReachableVault.represents`): which kinds of relation fit it. null = undeclared (no kind with a predicate is offered). */
  vaultRepresents?: string | null;
  ownVaultId: string | null;
  principal: string | null;
  record: { id: string; entityUri: string | null; typeUri: string };
  /** The holder may change this card (the body's "+ Kind" rule). */
  canEdit: boolean;
  contactName: string;
  holderName: string;
}

export interface HeaderRelationsState {
  relations: ContactHeaderRelation[];
  /** "+ Relation" is drawn (the same rule as the body's "+ Kind": a writer, in the signed-in holder's own vault). */
  canAdd: boolean;
  chooserOpen: boolean;
  openChooser: () => void;
  closeChooser: () => void;
  labels: ContactLabelsState;
}

export function useHeaderRelations(args: HeaderRelationsArgs): HeaderRelationsState {
  const host = useStakeholderContactHeaderHost();
  const { vaultId, vaultEntity, ownVaultId, principal, record, canEdit, contactName, holderName } = args;
  // Kind-as-relation: the vault the record is held in is the TARGET of every kind (a relation contact -> its entity).
  const kindVault = useMemo(() => (vaultId ? { vaultId, entity: vaultEntity, represents: args.vaultRepresents ?? null } : null), [vaultId, vaultEntity, args.vaultRepresents]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserWanted, setChooserWanted] = useState(false);
  const labels = host.useContactLabels({
    vaultId,
    ownVaultId,
    subject: record.entityUri ?? "",
    principal,
    typeUri: record.typeUri,
    kindVault,
    enabled: !!vaultId && !!record.entityUri,
    needOffers: chooserWanted,
  });
  const refs = useMemo(() => {
    const out: string[] = [];
    for (const c of labels.chips ?? []) {
      if (c.axis !== "relationshipKind") continue;
      const r = labels.entryPredicates.get(c.entryId);
      if (r && !out.includes(r)) out.push(r);
    }
    return out;
  }, [labels.chips, labels.entryPredicates]);
  const curieQs = useQueries({
    queries: refs.map((ref) => ({
      queryKey: predicateCurieKey(ref),
      queryFn: async () => {
        const c = await readPredicateCurie(ref);
        if (c === null) throw new Error(`${ref} names no predicate CURIE`);
        return c;
      },
      staleTime: Infinity,
      gcTime: Infinity,
      // a term read that failed is asked twice more before the chip says the relation term could not be read
      retry: 2,
      refetchOnWindowFocus: false,
    })),
  });
  const predicateCuries = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    refs.forEach((ref, i) => m.set(ref, curieQs[i]?.isError ? null : (curieQs[i]?.data ?? undefined)));
    return m;
  }, [refs, curieQs]);
  const rels = host.useRelations(record.id, record.entityUri);
  const rows = rels.data ?? null;
  const someEdge = (rows ?? []).some((r) => !!r.type && !!r.members?.length);
  const vocabQ = useQuery({
    queryKey: USER_VOCAB_KEY,
    queryFn: readHeaderVocab,
    enabled: refs.length > 0 || someEdge,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const catalog = vocabQ.data ?? null;
  const relations = useMemo(
    () =>
      headerRelations({
        kindChips: labels.chips,
        entryPredicates: labels.entryPredicates,
        predicateCuries,
        catalog,
        catalogFailed: vocabQ.isError,
        edges: edgesToVault(rows, record.entityUri, vaultEntity, catalog),
        contactName,
        holderName,
      }),
    [labels.chips, labels.entryPredicates, predicateCuries, catalog, vocabQ.isError, rows, record.entityUri, vaultEntity, contactName, holderName],
  );
  const canAdd = canEdit && !!principal && !!record.entityUri && annotationsFit(vaultId, ownVaultId);
  return {
    relations,
    canAdd,
    chooserOpen,
    openChooser: () => {
      setChooserWanted(true);
      setChooserOpen(true);
    },
    closeChooser: () => setChooserOpen(false),
    labels,
  };
}
