/**
 * The thin wiring of the person card resolver (`resolvePersonCard` of the `person-connections` unit) ("the connection is the rung").
 * Every rule is the unit's; this file only says WHICH doors do the I/O, and how long what was read is kept:
 *
 *   connections    `readConnections` at the holder's OWN vault (`ownVaultIdOf`, ⛔ never the seat entity: the My Note bug), addressed
 *                  at that vault's node (`vaultOriginOf`), with the DPoP fetch. Read ONCE per holder per session: kept in the
 *                  query cache with no expiry, shared by every card, gone on reload. A FAILED read is not kept (the next card asks again).
 *   canonical      one `createPrincipalCanonicaliser` per holder for the session (bounded and cached in the package).
 *   resolver       ONE request per card open, shared by the card's controller and its chips (`sharedAnchor`, one share per controller).
 *
 * READ ONLY. Nothing here writes a placement, a link or a claim.
 */
import type { QueryClient } from "@tanstack/react-query";
import {
  createPrincipalCanonicaliser,
  readConnections,
  resolveOnlineCard,
  resolvePersonCard,
  type ConnectionsReading,
  type PersonCard,
  type PrincipalCanonicaliser,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { identityFetch } from "./onlineCardWiring";

/** The identity node with this app's DPoP fetch (the resolver, resolve-person, and the connections read's transport). */
export const personCardPlatform = (): PlatformClient => ({ origin: baseOrigin(), fetch: identityFetch });

/** The query key of the holder's connections: one entry per holder and own vault, for the whole session. */
export const connectionsKey = (holder: string, ownVaultId: string) => ["person-card", "connections", holder, ownVaultId] as const;

/** Read the holder's connections at their own vault's node, naming the vault (the read follows the write). */
export function readHolderConnections(ownVaultId: string): Promise<ConnectionsReading> {
  return readConnections(personCardPlatform(), { vaultId: ownVaultId, vaultOrigin: (v) => vaultOriginOf(v) });
}

/**
 * The holder's connections, read once per session and shared by every card. ⛔ A failure is not kept: it rejects here, the card shows
 * no chips, and the next card that needs them asks again.
 */
export function sessionConnections(qc: QueryClient, holder: string, ownVaultId: string): Promise<ConnectionsReading> {
  return qc.fetchQuery({
    queryKey: connectionsKey(holder, ownVaultId),
    queryFn: () => readHolderConnections(ownVaultId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

const canonicalisers = new Map<string, PrincipalCanonicaliser>();

/** One canonicaliser per holder for the session (the package bounds and caches its requests). */
export function canonicaliserFor(holder: string): PrincipalCanonicaliser {
  let c = canonicalisers.get(holder);
  if (!c) {
    c = createPrincipalCanonicaliser(personCardPlatform());
    canonicalisers.set(holder, c);
  }
  return c;
}

/** One request of the resolver ends after this long (as the controller's own requests do). */
const ANCHOR_TIMEOUT_MS = 10_000;

/** The resolver's answer shared by everything on ONE open card (its controller and its placement chips). */
export interface AnchorShare {
  answer: Promise<ResolveOutcome> | null;
}

const shares = new WeakMap<object, AnchorShare>();

/** Tie a share to the card's controller, so the chips of that card find it. */
export function bindAnchorShare(controller: object, share: AnchorShare): void {
  shares.set(controller, share);
}

/** The share of an open card's controller (none: the chips ask the resolver themselves). */
export function anchorShareOf(controller: object | null): AnchorShare | null {
  return controller ? (shares.get(controller) ?? null) : null;
}

/**
 * The resolver's answer for the record of ONE open card. The first asker sends the request and the other joins it, so a card open is still
 * ONE resolver request (as before S4). A settled ANSWER (person, organization, none) is kept for the life of that card; a failure (could not
 * be reached, sign in, busy) is dropped at once, so "Try again" asks again. A new card open has a new share and asks again, as before.
 */
export function sharedAnchor(share: AnchorShare, record: string): Promise<ResolveOutcome> {
  if (share.answer) return share.answer;
  const answer: Promise<ResolveOutcome> = resolveOnlineCard(personCardPlatform(), record, { timeoutMs: ANCHOR_TIMEOUT_MS }).then(
    (a) => {
      if (share.answer === answer && !(a.kind === "person" || a.kind === "organization" || a.kind === "none")) share.answer = null;
      return a;
    },
    (e: unknown) => {
      if (share.answer === answer) share.answer = null;
      throw e;
    },
  );
  share.answer = answer;
  return answer;
}

/** The card's link changed (link, unlink): its answer is forgotten, so the next read names the new target. */
export function forgetAnchor(share: AnchorShare): void {
  share.answer = null;
}

/** Tests: start a new session. */
export function __resetPersonCardSession(): void {
  canonicalisers.clear();
}

/**
 * Resolve one held record's person and the holder's placements of them.
 *
 * @param qc the app's query client (holds the session's connections)
 * @param args the record (address + link), the signed-in holder and the holder's own vault
 */
export function resolveRecordPersonCard(
  qc: QueryClient,
  args: { recordUri: string; link: LinkReading; holder: string; ownVaultId: string; share: AnchorShare | null },
): Promise<PersonCard> {
  return resolvePersonCard(
    {
      platform: personCardPlatform(),
      connections: () => sessionConnections(qc, args.holder, args.ownVaultId),
      canonical: canonicaliserFor(args.holder),
      ...(args.share ? { resolve: (record: string) => sharedAnchor(args.share!, record) } : {}),
    },
    { record: { uri: args.recordUri, link: args.link } },
  );
}
