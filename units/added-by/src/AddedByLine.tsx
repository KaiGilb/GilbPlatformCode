/**
 * The small muted line "Added by <name>" under a held detail (a note, interest, language or organization number): whoever may see something a person added sees that person's name on it, and nothing else of the card, with a link to the card.
 *
 *   - the viewer's own detail: "Added by you", no link, no request;
 *   - another person's: "Added by <name>", the name a link to the card at its address (`statedBy`, what the platform returned, ⛔ never built from the name),
 *     opened the way a reference opens a record by address (`openRecordInVault`, as the plan's source and stakeholder links do). What the card
 *     then shows is decided by the platform's grants; a card the viewer may not read opens as the name alone (the name-only card);
 *   - not disclosed, an old claim stated by a vault card, a refusal, an older platform, a timeout: NOTHING (no "unknown", no error text).
 * The names of all the details on a card are asked in ONE batch (`useAddedBy`).
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rememberAddedByCard } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { vaultNamespaceOfEntityUri } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { useAddedBy } from "./addedBy";
import { useAddedByHost } from "./addedByHost";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function AddedByLine({
  item,
  own,
  hasSource = true,
}: {
  /** The detail's own address (the claim). Empty: nothing is drawn. */
  item: string;
  /** The viewer's own card is the claim's one `a:statedBy`. */
  own: boolean;
  /** False when the claim names no source at all. */
  hasSource?: boolean;
}) {
  const who = useAddedBy([{ item, own, hasSource }])(item);
  const shell = useAddedByHost().useShell();
  const qc = useQueryClient();
  const open = useCallback(
    (card: string, name: string) => {
      const ref = entityRefFromFact(card);
      if (!ref) return;
      const vault = vaultNamespaceOfEntityUri(card);
      // The card is read at ITS OWN host (the address `statedBy` carries), never the viewer's vault; if the viewer may not read it,
      // the pane shows the adder's name alone (NameOnlyCard) instead of "didn't return this record".
      rememberAddedByCard(qc, ref.id, { door: card, name });
      if (vault && shell?.openRecordInVault) shell.openRecordInVault(vault, ref.id, { push: true });
      else shell?.openRecordFromList(ref.id);
    },
    [shell, qc],
  );
  if (!item || who === null) return null;
  return (
    <p className="min-w-0 break-words text-[12px] text-[var(--ink-soft)]" data-testid="added-by">
      {who.kind === "you" ? (
        "Added by you"
      ) : (
        <>
          Added by{" "}
          <a
            href={who.card}
            className={`underline ${FOCUS}`}
            data-testid="added-by-link"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              open(who.card, who.name);
            }}
          >
            {who.name}
          </a>
        </>
      )}
    </p>
  );
}
