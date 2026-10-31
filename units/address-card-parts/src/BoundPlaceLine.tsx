// The catalogue places one address binds, by name, coarse to fine, and what is not known about the others.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` (commit in the README). Changes are marked CHANGED.
import { claimPlaceIds, type PlaceLineClaim } from "@kaigilb/gilbplatformcode-place-lines";
import { placeLine } from "@kaigilb/gilbplatformcode-place-line";
import { usePlaceNames, type PlaceRead } from "@kaigilb/gilbplatformcode-place-names";

/**
 * CHANGED (F6): what is said about the places that were not named. GilbApp showed the places it could name as if they were all of them, and
 * "N places bound, none reachable right now" when it could name none. Now: a place the catalogue answered 404 for is "no longer in the
 * catalogue", a place that was not read (the read failed, the address is not the catalogue's, or the row has no name) is "not read right now".
 * The words are by state, and never a count of the bound addresses.
 */
export function unreadNotes(reads: readonly PlaceRead[]): string[] {
  const named = reads.filter((r) => r.state === "named").length;
  const failed = reads.filter((r) => r.state === "failed").length;
  const missing = reads.filter((r) => r.state === "missing").length;
  const notes: string[] = [];
  if (failed > 0) notes.push(`${failed} ${named > 0 ? "more " : ""}place${failed === 1 ? "" : "s"} not read right now`);
  if (missing > 0) notes.push(`${missing} place${missing === 1 ? "" : "s"} no longer in the catalogue`);
  return notes;
}

export function BoundPlaceLine({ claim }: { claim: PlaceLineClaim }) {
  const bound = claimPlaceIds(claim);
  const reads = usePlaceNames(bound);
  if (bound.length === 0) {
    return (
      <span className="text-xs text-[var(--ink-faint)]" data-testid="place-claim-bound">
        No catalogue place bound
      </span>
    );
  }
  if (reads === null) {
    return (
      <span className="text-xs text-[var(--ink-faint)]" data-testid="place-claim-bound" aria-live="polite">
        Looking up the place…
      </span>
    );
  }
  const names = reads.flatMap((r) => (r.state === "named" ? [r.place] : []));
  const notes = unreadNotes(reads);
  if (notes.length === 0) {
    return (
      <span className="text-sm text-[var(--ink)]" data-testid="place-claim-bound">
        {placeLine(names)}
      </span>
    );
  }
  const text = [names.length > 0 ? placeLine(names) : "", ...notes].filter((x) => x !== "").join(" · ");
  return (
    <span className={names.length > 0 ? "text-sm text-[var(--ink)]" : "text-xs text-[var(--ink-faint)]"} data-testid="place-claim-bound">
      {text}
    </span>
  );
}
