// Ported from `gilb-stakeholders` `test/ownCard/ownCard.d5.test.ts` at 0a261488: 10 of its 10 tests (1 was ported at 0.1.0; the other 9 call `isHoldersOwnCard`, now in this unit). Header comment replaced and a few inline comments that name a person, agent or ticket reworded; `veda.gilb.com` served types read `veda.example.test`.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOwnCard, isHoldersOwnCard, ownCardIds, type FindOwnCardDeps } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";

const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const SEGMENTS = ["base", "vault"] as const;
const ROOT = "https://t3solo.example/vault";
const LEGACY = "mnb-profile-06gn7xywz9smdae2ehb7c4q57m"; // a real legacy card MyNet minted
const CONTACT = "mnb-profile-services-as-06gn7y1jfnr7x0g9grs9x5kps8"; // a Person contact named "MNB Profile Services AS"
const PARTNERS = "mnb-profile-partners-06gn7y9q3nz8x2ehb7c4q57m00"; // a newer Person contact named "MNB Profile Partners"
const ADA = "ada-lovelace-06gn7y2bbbz8x2ehb7c4q57m11"; // an ordinary Person contact (no owner prefix)
const ORG = "mnb-profile-org-06gn7y3cccz8x2ehb7c4q57m22"; // an organisation named "MNB Profile Org"

/** A seat: its pointer and its records by id with their served type. Listing is offered and must never be read. */
function seat(opts: { pointer?: string | null; cards: Record<string, unknown> }) {
  const reads: string[] = [];
  const deps = {
    selfCardIdForVault,
    vaultPathSegments: SEGMENTS,
    readProfilePointer: async () => (reads.push("pointer"), opts.pointer ?? null),
    readCard: async (id: string) => {
      reads.push(`card ${id}`);
      return id in opts.cards ? { atId: `${ROOT}/e/${id}`, type: opts.cards[id] } : null;
    },
    listPersonCards: async () => {
      reads.push("listing");
      return Object.keys(opts.cards).map((id) => ({ entity: `${ROOT}/e/${id}`, updatedAt: "2026-10-19T11:42:17Z" }));
    },
  } satisfies FindOwnCardDeps & { listPersonCards: unknown };
  return { deps, reads };
}

async function decideAll(opts: { pointer?: string | null; cards: Record<string, unknown> }) {
  const { deps, reads } = seat(opts);
  const f = await findOwnCard(deps, { vaultRoot: ROOT });
  const { derivedIds } = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: SEGMENTS });
  const own = (id: string) => isHoldersOwnCard(id, derivedIds, f);
  return { f, reads, own };
}

describe("D5: a contact named 'MNB Profile …' is never his own card", () => {
  it("no vsc- card, no pointer, one Person contact named 'MNB Profile Services AS': not his, and nothing is his", async () => {
    const { f, reads, own } = await decideAll({ cards: { [CONTACT]: "t:Person", [ADA]: "t:Person" } });
    expect(own(CONTACT)).toBe(false);
    expect(own(ADA)).toBe(false);
    expect(f).toMatchObject({ cardId: null, road: "none" });
    expect(reads).not.toContain("listing");
  });

  it("a real legacy card and a NEWER contact 'MNB Profile Partners', no pointer, no vsc-: neither is his", async () => {
    const { own, reads } = await decideAll({ cards: { [LEGACY]: "t:Person", [PARTNERS]: "t:Person" } });
    expect(own(PARTNERS)).toBe(false);
    expect(own(LEGACY)).toBe(false); // a legacy card that neither names is an ordinary record (the ruling's accepted consequence)
    expect(reads).not.toContain("listing");
  });

  it("the same, with the pointer naming the legacy card: the legacy card is his, the newer contact is not", async () => {
    const { f, own } = await decideAll({ pointer: `${ROOT}/e/${LEGACY}`, cards: { [LEGACY]: "t:Person", [PARTNERS]: "t:Person" } });
    expect(f).toMatchObject({ cardId: LEGACY, road: "pointer" });
    expect(own(LEGACY)).toBe(true);
    expect(own(PARTNERS)).toBe(false);
  });
});

describe("D5: the pointer", () => {
  // D5b (the apps never disagree): the pointer is accepted exactly where MyNet's pointer step accepts it, through the
  // shared `isSeatOwnerCard`.
  it("D5b: names a pointer MyNet accepts (his legacy card): his, and the newer contact is not", async () => {
    const { f, own } = await decideAll({ pointer: `${ROOT}/e/${LEGACY}`, cards: { [LEGACY]: "https://veda.example.test/base/t/Person", [CONTACT]: "t:Person" } });
    expect(f).toMatchObject({ cardId: LEGACY, road: "pointer", ignoredPointer: null });
    expect(own(LEGACY)).toBe(true);
    expect(own(CONTACT)).toBe(false);
  });

  it("D5b: names a contact without the prefix (Ada): ignored as MyNet ignores it (B15), never read; a leftover pointer locks nothing", async () => {
    const { f, own, reads } = await decideAll({ pointer: `${ROOT}/e/${ADA}`, cards: { [ADA]: "t:Person" } });
    expect(own(ADA)).toBe(false);
    expect(f).toMatchObject({ cardId: null, road: "none", ignoredPointer: `${ROOT}/e/${ADA}` });
    expect(reads.some((r) => r.includes(ADA))).toBe(false);
  });

  it("D5b: names a contact without the prefix while his vsc- card exists: only the vsc- card is his", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { f, own } = await decideAll({ pointer: `${ROOT}/e/${ADA}`, cards: { [ADA]: "t:Person", [derived]: "t:Person" } });
    expect(f).toMatchObject({ cardId: derived, road: "derived" });
    expect(own(derived)).toBe(true);
    expect(own(ADA)).toBe(false);
  });

  it("D5b: names a record on another vault: refused as MyNet refuses it", async () => {
    const { deps } = seat({ pointer: `https://helip.example/base/e/${LEGACY}`, cards: { [LEGACY]: "t:Person" } });
    deps.readCard = async () => ({ atId: `https://helip.example/base/e/${LEGACY}`, type: "t:Person" });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f.cardId).toBeNull();
  });

  it("names a record that is gone: nothing is his but the vsc- card, if any", async () => {
    const { f, own } = await decideAll({ pointer: `${ROOT}/e/${LEGACY}`, cards: { [CONTACT]: "t:Person" } });
    expect(f).toMatchObject({ cardId: null, ignoredPointer: null });
    expect(own(CONTACT)).toBe(false);
  });
});

describe("D5: the derived vsc- card", () => {
  it("present: his, with no read and whatever its type; a legacy card and a 'MNB Profile' contact beside it are not", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { f, own, reads } = await decideAll({ cards: { [derived]: "t:Organization", [LEGACY]: "t:Person", [CONTACT]: "t:Person" } });
    expect(f).toMatchObject({ cardId: derived, road: "derived" });
    expect(own(derived)).toBe(true);
    expect(isHoldersOwnCard(derived, [derived], undefined)).toBe(true); // before any read
    expect(own(LEGACY)).toBe(false);
    expect(own(CONTACT)).toBe(false);
    expect(reads).toEqual(["pointer", `card ${derived}`]);
  });

  it("absent: nothing is his unless the pointer names a Person", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { f, own, reads } = await decideAll({ cards: { [LEGACY]: "t:Person", [CONTACT]: "t:Person" } });
    expect(f.cardId).toBeNull();
    for (const id of [LEGACY, CONTACT]) expect(own(id)).toBe(false);
    expect(reads).toEqual(["pointer", `card ${derived}`]); // 2 reads, never a listing
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
