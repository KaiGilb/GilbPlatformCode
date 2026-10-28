// New tests: what the ported blocks left unpinned in ownCard.ts (found by mutation checks).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardIdOf, findOwnCard, ownCardIds, siblingVaultRoot, cardBelongsToVault, type FindOwnCardDeps } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";

beforeEach(() => setSystemHostLabels(["id"]));
afterEach(() => resetSystemHostLabels());

const derive = async (root: string) => `vsc-${root.replace(/[^a-z0-9]/gi, "")}`;
const SEGMENTS = ["base", "vault"] as const;

describe("siblingVaultRoot", () => {
  it("only a pair has a sibling: with one segment, or three, there is no 'other root'", () => {
    expect(siblingVaultRoot("https://x.example.test/a", ["a", "b", "c"])).toBeUndefined();
    expect(siblingVaultRoot("https://x.example.test/a", ["a"])).toBeUndefined();
  });
  it("only an http(s) address has one", () => {
    expect(siblingVaultRoot("ftp://x.example.test/base", SEGMENTS)).toBeUndefined();
    expect(siblingVaultRoot("not an address", SEGMENTS)).toBeUndefined();
    expect(siblingVaultRoot("  HTTPS://x.example.test/base ", SEGMENTS)).toBe("https://x.example.test/vault");
  });
});

describe("cardIdOf", () => {
  it("takes the id after a colon when there is no slash", () => {
    expect(cardIdOf("base:abc")).toBe("abc");
    expect(cardIdOf("  base:abc//  ")).toBe("abc");
  });
});

describe("ownCardIds", () => {
  it("an empty id is never an owner id, even when a derivation answered an empty id", async () => {
    const ids = await ownCardIds("https://x.example.test/base", { selfCardIdForVault: async () => "", vaultPathSegments: SEGMENTS });
    expect(ids.derivedIds).toContain("");
    expect(ids.isOwnerCardId("")).toBe(false);
  });
  it("the slug must START the id: an id that merely contains it is not an owner id", async () => {
    const ids = await ownCardIds("https://x.example.test/base", { selfCardIdForVault: derive, vaultPathSegments: SEGMENTS });
    expect(ids.isOwnerCardId("mnb-profile-x")).toBe(true);
    expect(ids.isOwnerCardId("x-mnb-profile")).toBe(false);
  });
});

describe("cardBelongsToVault", () => {
  it("a host with a single label cannot share an apex: a card on another one is foreign", () => {
    expect(cardBelongsToVault("https://other/base/e/x", { vaultRoot: "https://seat/base" })).toBe(false);
    expect(cardBelongsToVault("https://other.example.test/base/e/x", { vaultRoot: "https://seat/base" })).toBe(false);
    expect(cardBelongsToVault("https://other/base/e/x", { vaultRoot: "https://seat.example.test/base" })).toBe(false);
  });
});

describe("findOwnCard", () => {
  const ROOT = "https://alice.example.test/base";
  const base = (over: Partial<FindOwnCardDeps> = {}): FindOwnCardDeps => ({
    selfCardIdForVault: derive,
    vaultPathSegments: SEGMENTS,
    readProfilePointer: async () => null,
    readCard: async () => null,
    ...over,
  });
  it("a trailing slash on the root is not part of it: the derivation and the card's address are those of the bare root", async () => {
    const asked: string[] = [];
    const f = await findOwnCard(base({ readCard: async (_id, uri) => (asked.push(uri), { atId: uri }) }), { vaultRoot: `${ROOT}//` });
    expect(f.cardId).toBe(await derive(ROOT));
    expect(f.cardUri).toBe(`${ROOT}/e/${await derive(ROOT)}`);
    expect(asked).toEqual([f.cardUri]);
  });
  it("a pointer the check refuses is named in ignoredPointer, not followed", async () => {
    const foreign = "https://group.example.test/base/e/mnb-profile-1";
    const f = await findOwnCard(base({ readProfilePointer: async () => foreign, readCard: async (id) => (id.startsWith("mnb-profile") ? { atId: foreign } : null) }), { vaultRoot: ROOT });
    expect(f.ignoredPointer).toBe(foreign);
    expect(f.road).toBe("none");
    expect(f.cardId).toBeNull();
  });
  it("a pointer that wins is the pointer road, and the derived card seen beside it is reported as a second card", async () => {
    const pointed = `${ROOT}/e/mnb-profile-1`;
    const f = await findOwnCard(base({ readProfilePointer: async () => pointed, readCard: async (_id, uri) => ({ atId: uri }) }), { vaultRoot: ROOT });
    expect(f.road).toBe("pointer");
    expect(f.cardUri).toBe(pointed);
    expect(f.otherOwnerCards).toEqual([`${ROOT}/e/${await derive(ROOT)}`]);
    expect(f.otherOwnerCardsKnown).toBe(true);
    expect(f.ignoredPointer).toBeNull();
  });
});
