/**
 * THE PERSON CARD RESOLVER: which party a card is about, and how the holder has placed that party.
 * (The connection is the rung.)
 *
 * One shape for every app: a held RECORD (the holder's own stakeholder record) or a PRINCIPAL (any app that
 * already holds the person) goes in; `{ party, how, placements, link }` comes out.
 *
 * MATCHING A RECORD, in this order, ⛔ NEVER BY NAME:
 *   1. the record's `a:sameAs` (`readLink`, already on the record: no request). Not one reference -> not matched, nothing asked;
 *   2. the resolver `GET /base/connect/online-card-anchor` (follows `entity_redirect`) -> today's principal P. Only a PERSON
 *      answer goes on: an organization or group vault, the one refusal, or a failure to ask -> not matched;
 *   3. P is placed if P EQUALS a member of one of the four sets (exact string first). The other members are then compared
 *      by their canonical principal: an opaque member answers itself with no request; the rest are asked
 *      through `resolve-person` (bounded, cached: `canonical.ts`), `/i` members first. With no exact match every non-opaque
 *      member may be asked; after an exact match only the `/i` members are asked. Every match's circles are joined.
 *
 * READ ONLY. Nothing here writes a placement, a link or a claim. The connections are the app's session read (`readConnections`,
 * passed in as `connections()`, so it is read ONCE per holder per session however many cards open), and the resolver is the
 * controller's own seam (`resolve`), so a card open is still one resolver request.
 */
import { resolveOnlineCard, type ResolveOutcome } from "./anchorResolver";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { placementOf, type ConnectedPerson } from "./compose";
import { CANONICAL_CONCURRENCY, isOldWebIdMember, membersToAsk, opaqueSelf, type PrincipalCanonicaliser } from "./canonical";
import { ATOMIC_PLACEMENTS, placementKey, type AtomicPlacement } from "./placements";
import type { ConnectionsReading } from "./read";

/** What a card is about. */
export type PersonCardSubject =
  /** A held record: its absolute entity address and its link as the record's served facts carry it (`readLink`). */
  | { record: { uri: string; link: LinkReading } }
  /** A principal the app already holds (the principal IS the card). */
  | { principal: string };

export interface PersonCardDeps {
  /** The identity node with the app's authenticated fetch (resolver; resolve-person when `canonical` is the default). */
  platform: PlatformClient;
  /** The holder's connections: the app's ONE session read (`readConnections`, cached by the app). A rejection is a failed read. */
  connections(): Promise<ConnectionsReading>;
  /** The member -> today's principal map, shared for the session (`createPrincipalCanonicaliser`). */
  canonical: PrincipalCanonicaliser;
  /** The app's resolver seam (the card controller's `resolve`). Default: `resolveOnlineCard` (one request). */
  resolve?(record: string): Promise<ResolveOutcome>;
}

export interface PersonCard {
  /** The principal the card is about, or null when no person could be named. */
  party: string | null;
  /**
   * How the holder is connected to `party`:
   *   "placement"  the party is in one of the holder's four circles (the connection is the rung);
   *   "sameAs"     the party is known only through the record's link (not placed, or the connections could not be read);
   *   "none"       no party from a record, or a principal the holder has not placed.
   */
  how: "placement" | "sameAs" | "none";
  /** Every atomic placement the holder made for the party, in display order (draw with `displayPlacements`). */
  placements: AtomicPlacement[];
  /** The record's link as read (`{ state: "none" }` for a principal subject). */
  link: LinkReading;
  /** The resolver's answer for a record (null when it was not asked). */
  anchor: ResolveOutcome | null;
  /** Whether the connections were read: "not-read" when there was no person to look up, "failed" when the read failed. */
  connections: "read" | "failed" | "not-read";
}

/**
 * Resolve a card's party and the holder's placements of it.
 *
 * @param deps the identity node, the session's connections and canonicaliser, and the resolver seam
 * @param subject `{ record }` or `{ principal }`
 * @returns the party, how it is connected, its placements, the link, and what was read. ⛔ Never throws for a failed read:
 *   a failure is "not matched" (record) or `connections: "failed"`, so a card that cannot show chips still works.
 */
export async function resolvePersonCard(deps: PersonCardDeps, subject: PersonCardSubject): Promise<PersonCard> {
  if ("principal" in subject) {
    const party = subject.principal.trim();
    const link: LinkReading = { state: "none" };
    if (!party) return { party: null, how: "none", placements: [], link, anchor: null, connections: "not-read" };
    const found = await placementsFor(deps, party);
    if (found === "failed") return { party, how: "none", placements: [], link, anchor: null, connections: "failed" };
    return { party, how: found.length ? "placement" : "none", placements: found, link, anchor: null, connections: "read" };
  }

  const link = subject.record.link;
  if (link.state !== "linked") return { party: null, how: "none", placements: [], link, anchor: null, connections: "not-read" };
  let anchor: ResolveOutcome;
  try {
    anchor = await (deps.resolve ? deps.resolve(subject.record.uri) : resolveOnlineCard(deps.platform, subject.record.uri));
  } catch {
    anchor = { kind: "unavailable", status: 0 };
  }
  if (anchor.kind !== "person") return { party: null, how: "none", placements: [], link, anchor, connections: "not-read" };
  const party = anchor.principal;
  const found = await placementsFor(deps, party);
  if (found === "failed") return { party, how: "sameAs", placements: [], link, anchor, connections: "failed" };
  return { party, how: found.length ? "placement" : "sameAs", placements: found, link, anchor, connections: "read" };
}

/**
 * The holder's placements of `party`: exact members, opaque members that answer `party` themselves (no request), and members
 * whose canonical principal is `party`, asked `/i` members first. After an exact match only the `/i` members are
 * still asked (a second spelling in another circle), so with no `/i` member an exact match costs no request.
 */
async function placementsFor(deps: PersonCardDeps, party: string): Promise<AtomicPlacement[] | "failed"> {
  let people: ConnectedPerson[];
  try {
    people = (await deps.connections()).people;
  } catch {
    return "failed";
  }
  const exact = placementOf(people, party);
  const others = people.filter((p) => p.principal !== party);
  const same: ConnectedPerson[] = others.filter((p) => opaqueSelf(p.principal) === party);
  const toAsk = membersToAsk(others.map((p) => p.principal)).filter((m) => !exact.length || isOldWebIdMember(m));
  const byMember = new Map(others.map((p) => [p.principal, p] as const));
  for (let i = 0; i < toAsk.length; i += CANONICAL_CONCURRENCY) {
    const batch = toAsk.slice(i, i + CANONICAL_CONCURRENCY);
    const answers = await Promise.all(batch.map((m) => deps.canonical(m).catch(() => null)));
    batch.forEach((m, j) => {
      const p = byMember.get(m);
      if (p && answers[j] === party) same.push(p);
    });
  }
  if (!same.length) return exact;
  // One person stored under two spellings: the union of what the holder placed, in display order.
  const keys = new Set([...exact, ...same.flatMap((p) => p.placements)].map(placementKey));
  return ATOMIC_PLACEMENTS.filter((p) => keys.has(placementKey(p))).map((p) => ({ ...p }));
}
