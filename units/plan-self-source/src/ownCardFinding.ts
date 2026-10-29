// The holder's own card in a vault, found by hard identity only: the card derived for that vault, or the record the vault's profile pointer names.
// The query is one per landing vault, read once per session. The decision itself is `own-card`'s; this wires it to the record read.
// ⛔ Nothing here writes, repoints or deletes a card.

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { findOwnCard, type FindOwnCardDeps, type OwnCardFinding } from "@kaigilb/gilbplatformcode-own-card";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { VAULT_PATH_SEGMENTS, selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { joinPersonName } from "./personName";
import { PROFILE_POINTER_ATTR, vaultRootOf } from "./vaultRoot";

/**
 * The first address in a served `a:mnbProfile` value: a string, `{ "@id" }`, or an array of either (an entity holding both the
 * old bare key and `a:mnbProfile` frames as one key with two values; MyNet `profileStore.ts` `pointerFromVaultEntity`).
 */
function pointerOf(raw: unknown): string | null {
  for (const v of Array.isArray(raw) ? raw : [raw]) {
    const s = typeof v === "string" ? v : v && typeof v === "object" ? (v as { "@id"?: unknown })["@id"] : null;
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return null;
}

/**
 * The reads `findOwnCard` needs, on this app's record read. The vault entity is read where its own address says (Base answers
 * a dereference only at the host the request names); a 404 is "absent", any other failure throws (`readRecord`).
 *
 * @param landing the holder's landing vault
 */
export function ownCardDeps(landing: ReachableVault, onCardRead?: (id: string, name: string | null, atId: string | null) => void): FindOwnCardDeps {
  return {
    selfCardIdForVault,
    vaultPathSegments: VAULT_PATH_SEGMENTS,
    readProfilePointer: async () => {
      if (!landing.entity) return null;
      const tail = landing.entity.slice(landing.entity.lastIndexOf("/") + 1);
      const rec = await readRecord(tail, landing.entity);
      if (!rec) return null;
      return pointerOf(rec.served?.facts[PROFILE_POINTER_ATTR] ?? rec.facts[PROFILE_POINTER_ATTR]);
    },
    // The served `@id`: the package validates the pointed record as MyNet does (`isSeatOwnerCard`: owner id, this vault).
    // ⛔ No listing road: the card is found by identity, never by listing.
    readCard: async (id, uri) => {
      const rec = await readRecord(id, uri);
      // The card's name, from this same read, so the Stakeholders self row is named from the first draw.
      if (rec) onCardRead?.(id, cardNameOf(rec.facts), rec.entityUri ?? null);
      return rec ? { atId: rec.entityUri ?? null, type: rec.typeUri } : null;
    },
  };
}

/** The host of the API origin this app talks to: a mint host, never another person's vault (MyNet's `apiOriginHost`). */
function apiHostOf(): string | null {
  try {
    return new URL(baseOrigin()).hostname;
  } catch {
    return null;
  }
}

/**
 * A card's name as MyNet shows it: its one name, else the given and family name joined (`personName.ts`); null when it has none.
 *
 * @param facts the record's facts (bare slugs, as `readRecord` gives them)
 */
function cardNameOf(facts: Readonly<Record<string, string>>): string | null {
  const one = (facts.name ?? "").trim();
  if (one) return one;
  return joinPersonName(facts.givenName ?? "", facts.familyName ?? "") || null;
}

/** The own-card finding with the card's name, read by the finding's own read of the card. */
export type OwnCardFindingNamed = OwnCardFinding & {
  /** The own card's name (null: it shows none; absent: not read here, e.g. a finding set by a test). */
  cardName?: string | null;
  /** The own card's served `@id` (what `a:statedBy` states, as the card says its own address); absent: not read here. */
  cardAtId?: string | null;
};

/** The query key of the holder's own-card finding: one per landing vault, read once per session. */
export const ownCardFindingKey = (landingVaultId: string) => ["own-card", "finding", landingVaultId] as const;

/**
 * The one set of query options for the holder's own-card finding in a vault: the card's own-card test and the
 * Stakeholders list's self row share this entry, so the finding is read ONCE per session for both.
 *
 * @param vault the vault the finding is for (the holder's landing vault), or null: then nothing is read
 */
export function ownCardFindingQuery(vault: ReachableVault | null) {
  return {
    queryKey: ownCardFindingKey(vault?.vaultId ?? ""),
    queryFn: async (): Promise<OwnCardFindingNamed> => {
      const names = new Map<string, string | null>();
      const atIds = new Map<string, string | null>();
      const finding = await findOwnCard(ownCardDeps(vault!, (id, name, atId) => (names.set(id, name), atIds.set(id, atId))), {
        vaultRoot: vaultRootOf(vault!.vaultId) ?? "",
        entity: vault!.entity,
        apiHost: apiHostOf(),
      });
      return { ...finding, cardName: finding.cardId ? (names.get(finding.cardId) ?? null) : null, cardAtId: finding.cardId ? (atIds.get(finding.cardId) ?? null) : null };
    },
    enabled: !!vault,
    staleTime: Infinity,
    retry: false,
  } as const;
}
