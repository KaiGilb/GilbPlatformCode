/**
 * The holder's connections, person by person, from the four stored rung sets.
 *
 * The platform answers sets, not people: `{ sets: [{ context, depth, members[] }] }`. A person who
 * sits in several sets appears once here, with every placement the holder made. Only the four
 * stored placements are returned: derived either-context reach is never computed and never shown
 * as a placement (3P.C.AudienceScope.MembershipReachComposition.Base clause (ix): "What the holder
 * placed and what it reaches are two facts, and the holder is always shown the first").
 *
 * Pure: no request, no app import.
 */
import {
  ATOMIC_PLACEMENTS,
  placementKey,
  type AtomicPlacement,
  type AudienceRungSetRecord,
} from "./placements";

/** One member the holder has placed, with every atomic circle they sit in. */
export interface ConnectedPerson {
  /** The member as the holder stored it (a principal URI). */
  principal: string;
  /**
   * Every atomic placement the holder made for this member, in {@link ATOMIC_PLACEMENTS} order.
   * Never a derived either-context union: those are reach, not placement.
   * A member in personal AND professional appears once with both placements.
   */
  placements: AtomicPlacement[];
}

/** Options for {@link composeConnectionsFromSets}. */
export interface ComposeOptions {
  /**
   * Which members to keep. Default: every member.
   *
   * The sets also hold GROUP vaults the holder placed with "Set access". Only the server can tell a
   * person from a group (`public-card` answers 404 `not_a_person`): a person's named vault and a
   * group's named vault have the same URL shape. So this package keeps every member and lets the app
   * pass the server's ruling it already holds (for example an app's `admitAsPerson`). Never decide by URL shape.
   */
  admit?: (member: string) => boolean;
}

// The placement panel's order: within each context, broader rung first (see ATOMIC_PLACEMENTS).
const PLACEMENT_ORDER = new Map(ATOMIC_PLACEMENTS.map((p, i) => [placementKey(p), i]));

/**
 * Collapse the stored rung sets into one list, one entry per member.
 *
 * Order: more placements first, then by principal string (stable, never by name).
 *
 * @param sets the sets from `readConnections` (or the route's `sets` as returned)
 * @param options `admit` filters members (default keeps all)
 * @returns one {@link ConnectedPerson} per distinct member string
 */
export function composeConnectionsFromSets(
  sets: AudienceRungSetRecord[],
  options: ComposeOptions = {},
): ConnectedPerson[] {
  const admit = options.admit ?? (() => true);
  const byPrincipal = new Map<string, AtomicPlacement[]>();

  for (const set of sets) {
    // Exact equality on both axes: a set with any other context or depth is not a stored placement.
    if (
      (set.context !== "personal" && set.context !== "professional") ||
      (set.depth !== "close-circle" && set.depth !== "first-degree")
    ) {
      continue;
    }
    const placement: AtomicPlacement = { context: set.context, depth: set.depth };
    const key = placementKey(placement);
    for (const member of set.members) {
      if (typeof member !== "string" || !member.trim()) continue;
      if (!admit(member)) continue;
      const existing = byPrincipal.get(member) ?? [];
      if (!existing.some((p) => placementKey(p) === key)) {
        existing.push(placement);
      }
      byPrincipal.set(member, existing);
    }
  }

  const people: ConnectedPerson[] = [];
  for (const [principal, placements] of byPrincipal) {
    people.push({
      principal,
      placements: [...placements].sort(
        (a, b) =>
          (PLACEMENT_ORDER.get(placementKey(a)) ?? 99) - (PLACEMENT_ORDER.get(placementKey(b)) ?? 99),
      ),
    });
  }

  people.sort((a, b) => {
    if (b.placements.length !== a.placements.length) {
      return b.placements.length - a.placements.length;
    }
    return a.principal.localeCompare(b.principal);
  });
  return people;
}

/**
 * The placements of one member, from a composed list.
 *
 * Exact string equality on the principal. A member stored under another spelling (a legacy WebID
 * versus a re-minted principal) is not matched here; the canonical comparison is the caller's
 * (`personCard.ts`, through `canonical.ts`).
 *
 * @param people the composed list
 * @param principal the member to look up
 * @returns that member's placements (a copy), or `[]` when the holder has not placed them
 */
export function placementOf(people: readonly ConnectedPerson[], principal: string): AtomicPlacement[] {
  const hit = people.find((p) => p.principal === principal);
  return hit ? hit.placements.map((p) => ({ ...p })) : [];
}
