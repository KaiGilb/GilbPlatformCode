/**
 * React binding: ONE controller per (record, holder, vault, write right), created when the card opens.
 * The controller reads nothing until the frame mounts and calls `load()`. A list never creates one.
 */
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readLink } from "@kaigilb/gilbplatformcode-online-card-link";
import { type OnlineCardController, createOnlineCardController } from "@kaigilb/gilbplatformcode-online-card";
import { refreshRecordInCaches } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { onlineCardDeps, bindAnchorShare, forgetAnchor, sharedAnchor, type AnchorShare } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { forgetLinkedFinds } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { noteConnected } from "./connectedRecords";

export function useOnlineCardController(args: {
  enabled: boolean;
  record: { id: string; entityUri?: string | null; served?: { facts: Readonly<Record<string, unknown>> } };
  vaultId: string | null;
  holder: string | null;
  canWrite: boolean;
}): OnlineCardController | null {
  const qc = useQueryClient();
  const { enabled, record, vaultId, holder, canWrite } = args;
  const uri = record.entityUri ?? null;
  const id = record.id;
  // The link the record was opened with; the controller then tracks it itself (a write sets it).
  const servedFacts = record.served?.facts;
  const hasServed = !!servedFacts;
  const controller = useMemo(() => {
    // Only a record READ WHOLE has a link to show: a list row that carries a label is a stub with no served document, and a controller made from it would
    // read the record as "not linked" and keep that. It is made when the full read arrives (the card's own read puts `served` on the record).
    if (!enabled || !uri || !vaultId || !holder || !hasServed) return null;
    // One share per card open: the card and its placement chips (`usePersonCard`) ask the resolver ONCE between them.
    const share: AnchorShare = { answer: null };
    const c = createOnlineCardController({
      ...onlineCardDeps({
        record: { id, entityUri: uri },
        vaultId,
        holder,
        canWrite,
        link: readLink(servedFacts),
        // The list and the pane follow the link at once: the record is read again, ONE request, the way the org card does.
        // The shared resolver answer is forgotten first, so the card and its placement chips both read the new target.
        onLinkChanged: () => {
          forgetAnchor(share);
          // The Stakeholders list's kept up-front answers (which records link to whom) are asked again next draw: only the finds;
          // what the session knows was deleted stays known.
          forgetLinkedFinds();
          void refreshRecordInCaches(qc, vaultId, { id, entityUri: uri });
        },
      }),
      // The resolver seam (the package's `resolve` dep).
      resolve: () => sharedAnchor(share, uri),
    });
    bindAnchorShare(c, share);
    return c;
    // `servedFacts` is deliberately NOT a dependency: a refresh after a write must not rebuild the controller mid-act.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uri, id, vaultId, holder, canWrite, qc, hasServed]);
  // The list's marker follows what this card has read or done: the link of a record the holder opened, linked or unlinked. No request.
  useEffect(() => {
    if (!controller || !uri) return;
    const note = () => noteConnected(uri, controller.getState().link.state === "linked");
    note();
    return controller.subscribe(note);
  }, [controller, uri]);
  return controller;
}
