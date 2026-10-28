// The holder's own card: which ids are his, and which record in his vault is his card, found by hard identity. Every read is a
// transport the caller injects; nothing here writes.

import { systemHostLabels } from "./systemHostLabels";

/** Slug prefix of the cards MyNet minted before the derived address existed (`Slug: mnb-profile`). Group cards use it too. */
export const OWN_CARD_SLUG_PREFIX = "mnb-profile";

/** What the owner-card id test needs from `gilb-photo`. */
export interface OwnCardIdDeps {
  /** `gilb-photo` `selfCardIdForVault`: the derived self-card id of a vault root. ⛔ Never re-implemented here. */
  selfCardIdForVault: (vaultRoot: string) => Promise<string>;
  /** `gilb-photo` `VAULT_PATH_SEGMENTS` (`["base", "vault"]`): the two roots one origin can have. */
  vaultPathSegments: readonly string[];
}

/** The owner-card ids of one vault. */
export interface OwnCardIds {
  /** The vault's own derived self-card id, or null when there is no root or no digest. */
  derivedId: string | null;
  /** Every derived id that counts: the root's and its sibling root's (`/base` and `/vault` on one origin are one vault). */
  derivedIds: string[];
  /** True when `id` is minted FOR the owner: an `mnb-profile*` slug, or one of {@link derivedIds}. */
  isOwnerCardId: (id: string) => boolean;
}

/**
 * The other vault root on the same origin: `https://x/base` and `https://x/vault`.
 *
 * @param value a candidate root; only a bare root (origin and one vault segment, nothing after) has a sibling
 * @param segments the two vault path segments (`gilb-photo` `VAULT_PATH_SEGMENTS`)
 * @returns the sibling root, or undefined for anything that is not a bare vault root
 */
export function siblingVaultRoot(value: string | null | undefined, segments: readonly string[]): string | undefined {
  if (!value || !/^https?:\/\//i.test(value.trim())) return undefined;
  try {
    const u = new URL(value.trim());
    if (u.search || u.hash) return undefined;
    const seg = u.pathname.replace(/^\/+|\/+$/g, "");
    const i = segments.indexOf(seg);
    // Only a pair has a sibling: with one segment, or three, "the other root" means nothing.
    if (i < 0 || segments.length !== 2) return undefined;
    return `${u.origin}/${segments[1 - i]}`;
  } catch {
    return undefined;
  }
}

/**
 * The record id inside an address: `https://x/base/e/<id>`, `base:e/<id>` or a bare `<id>`.
 *
 * @param ref an entity address, a short form or an id
 * @returns the last path segment, or "" for an empty input
 */
export function cardIdOf(ref: string): string {
  const s = (ref ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf(":"));
  return i < 0 ? s : s.slice(i + 1);
}

/**
 * The owner-card ids of one vault (moved from MyNet `ownerCardIds`, behaviour unchanged).
 *
 * A card is the owner's only when its id is minted FOR the owner: an `mnb-profile*` slug, or the derived self-card id of the vault
 * root or of its sibling root. Anything else (a GilbApp stakeholder `t:Person`, any minted id) is not, whatever its type: a
 * `t:Person` carries no `a:claimSubject`, so the id is the only owner test a Person admits.
 *
 * @param vaultRoot the vault root (`https://<host>/base`); null or empty leaves only the slug test
 * @param deps the derivation and the path segments from `gilb-photo`
 * @returns the derived id and the id test
 */
export async function ownCardIds(vaultRoot: string | null | undefined, deps: OwnCardIdDeps): Promise<OwnCardIds> {
  const root = vaultRoot?.trim() ? vaultRoot : undefined;
  const derivedIds: string[] = [];
  let derivedId: string | null = null;
  for (const r of [root, siblingVaultRoot(root, deps.vaultPathSegments)]) {
    if (!r) continue;
    try {
      const id = await deps.selfCardIdForVault(r);
      if (r === root) derivedId = id;
      derivedIds.push(id);
    } catch {
      // No digest (no WebCrypto): this root adds no id. The slug test still stands, as it did in MyNet.
    }
  }
  return {
    derivedId,
    derivedIds,
    isOwnerCardId: (id: string) => !!id && (id.startsWith(OWN_CARD_SLUG_PREFIX) || derivedIds.includes(id)),
  };
}

/** The seat a card is tested against: the vault root, its vault entity, and the API origin's host. */
export interface CardSeat {
  /** The seat's vault root (`https://<name>.<host>/base`); its host is the seat's partition host. */
  vaultRoot?: string | null;
  /** The seat's vault entity, used for the host only when there is no root. */
  entity?: string | null;
  /** The host of the API origin the app talks to (MyNet's baseOrigin()): a mint host, never foreign. */
  apiHost?: string | null;
}

const hostOf = (u: string | null | undefined): string | null => {
  if (!u) return null;
  try {
    return new URL(u).hostname || null;
  } catch {
    return null;
  }
};

/**
 * True when a card's served `@id` is compatible with the seat vault: MyNet's `resourceBelongsToSeatVault`, moved here so MyNet
 * and {@link findOwnCard} run ONE test (a pointer to another vault's `mnb-profile` card was named "the card
 * MyNet shows" while MyNet refused it).
 *
 * - Same host as the seat partition: belongs.
 * - The API host, or a system host on the seat's apex (`id`, `veda`, `connect` …): the host is uninformative, so it belongs.
 * - Any other host (another person vault: helip vs kaimetester): foreign.
 * - A shape that says nothing (no `@id`, a short form, no seat host): belongs, as in MyNet.
 *
 * @param cardAtId the card's served `@id` (or the address it was read at)
 * @param seat the seat vault
 * @returns false only for a card that provably sits in another vault
 */
export function cardBelongsToVault(cardAtId: string, seat: CardSeat): boolean {
  const resHost = hostOf(cardAtId);
  const seatHost = hostOf(seat.vaultRoot) ?? hostOf(seat.entity);
  if (!resHost || !seatHost || resHost === seatHost) return true;
  if (seat.apiHost && resHost === seat.apiHost) return true;
  const seatParts = seatHost.split(".");
  const hostParts = resHost.split(".");
  if (seatParts.length < 2 || hostParts.length < 2) return false;
  if (seatParts.slice(-2).join(".") !== hostParts.slice(-2).join(".")) return false;
  return systemHostLabels().has(hostParts[0]!.toLowerCase());
}

/** Which road found the card: the vault's `a:mnbProfile` pointer, the derived address, or none. ⛔ There is no listing road. */
export type OwnCardRoad = "pointer" | "derived" | "none";

/** What a card read answers: its served `@id` and `@type`. */
export interface OwnCardRead {
  /** The served `@id`, or null when the answer names none. */
  atId?: string | null;
  /** The served `@type`. */
  type?: unknown;
}

/** The reads {@link findOwnCard} needs. Each THROWS on any failure that is not "absent". */
export interface FindOwnCardDeps extends OwnCardIdDeps {
  /** The vault entity's `a:mnbProfile` edge as an address or id, or null when it holds none. Throws when the entity cannot be read. */
  readProfilePointer: () => Promise<string | null>;
  /**
   * Reads the card at `uri`: `{ atId, type }` when it is there (a bare served `@id`, or `true`, says the same with no type),
   * `false` or `null` on the platform's 404. Throws on any other answer.
   */
  readCard: (id: string, uri: string) => Promise<OwnCardRead | string | boolean | null>;
}

/** What {@link findOwnCard} found. */
export interface OwnCardFinding {
  /** The id of the holder's own card by hard identity (the pointed Person, else the derived card), or null when there is none. */
  cardId: string | null;
  /** That card's address in its own vault. */
  cardUri: string | null;
  road: OwnCardRoad;
  /** Addresses of the holder's OTHER own cards seen on the way (the "second card" case). Reported, ⛔ never repaired. */
  otherOwnerCards: string[];
  /** False when the check for a second card failed; then {@link otherOwnerCards} says nothing. */
  otherOwnerCardsKnown: boolean;
  /** A pointer MyNet's validation refuses (not an owner id, or another vault): not followed, not changed, named. */
  ignoredPointer: string | null;
}

/**
 * 🔴 MyNet's pointer validation, shared (the two apps must never disagree about which card is his). A record
 * that a road names (the `a:mnbProfile` pointer, the derived address) is accepted as the holder's card only when its id is minted
 * FOR the owner ({@link OwnCardIds.isOwnerCardId}: an `mnb-profile*` slug or the seat's derived id) AND it sits in the seat
 * ({@link cardBelongsToVault}). This is MyNet's `isSeatOwnerCard`, which now calls it; GilbApp's {@link findOwnCard} calls it too.
 * ⚠ It VALIDATES a named record; it never picks a candidate. A pointer at a contact with a minted id is ignored.
 *
 * @param id the named record's id
 * @param atId its served `@id` (or the address it was read at); an empty value says nothing, as in MyNet
 * @param isOwnerCardId the seat's owner id test ({@link OwnCardIds.isOwnerCardId})
 * @param seat the seat vault
 */
export function isSeatOwnerCard(id: string, atId: string, isOwnerCardId: (id: string) => boolean, seat: CardSeat): boolean {
  return isOwnerCardId(id) && cardBelongsToVault(atId, seat);
}

/**
 * 🔴 Finds the holder's own card in his seat by hard identity, validated as MyNet validates it: the
 * record his vault's `a:mnbProfile` pointer names, when MyNet's pointer step accepts it ({@link isSeatOwnerCard}); else his derived
 * self card (`vsc-…`). ⛔ No listing road and no name road: GilbApp's create makes a record's id from its name, so "MNB Profile
 * Services AS" (a contact) gets an `mnb-profile-…` id, and MyNet's listing road (prefix first, then newest) adopted it.
 *
 * - Pointer: accepted exactly where MyNet's pointer step (`tryFollowPointer`) accepts it: the record is there and passes
 *   {@link isSeatOwnerCard}. A pointer MyNet ignores (at a contact with a minted id, at another vault) is ignored here too.
 * - Derived: the vault's derived card, when it is there. When the pointer already won, the same read shows a SECOND own card,
 *   reported in `otherOwnerCards`.
 *
 * Reads: the pointer (1), the pointed record (0-1), the derived card (0-1). Never a listing. ⛔ Nothing is written, repointed or
 * deleted.
 *
 * @param deps the reads and the derivation
 * @param vault the vault root whose card is wanted (the holder's landing vault)
 * @returns the finding
 * @throws when a read fails with anything but "absent" (a failure is never taken for absence), or when the root is empty
 */
export async function findOwnCard(deps: FindOwnCardDeps, vault: { vaultRoot: string } & CardSeat): Promise<OwnCardFinding> {
  const root = (vault.vaultRoot ?? "").trim().replace(/\/+$/, "");
  if (!root) throw new Error("findOwnCard needs the vault root: with none, no derived address can be read");
  const { derivedId, isOwnerCardId } = await ownCardIds(root, deps);
  const addressOf = (ref: string, id: string) => (/^https?:\/\//i.test(ref.trim()) ? ref.trim() : `${root}/e/${id}`);
  const seat: CardSeat = { vaultRoot: root, entity: vault.entity ?? null, apiHost: vault.apiHost ?? null };
  /** "absent" when not there; else whether MyNet's pointer validation accepts it ({@link isSeatOwnerCard}). */
  const judge = async (id: string, uri: string): Promise<"absent" | "accepted" | "refused"> => {
    const r = await deps.readCard(id, uri);
    if (r === null || r === false) return "absent";
    const read: OwnCardRead = typeof r === "object" ? r : { atId: typeof r === "string" ? r : null };
    return isSeatOwnerCard(id, read.atId || uri, isOwnerCardId, seat) ? "accepted" : "refused";
  };

  // --- Road 1: the vault's pointer, where MyNet's pointer step accepts it ---
  let cardId: string | null = null;
  let cardUri: string | null = null;
  let road: OwnCardRoad = "none";
  let ignoredPointer: string | null = null;
  const pointer = await deps.readProfilePointer();
  if (pointer && pointer.trim()) {
    const id = cardIdOf(pointer);
    if (id && !isOwnerCardId(id)) {
      // MyNet's validation refuses a non-owner id whatever the read says: no read needed to know it is ignored.
      ignoredPointer = pointer;
    } else if (id) {
      const verdict = await judge(id, addressOf(pointer, id));
      if (verdict === "accepted") {
        cardId = id;
        cardUri = addressOf(pointer, id);
        road = "pointer";
      } else if (verdict === "refused") {
        ignoredPointer = pointer;
      }
    }
  }

  // --- Road 2: the derived address; when the pointer already won, the same read shows a second card ---
  const otherOwnerCards: string[] = [];
  let otherOwnerCardsKnown = true;
  if (derivedId && derivedId !== cardId) {
    const derivedUri = `${root}/e/${derivedId}`;
    if (cardId === null) {
      // The road itself: a 404 goes on to "none"; any other failure throws.
      if ((await judge(derivedId, derivedUri)) === "accepted") {
        cardId = derivedId;
        cardUri = derivedUri;
        road = "derived";
      }
    } else {
      // Only the second-card check: its failure must not hide the card already found.
      try {
        if ((await judge(derivedId, derivedUri)) === "accepted") otherOwnerCards.push(derivedUri);
      } catch {
        otherOwnerCardsKnown = false;
      }
    }
  }
  return { cardId, cardUri, road, otherOwnerCards, otherOwnerCardsKnown, ignoredPointer };
}
