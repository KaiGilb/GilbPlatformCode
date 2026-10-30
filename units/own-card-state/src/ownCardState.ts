// Whether one record is the signed-in person's own card, and the state a record card needs to treat it so: not own, own, or still
// being decided (read only while it is). The decision is the `own-card` unit's, by hard identity only: the card derived for the
// person's seat, or the record the seat's profile pointer names. Nothing here writes, repoints or deletes a card.
// The finding for the seat (`ownCardFindingQuery`) is `plan-self-source`'s and is read once per session; this file reads it.
import { useQuery } from "@tanstack/react-query";
import { SELF_CARD_ID_PREFIX, VAULT_PATH_SEGMENTS, selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import {
  OWN_CARD_SLUG_PREFIX,
  isHoldersOwnCard,
  ownCardCaseOf,
  ownCardIds,
  type OwnCardCase,
  type OwnCardFinding,
} from "@kaigilb/gilbplatformcode-own-card";
import { isHeldVault } from "@kaigilb/gilbplatformcode-person-create";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingQuery } from "@kaigilb/gilbplatformcode-plan-self-source";
import { typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-vault-profile-photo";

/**
 * True when a record could be the holder's own card at all: its id is owner-shaped (`vsc-…` or `mnb-profile…`). The pointer
 * is accepted only where MyNet's pointer validation accepts it (`isSeatOwnerCard`: an owner id in the seat), so no
 * other record can ever be his. A cheap, synchronous gate: every other record (Ada, any contact) skips the own-card work
 * entirely, reads nothing and is never read only, as on main.
 *
 * ⚠ A NECESSARY condition only, ⛔ never the decision: the derived id is proven by its digest, a legacy id only by the pointer
 * (`isHoldersOwnCard`). A record merely NAMED "MNB Profile …" passes this gate and is still ordinary unless the pointer names it.
 *
 * @param record the record's id
 */
export function mayBeOwnCard(record: { id: string; typeUri?: string | null }): boolean {
  return record.id.startsWith(SELF_CARD_ID_PREFIX) || record.id.startsWith(OWN_CARD_SLUG_PREFIX);
}

/**
 * True when a vault represents a PERSON (`a:vaultRepresents`, served by `GET /lws/vaults` as `represents`), by the type's local
 * name. ⚠ An unset type is accepted only by the caller, and only for the holder's landing vault (below).
 */
function representsPerson(represents: string | null): boolean {
  return !!represents && typeLocalName(represents) === "Person";
}

/**
 * True when a vault is the holder's seat: his landing vault, held, typed Person or untyped. Synchronous, no request.
 *
 * @param vault the vault a record is held in
 * @param vaults the session's reachable vaults
 */
export function isOwnSeat(vault: ReachableVault | null, vaults: readonly ReachableVault[]): vault is ReachableVault {
  if (!vault || !vault.isLandingVault || !isHeldVault(vault, vaults)) return false;
  return vault.represents === null || representsPerson(vault.represents);
}

/** Where a record stands before the finding: not in his seat, his seat's derived card, or a record only the pointer can make his. */
export type OwnCardCandidacy = "no" | "derived" | "finding";

/**
 * Where a record stands in the holder's seat, with no request (only the digest). The seat is the vault that REPRESENTS HIM AS A
 * PERSON, his landing vault (MyNet's seat).
 *
 * 🔴 ⛔ Never "any vault he holds". An organisation (or project) vault nested under his has a
 * derived self card too, and that card is the ORGANISATION's: it stays an ordinary, editable record, as on main.
 * - His landing vault, typed Person or untyped (MyNet treats the seat as his whatever its type): his seat.
 * - His landing vault typed as anything else (an organisation's account), and any other vault, held or not: never.
 *
 * 🔴 In the seat, ⛔ never from an id string or a name. The derived `vsc-` id is hard
 * identity ("derived"); any other record is his only when his vault's `a:mnbProfile` pointer names it and MyNet's validation accepts it ("finding"),
 * decided by the package's `isHoldersOwnCard` on `findOwnCard`'s answer.
 *
 * @param recordId the record's id
 * @param vault the vault the record is held in
 * @param vaults the session's reachable vaults
 */
export async function ownCardCandidacy(recordId: string, vault: ReachableVault | null, vaults: readonly ReachableVault[]): Promise<OwnCardCandidacy> {
  if (!recordId || !isOwnSeat(vault, vaults)) return "no";
  const ids = await ownCardIds(vaultRootOf(vault.vaultId), { selfCardIdForVault, vaultPathSegments: VAULT_PATH_SEGMENTS });
  return isHoldersOwnCard(recordId, ids.derivedIds, undefined) ? "derived" : "finding";
}

/**
 * Whether a record is the holder's own card: in his seat ({@link ownCardCandidacy}) AND either his derived card or the record his
 * vault's pointer names (`finding`, `findOwnCard` for his landing vault). The package's `isHoldersOwnCard` decides.
 *
 * @param recordId the record's id
 * @param vault the vault the record is held in
 * @param vaults the session's reachable vaults
 * @param finding `findOwnCard`'s answer for his landing vault; left out or null, only the derived card is his
 * @returns true for the holder's own card
 */
export async function isOwnCardIn(
  recordId: string,
  vault: ReachableVault | null,
  vaults: readonly ReachableVault[],
  finding: OwnCardFinding | null = null,
): Promise<boolean> {
  const c = await ownCardCandidacy(recordId, vault, vaults);
  if (c === "no") return false;
  const ids = await ownCardIds(vaultRootOf(vault!.vaultId), { selfCardIdForVault, vaultPathSegments: VAULT_PATH_SEGMENTS });
  return isHoldersOwnCard(recordId, ids.derivedIds, finding) === true;
}



/** What the card and the grid row need to know about one record. */
export interface OwnCardState {
  /** True while the record might be the own card and the test has not answered: the card stays read only meanwhile. */
  pending: boolean;
  /** The record is the holder's own card ({@link isOwnCardIn}): his derived card, or the record his vault's pointer names (as MyNet validates it). */
  own: boolean;
  /** How it stands to the card MyNet shows (meaningful only when `own`). */
  standing: OwnCardCase;
}

const NOT_OWN: OwnCardState = { pending: false, own: false, standing: { kind: "unknown" } };
const PENDING: OwnCardState = { pending: true, own: false, standing: { kind: "unknown" } };

/**
 * The own-card state of one record. A record that cannot be his own card ({@link mayBeOwnCard}: no owner-shaped id)
 * reads nothing and answers "not own" at once. For a candidate: the seat test (no request); then, for a candidate in his seat
 * that is not his derived card, the finding for his landing vault (the pointer, the pointed record, the derived card: 2-3 reads,
 * read ONCE PER SESSION and shared by every row and card through the query cache, so +0 per card). His derived card is his at
 * once; any other candidate is his only when the finding names it (hard identity only).
 *
 * @param record the record (its id and, when known, its type)
 * @param vaultId the vault the record is held in (its namespace), or null when not known
 * @param vaults the session's reachable vaults (the shell's), or null when there is no shell; then nothing is the holder's
 */
export function useOwnCard(
  record: { id: string; typeUri?: string | null },
  vaultId: string | null,
  vaults: readonly ReachableVault[] | null,
): OwnCardState {
  // The seat test is synchronous (no request): a record outside his seat, or one that cannot be his card, is NOT own at once.
  const vault = vaultId ? ((vaults ?? []).find((v) => v.vaultId === vaultId) ?? null) : null;
  const candidate = mayBeOwnCard(record) && isOwnSeat(vault, vaults ?? []);
  const seatRoot = candidate ? vaultRootOf(vault!.vaultId) : null;
  // The seat's derived ids: one digest per seat per session, shared by every row and card.
  const idsQ = useQuery({
    queryKey: ["own-card", "ids", vaultId ?? ""],
    queryFn: () => ownCardIds(seatRoot, { selfCardIdForVault, vaultPathSegments: VAULT_PATH_SEGMENTS }),
    enabled: candidate,
    staleTime: Infinity,
  });
  const derived = !!idsQ.data && isHoldersOwnCard(record.id, idsQ.data.derivedIds, undefined) === true;
  const findingQ = useQuery<OwnCardFinding>({ ...ownCardFindingQuery(vault), enabled: candidate && !!idsQ.data });
  if (!candidate) return NOT_OWN;
  // ⚠ A digest that fails (no WebCrypto) leaves `data` undefined: the card stays read only rather than open for an edit that may
  // land on the holder's own card.
  if (idsQ.data === undefined) return PENDING;
  if (!derived) {
    // Only the pointer can say. While the finding is out: read only. When it failed: an ordinary record, as on main (⛔ never "his" by id).
    if (findingQ.isError) return NOT_OWN;
    if (findingQ.data === undefined) return PENDING;
    if (isHoldersOwnCard(record.id, idsQ.data.derivedIds, findingQ.data) !== true) return NOT_OWN;
  }
  // Own implies his seat (his landing vault), which is the vault the finding was read for.
  return { pending: false, own: true, standing: ownCardCaseOf(record.id, findingQ.data ?? null) };
}

