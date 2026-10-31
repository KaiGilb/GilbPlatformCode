// The "Children" list of a record card: the records that point at this one with `a:memberOf`, from the vault's recency page and the
// hydrated reverse index, each once, with an honest "N of M member-of children" line when some are withheld.
// ⚠ A card for an ORGANIZATION must not draw this list: its member-of people are its Employees group (a short list); a second list
// of the same people was up to ~80 rows and ~80 record reads on every open. The host decides which cards draw it.
import { childrenPointingAt } from "@kaigilb/gilbplatformcode-entity-ref";
import { refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { SKIP_SLUGS } from "@kaigilb/gilbplatformcode-plan-links-model";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { useMemberOfChildren } from "./entityRefChildren";

export function RelatedChildren({
  record,
  vaultId,
  onOpen,
}: {
  record: { id: string; entityUri?: string };
  vaultId: string;
  /** Opens a child. Since 0.1.1 the second argument is the child's own address (when it has one), so the host can name its vault. */
  onOpen?: (id: string, entityUri?: string) => void;
}) {
  const list = useRecords(vaultId);
  const reverseQ = useMemberOfChildren(record.entityUri ?? null);
  // The pool is the recency page UNION the hydrated reverse set, and those overlap —
  // `loadMemberOfChildren` seeds itself from the same records cache `useRecords` fills.
  // `childrenPointingAt` pushes one row per pool entry, so an overlapping record arrives
  // twice. De-dupe by id: a doubled row is a duplicate React key AND it inflates the `N`
  // disclosed below, which would make the honesty line itself dishonest.
  const seenKid = new Set<string>();
  const kids = childrenPointingAt(record, [
    ...(list.data ?? []),
    ...(reverseQ.data?.records ?? []),
  ], SKIP_SLUGS).filter((k) => {
    if (seenKid.has(k.id)) return false;
    seenKid.add(k.id);
    return true;
  });
  // 🔴 The authorized reverse-index count — the field the graph footer reads and this
  // surface did not. Norway has 375 `a:memberOf` children; the Card listed ~100 and said
  // nothing, so a reader could not tell ~275 were withheld. A list that simply stops reads
  // as complete — the implicit-completeness shape 3P.C.RealityDisclosure forbids.
  const childTotal = reverseQ.data?.total ?? 0;
  const withheldChildren = childTotal > kids.length;
  // Nothing known and nothing shown — the section has no content to be honest about.
  // (`kids` empty while `childTotal` is not means every child was withheld or unreadable:
  // still disclose, or the worst case would be the silent one.)
  if (kids.length === 0 && childTotal === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-ghost)]">
        Children
      </span>
      <ul className="flex flex-col gap-1">
        {kids.map((k) => {
          const name = refDisplayName(k.facts, k.entityUri);
          return (
            <li key={k.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(k.id, k.entityUri)}
                  className="text-left text-[14px] text-[var(--ink)] hover:text-[var(--accent)]"
                >
                  {name}
                </button>
              ) : (
                <span className="text-[14px] text-[var(--ink)]">{name}</span>
              )}
              <span className="ml-2 text-[11px] text-[var(--ink-ghost)]">{k.slug}</span>
            </li>
          );
        })}
      </ul>
      {withheldChildren ? (
        // Same wording as the graph footer (RecordGraph.tsx `${count} of ${total}
        // member-of children`) — one phrasing for one fact, on both surfaces.
        <span className="text-[11px] text-[var(--ink-ghost)]">
          {kids.length} of {childTotal} member-of children
        </span>
      ) : null}
    </div>
  );
}
