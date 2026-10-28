// Ported from `gilb-stakeholders` `test/ownCard/ownCard.test.ts` at 27fe0cef: 20 of its 25 tests (the others call symbols that are not in this unit).
import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { OWN_CARD_SLUG_PREFIX, cardIdOf, findOwnCard, ownCardIds, siblingVaultRoot, type FindOwnCardDeps } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";


// The real derivation (gilb-photo `selfCardIdForVault`): `vsc-` + the first 24 hex of sha256(vault root). Injected, because the
// package has no dependencies; the test pins it to the address measured on production 2026-09-16.
const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const SEGMENTS = ["base", "vault"] as const;
const ROOT = "https://kai.example/base";
const SIBLING = "https://kai.example/vault";

describe("ownCard", () => {

  describe("siblingVaultRoot", () => {
    it("swaps /base and /vault on a bare root and nothing else", () => {
      expect(siblingVaultRoot(ROOT, SEGMENTS)).toBe(SIBLING);
      expect(siblingVaultRoot(`${SIBLING}/`, SEGMENTS)).toBe(ROOT);
      expect(siblingVaultRoot(`${ROOT}/e/x`, SEGMENTS)).toBeUndefined();
      expect(siblingVaultRoot(`${ROOT}?q=1`, SEGMENTS)).toBeUndefined();
      expect(siblingVaultRoot("kai.example/base", SEGMENTS)).toBeUndefined();
      expect(siblingVaultRoot(null, SEGMENTS)).toBeUndefined();
    });
  });

  describe("cardIdOf", () => {
    it("takes the id from an address, a short form or a bare id", () => {
      expect(cardIdOf(`${ROOT}/e/mnb-profile-abc`)).toBe("mnb-profile-abc");
      expect(cardIdOf(`${ROOT}/e/vsc-1/`)).toBe("vsc-1");
      expect(cardIdOf("base:e/mnb-profile-x")).toBe("mnb-profile-x");
      expect(cardIdOf("vsc-2")).toBe("vsc-2");
      expect(cardIdOf("")).toBe("");
    });
  });

  describe("ownCardIds", () => {
    it("accepts the derived id of the root and of its sibling, and any mnb-profile id", async () => {
      const ids = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: SEGMENTS });
      const own = await selfCardIdForVault(ROOT);
      const sib = await selfCardIdForVault(SIBLING);
      expect(ids.derivedId).toBe(own);
      expect(ids.derivedIds).toEqual([own, sib]);
      expect(ids.isOwnerCardId(own)).toBe(true);
      expect(ids.isOwnerCardId(sib)).toBe(true);
      expect(ids.isOwnerCardId(`${OWN_CARD_SLUG_PREFIX}-06g3n6abadrfx11a4a6nsr73qr`)).toBe(true);
    });

    it("refuses a stakeholder record, another vault's self card and an empty id", async () => {
      const ids = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: SEGMENTS });
      expect(ids.isOwnerCardId("06gm3p3fdhvsq5a35hft48kh28")).toBe(false);
      expect(ids.isOwnerCardId(await selfCardIdForVault("https://ola.example/base"))).toBe(false);
      expect(ids.isOwnerCardId("")).toBe(false);
    });

    it("has only the slug test when there is no root or no digest", async () => {
      const none = await ownCardIds(null, { selfCardIdForVault, vaultPathSegments: SEGMENTS });
      expect(none.derivedId).toBeNull();
      expect(none.isOwnerCardId("mnb-profile-1")).toBe(true);
      expect(none.isOwnerCardId(await selfCardIdForVault(ROOT))).toBe(false);
      const broken = await ownCardIds(ROOT, {
        selfCardIdForVault: () => Promise.reject(new Error("no digest")),
        vaultPathSegments: SEGMENTS,
      });
      expect(broken.derivedId).toBeNull();
      expect(broken.isOwnerCardId("mnb-profile-1")).toBe(true);
    });
  });

  describe("findOwnCard", () => {
    // A vault: the pointer it holds and the cards that exist. Every read is logged, so the tests can count requests.
    const world = (opts: {
      pointer?: string | null;
      cards?: string[];
      failPointer?: number;
      failCard?: Record<string, number>;
      types?: Record<string, unknown>;
    }) => {
      const reads: string[] = [];
      const deps: FindOwnCardDeps = {
        selfCardIdForVault,
        vaultPathSegments: SEGMENTS,
        readProfilePointer: async () => {
          reads.push("pointer");
          if (opts.failPointer) throw new Error(`HTTP ${opts.failPointer}`);
          return opts.pointer ?? null;
        },
        readCard: async (id, uri) => {
          reads.push(`card ${id} @ ${uri}`);
          const fail = opts.failCard?.[id];
          if (fail) throw new Error(`HTTP ${fail}`);
          // A card that is there is served as a Person, as MyNet's cards are; `types` overrides one card's type.
          return (opts.cards ?? []).includes(id) ? { atId: null, type: opts.types?.[id] ?? "t:Person" } : null;
        },
      };
      return { deps, reads };
    };
    const LEGACY = "mnb-profile-06g3n6abadrfx11a4a6nsr73qr";

    it("one card: no pointer, the derived card exists (2 reads)", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps, reads } = world({ cards: [derived] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f).toEqual({
        cardId: derived,
        cardUri: `${ROOT}/e/${derived}`,
        road: "derived",
        otherOwnerCards: [],
        otherOwnerCardsKnown: true,
        ignoredPointer: null,
      });
      expect(reads).toEqual(["pointer", `card ${derived} @ ${ROOT}/e/${derived}`]);
    });

    it("one card: the pointer names the derived card (2 reads, never the same card twice)", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps, reads } = world({ pointer: `${ROOT}/e/${derived}`, cards: [derived] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(derived);
      expect(f.road).toBe("pointer");
      expect(f.otherOwnerCards).toEqual([]);
      expect(reads).toHaveLength(2);
    });

    it("two cards: the pointer names a legacy mnb-profile card and a vsc- card exists too; MyNet's card is the legacy one", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps, reads } = world({ pointer: `${ROOT}/e/${LEGACY}`, cards: [LEGACY, derived] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(LEGACY);
      expect(f.cardUri).toBe(`${ROOT}/e/${LEGACY}`);
      expect(f.road).toBe("pointer");
      expect(f.otherOwnerCards).toEqual([`${ROOT}/e/${derived}`]);
      expect(f.otherOwnerCardsKnown).toBe(true);
      expect(reads).toHaveLength(3);
    });

    it("a legacy card and no vsc- card: one card, the legacy one", async () => {
      const { deps } = world({ pointer: `${ROOT}/e/${LEGACY}`, cards: [LEGACY] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(LEGACY);
      expect(f.otherOwnerCards).toEqual([]);
    });

    it("a pointer in short form is read at the vault's own address", async () => {
      const { deps, reads } = world({ pointer: `base:e/${LEGACY}`, cards: [LEGACY] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardUri).toBe(`${ROOT}/e/${LEGACY}`);
      expect(reads[1]).toBe(`card ${LEGACY} @ ${ROOT}/e/${LEGACY}`);
    });

    it("D5b: a pointer at a contact without an owner id is ignored as MyNet ignores it (B15), never read, and named", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const person = "06gm3p3fdhvsq5a35hft48kh28";
      const { deps, reads } = world({ pointer: `${ROOT}/e/${person}`, cards: [derived, person] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(derived);
      expect(f.road).toBe("derived");
      expect(f.ignoredPointer).toBe(`${ROOT}/e/${person}`);
      expect(reads.some((r) => r.includes(person))).toBe(false);
      expect(reads).toHaveLength(2);
    });

    it("a pointer naming a record that is not a Person is refused, named, and the derived card is read", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const org = `${ROOT}/e/06gm3p3fdhvsq5a35hft48kh28`;
      const { deps } = world({ pointer: org, cards: [derived, "06gm3p3fdhvsq5a35hft48kh28"], types: { "06gm3p3fdhvsq5a35hft48kh28": "t:Organization" } });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(derived);
      expect(f.road).toBe("derived");
      expect(f.ignoredPointer).toBe(org);
    });

    it("a pointer whose card is gone goes on to the derived card", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps } = world({ pointer: `${ROOT}/e/${LEGACY}`, cards: [derived] });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(derived);
      expect(f.road).toBe("derived");
    });

    it("a pointed card whose SERVED @id sits on another person vault is refused, as MyNet refuses it (isSeatOwnerCard)", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps } = world({ pointer: `${ROOT}/e/${LEGACY}`, cards: [derived] });
      const inner = deps.readCard;
      deps.readCard = async (id, uri) => (id === LEGACY ? `https://helip.example/base/e/${LEGACY}` : inner(id, uri));
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(derived);
      expect(f.road).toBe("derived");
    });

    it("no card at all: none, nothing made", async () => {
      const { deps } = world({});
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBeNull();
      expect(f.cardUri).toBeNull();
      expect(f.road).toBe("none");
    });

    it("a failed derived read (not a 404) throws: absence is never concluded from a failure", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps } = world({ failCard: { [derived]: 503 } });
      await expect(findOwnCard(deps, { vaultRoot: ROOT })).rejects.toThrow("503");
    });

    it("a failed pointer read throws", async () => {
      const { deps } = world({ failPointer: 503 });
      await expect(findOwnCard(deps, { vaultRoot: ROOT })).rejects.toThrow("503");
    });

    it("a failed pointer-card read throws (it may be the card MyNet shows)", async () => {
      const { deps } = world({ pointer: `${ROOT}/e/${LEGACY}`, failCard: { [LEGACY]: 503 } });
      await expect(findOwnCard(deps, { vaultRoot: ROOT })).rejects.toThrow("503");
    });

    it("the pointer card found, the second-card check failed: the answer stands, the second card is not known", async () => {
      const derived = await selfCardIdForVault(ROOT);
      const { deps } = world({ pointer: `${ROOT}/e/${LEGACY}`, cards: [LEGACY], failCard: { [derived]: 503 } });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f.cardId).toBe(LEGACY);
      expect(f.otherOwnerCards).toEqual([]);
      expect(f.otherOwnerCardsKnown).toBe(false);
    });

    it("refuses an empty vault root", async () => {
      const { deps, reads } = world({});
      await expect(findOwnCard(deps, { vaultRoot: " " })).rejects.toThrow(/vault root/);
      expect(reads).toEqual([]);
    });
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
