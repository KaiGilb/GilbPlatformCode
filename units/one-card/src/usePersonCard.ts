/**
 * React binding of the person card resolver for one open card (`personCard.ts` of the `stakeholder-list-doors` unit). It follows the
 * card controller's LINK (a link or an unlink re-resolves), reads nothing for a record that is not linked, and shares the session's
 * connections and the card's one resolver request. Read only.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import type { OnlineCardController } from "@kaigilb/gilbplatformcode-online-card";
import type { PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import { anchorShareOf, resolveRecordPersonCard } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";

const NO_LINK: LinkReading = { state: "none" };

/** The resolver's answers that settle who the link is about; anything else (could not be reached, sign in, busy) is asked again. */
const SETTLED = new Set(["person", "organization", "none"]);

/** A linked card whose person answer is not settled (the lookup failed): it is asked again when the card reloads. */
function unsettled(card: PersonCard | null | undefined): boolean {
  return !!card && card.link.state === "linked" && !(card.anchor && SETTLED.has(card.anchor.kind));
}

export function usePersonCard(args: {
  controller: OnlineCardController | null;
  recordUri: string | null;
  holder: string | null;
  /** The signed-in holder's OWN vault (`ownVaultIdOf`): where the connections are read. */
  ownVaultId: string | null;
}): PersonCard | null {
  const { controller, recordUri, holder, ownVaultId } = args;
  const qc = useQueryClient();
  const link = useSyncExternalStore(
    (l) => (controller ? controller.subscribe(l) : () => {}),
    () => controller?.getState().link ?? NO_LINK,
    () => controller?.getState().link ?? NO_LINK,
  );
  const target = link.state === "linked" ? link.target : null;
  const enabled = !!controller && !!recordUri && !!holder && !!ownVaultId && !!target;
  const q = useQuery({
    queryKey: ["person-card", "record", holder ?? "", ownVaultId ?? "", recordUri ?? "", target ?? ""] as const,
    queryFn: () => resolveRecordPersonCard(qc, { recordUri: recordUri!, link, holder: holder!, ownVaultId: ownVaultId!, share: anchorShareOf(controller) }),
    enabled,
    // Asked once per card open (the resolver answer is the card's own); the connections behind it are the session's.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // The notes key from this answer. When the card's "Try again" (or any reload of the online card)
  // changes the controller's state while the kept answer is a failed lookup, the answer is asked again, so My Note and Where / How we met
  // appear without reopening the card. A settled answer is never asked again here (one resolver request per card open, as before); the
  // card's own re-resolve and this one share the card's request (`anchorShareOf`).
  const cardState = useSyncExternalStore(
    (l) => (controller ? controller.subscribe(l) : () => {}),
    () => controller?.getState() ?? null,
    () => controller?.getState() ?? null,
  );
  const failed = enabled && !q.isFetching && unsettled(q.data);
  useEffect(() => {
    if (failed) void q.refetch();
    // Only a change of the card's state asks again; ⛔ never a loop on the failed answer itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState]);
  return enabled ? (q.data ?? null) : null;
}
