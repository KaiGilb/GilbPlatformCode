// Ported from `gilb-stakeholders` `test/ownCard/ownCard.tester-d5.test.ts` at 0a261488: 3 of its 3 tests (left out at 0.1.0 for `isHoldersOwnCard`, now in this unit). Comments reworded.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOwnCard, isHoldersOwnCard, ownCardIds, type FindOwnCardDeps } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";

const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const SEGMENTS = ["base", "vault"] as const;
const ROOT = "https://t3solo.example/vault";
const LEGACY = "mnb-profile-06gn7xywz9smdae2ehb7c4q57m";
const CONTACT = "mnb-profile-services-as-06gn7y1jfnr7x0g9grs9x5kps8"; // a Person contact named "MNB Profile Services AS"
const EXACT = "mnb-profile-06gn7xxa71tmf5eyrvv2t5j3z4"; // a Person contact named exactly "MNB Profile"
// Type-only change from the source test. The D5 ruling removed `listPersonCards` from `FindOwnCardDeps`; the listing is
// still offered here (as an extra field) to prove `findOwnCard` never reads it. The assertions are the source's, unchanged.
function seat(
  cards: Record<string, string>,
  listing: { id: string; at: string }[],
): FindOwnCardDeps & { listPersonCards: () => Promise<{ entity: string; updatedAt: string }[]> } {
  return {
    selfCardIdForVault,
    vaultPathSegments: SEGMENTS,
    readProfilePointer: async () => null,
    readCard: async (id) => (id in cards ? { atId: `${ROOT}/e/${id}`, type: cards[id] } : null),
    listPersonCards: async () => listing.map((r) => ({ entity: `${ROOT}/e/${r.id}`, updatedAt: r.at })),
  };
}
const decide = async (id: string, deps: FindOwnCardDeps) => {
  const f = await findOwnCard(deps, { vaultRoot: ROOT });
  const { derivedIds } = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: SEGMENTS });
  return isHoldersOwnCard(id, derivedIds, f);
};

describe("D5: a Person contact named 'MNB Profile …' is never the holder's own card, even with no derived card", () => {
  it("no card of his at all, one contact named 'MNB Profile Services AS': not his (rig t3solo)", async () => {
    expect(await decide(CONTACT, seat({ [CONTACT]: "t:Person" }, [{ id: CONTACT, at: "2026-10-19T11:42:17Z" }]))).toBe(false);
  });
  it("no card of his at all, one contact named exactly 'MNB Profile': not his", async () => {
    expect(await decide(EXACT, seat({ [EXACT]: "t:Person" }, [{ id: EXACT, at: "2026-10-19T11:42:17Z" }]))).toBe(false);
  });
  it("his legacy card and a NEWER contact named 'MNB Profile Services AS': the contact is not his", async () => {
    const deps = seat({ [LEGACY]: "t:Person", [CONTACT]: "t:Person" }, [
      { id: LEGACY, at: "2026-01-01T00:00:00Z" },
      { id: CONTACT, at: "2026-10-19T11:42:17Z" },
    ]);
    expect(await decide(CONTACT, deps)).toBe(false);
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
