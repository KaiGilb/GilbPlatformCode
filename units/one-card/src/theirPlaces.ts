/**
 * The places of a linked person's online card, handed from the card to the Details panel. The "Claim Place" group showed raw GilbGeo
 * addresses, which are technical back information, so they are taken off the card and shown in Details under OTHER FIELDS, as the
 * place's NAME, never the raw address.
 *
 * The card (`OneCardBody`) already holds the merged online card; the Details panel is another mount of the record pane (the "actions"
 * placement) with no online card read of its own. So the card PUBLISHES what it took off the card here, keyed by the record's entity
 * IRI, and the panel reads it. ⛔ No request: nothing is read for this hand-over; the places' names are read where they are drawn
 * (anonymous, from the geo catalogue). A card that is not open publishes nothing, so the panel shows no place then (it never reads the
 * online card itself).
 */
import { useSyncExternalStore } from "react";

/** One group of places of their card: its label (the master's, e.g. "Claim Place") and the GilbGeo addresses, in the card's order. */
export interface TheirPlaceGroup {
  label: string;
  places: readonly string[];
}

const byRecord = new Map<string, readonly TheirPlaceGroup[]>();
const listeners = new Set<() => void>();
const NONE: readonly TheirPlaceGroup[] = [];

function same(a: readonly TheirPlaceGroup[], b: readonly TheirPlaceGroup[]): boolean {
  return (
    a.length === b.length &&
    a.every((g, i) => g.label === b[i]!.label && g.places.length === b[i]!.places.length && g.places.every((p, j) => p === b[i]!.places[j]))
  );
}

/** The card's places of one record (an empty list clears them). Listeners hear only a real change. */
export function publishTheirPlaces(recordUri: string, groups: readonly TheirPlaceGroup[]): void {
  const before = byRecord.get(recordUri) ?? NONE;
  if (same(before, groups)) return;
  if (groups.length === 0) byRecord.delete(recordUri);
  else byRecord.set(recordUri, groups);
  for (const l of [...listeners]) l();
}

/** The places the open card published for this record; empty when none (or no record). */
export function useTheirPlaces(recordUri: string | null | undefined): readonly TheirPlaceGroup[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (recordUri ? (byRecord.get(recordUri) ?? NONE) : NONE),
    () => NONE,
  );
}

/** Tests only. */
export function __resetTheirPlaces(): void {
  byRecord.clear();
}
