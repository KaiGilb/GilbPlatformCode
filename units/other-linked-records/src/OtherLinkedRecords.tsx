/**
 * The person's other linked records, reached from their card. A person with several local records linked to them is one row in the
 * Stakeholders list, the newest record's. The other records are reached from that person's card, here.
 *
 * Drawn as the card's other groups are (a `CardGroup`), with rows that open a record as the organization card's unit rows do (a
 * full-width button, the name, a quiet line at its right). Each row names its vault and date, so same-named cards can be told apart.
 * The list is the holder's screen now (`onScreenLinks` and its siblings in `stakeholder-list-state`), and it follows the grid while
 * the card is open. Nothing is read here; nothing is drawn when there is none.
 */
import { useSyncExternalStore } from "react";
import { onScreenLinks, screenLinkedRecordsOf, screenLinksRevision } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { vaultLabel } from "@kaigilb/gilbplatformcode-vault-list";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useOtherLinkedRecordsHost } from "./otherLinkedRecordsHost";
import { formatShortDate } from "./formatShortDate";

// A named copy of `FOCUS` from GilbApp `src/components/records/orgCard/OrgHierarchySections.tsx` (line 28), commit
// a703b3ed78e612e2cab77e94876ce9bce109d5a3: the focus ring of a card row that opens a record. Copied here, not taken from
// `org-hierarchy`, so a person card does not depend on the organization card for one class string. Not exported.
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export interface OtherLinkedRecordsProps {
  /** The signed-in holder. */
  holder: string;
  /** The person the open record is linked to. */
  principal: string;
  /** The open record's id (not listed). */
  selfId: string;
  /** Opens a record (the list row's own open). */
  onOpen: (id: string) => void;
}

export const OTHER_CARDS_TITLE = "Your other cards of this person";

export function OtherLinkedRecords({ holder, principal, selfId, onOpen }: OtherLinkedRecordsProps) {
  useSyncExternalStore(onScreenLinks, screenLinksRevision, screenLinksRevision);
  const { vaults } = useOtherLinkedRecordsHost().useShell();
  const others = screenLinkedRecordsOf(holder, principal).filter((r) => r.id !== selfId);
  if (others.length === 0) return null;
  const vaultName = (id: string | undefined) => {
    const v = id ? vaults?.find((x) => x.vaultId === id) : undefined;
    return v ? vaultLabel(v) : null;
  };
  return (
    <CardGroup kind="other-linked-records" testId="other-linked-records" title={OTHER_CARDS_TITLE} icon="record" addable={false}>
      {others.map((r) => {
        const meta = [vaultName(r.vaultId), formatShortDate(r.updatedAt)].filter(Boolean).join(" · ");
        return (
          <button key={r.id} type="button" className={`flex min-h-12 w-full items-center gap-3 py-2 text-left ${FOCUS}`} data-testid="other-linked-record" onClick={() => onOpen(r.id)}>
            <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]">{r.title}</span>
            {meta ? <span className="shrink-0 text-[12.5px] text-[var(--ink-soft)]">{meta}</span> : null}
          </button>
        );
      })}
    </CardGroup>
  );
}
