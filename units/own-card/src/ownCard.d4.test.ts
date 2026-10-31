// Ported from `gilb-stakeholders` `test/ownCard/ownCard.d4.test.ts` at 0a261488: 10 of its 10 tests (left out at 0.1.0 for `isHoldersOwnCard` and `isPersonCardType`, now in this unit). Header comment replaced and a few inline comments that name a person, agent or ticket reworded; `veda.gilb.com` served types read `veda.example.test`.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findOwnCard,
  isHoldersOwnCard,
  isPersonCardType,
  ownCardIds,
  type FindOwnCardDeps,
  type OwnCardFinding,
} from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";

const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const SEGMENTS = ["base", "vault"] as const;
const ROOT = "https://t1kai.example/vault";
const LEGACY = "mnb-profile-06gn7dsf5xs9n50y392hmp58y4";
const ORG = "mnb-profile-makers-ltd-06gn7dw3fsy2hagdpr1kp0rp20";
const CONTACT = "mnb-profile-services-as-06gn7dt12xsendqmdbax55b3b4";
const NOTE = "mnb-profile-ideas-06gn7dtk0nyvz7exc6t2j1pzqr";

/** A seat: its pointer and its cards by id with their served type. Every read is logged. */
function seat(opts: { pointer?: string | null; cards?: Record<string, unknown> }) {
  const reads: string[] = [];
  const deps: FindOwnCardDeps = {
    selfCardIdForVault,
    vaultPathSegments: SEGMENTS,
    readProfilePointer: async () => (reads.push("pointer"), opts.pointer ?? null),
    readCard: async (id) => {
      reads.push(`card ${id}`);
      return opts.cards && id in opts.cards ? { atId: `${ROOT}/e/${id}`, type: opts.cards[id] } : null;
    },
  };
  return { deps, reads };
}

const decide = async (recordId: string, finding: OwnCardFinding | null | undefined) => {
  const { derivedIds } = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: SEGMENTS });
  return isHoldersOwnCard(recordId, derivedIds, finding);
};

describe("D4: a record merely named 'MNB Profile …' is never the holder's own card", () => {
  it("an organisation, a contact and a note named so, beside his vsc- card: none is his", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { deps } = seat({ cards: { [derived]: "t:Person", [ORG]: "t:Organization", [CONTACT]: "t:Person", [NOTE]: "t:NoteDocument" } });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f.cardId).toBe(derived);
    for (const id of [ORG, CONTACT, NOTE]) expect(await decide(id, f)).toBe(false);
    expect(await decide(derived, f)).toBe(true);
  });

  it("the same three while the finding is not in: undecided, never 'his'; when it failed: not his", async () => {
    for (const id of [ORG, CONTACT, NOTE]) {
      expect(await decide(id, undefined)).toBeUndefined();
      expect(await decide(id, null)).toBe(false);
    }
  });

  // D5b ruling (the apps never disagree): MyNet main's pointer step accepts an owner-shaped id whatever its type (two rig
  // checks), so GilbApp does too. Only the POINTER can make such a record his; with no pointer it stays ordinary (above).
  it("D5b: a pointer naming an organisation or a note with an mnb-profile id: MyNet accepts it, so GilbApp agrees", async () => {
    const derived = await selfCardIdForVault(ROOT);
    for (const [id, type] of [
      [ORG, "t:Organization"],
      [NOTE, "https://veda.example.test/base/t/NoteDocument"],
    ] as const) {
      const { deps } = seat({ pointer: `${ROOT}/e/${id}`, cards: { [derived]: "t:Person", [id]: type } });
      const f = await findOwnCard(deps, { vaultRoot: ROOT });
      expect(f).toMatchObject({ cardId: id, road: "pointer" });
      expect(await decide(id, f)).toBe(true);
    }
  });
});

describe("D4: hard identity", () => {
  it("(b) his derived vsc- card is his, with no read and whatever the finding", async () => {
    const derived = await selfCardIdForVault(ROOT);
    expect(await decide(derived, undefined)).toBe(true);
    expect(await decide(derived, null)).toBe(true);
    // the sibling root's derived id (one origin, /base and /vault) is the same seat
    expect(await decide(await selfCardIdForVault("https://t1kai.example/base"), undefined)).toBe(true);
  });

  it("(a) a real legacy profile card the pointer names (a Person): his, and the card MyNet shows; the vsc- card beside it is his too", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { deps } = seat({ pointer: `${ROOT}/e/${LEGACY}`, cards: { [LEGACY]: "t:Person", [derived]: "t:Person" } });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f).toMatchObject({ cardId: LEGACY, road: "pointer", otherOwnerCards: [`${ROOT}/e/${derived}`] });
    expect(await decide(LEGACY, f)).toBe(true);
    expect(await decide(derived, f)).toBe(true);
  });

  it("(a) the pointer names a non-vsc card served with a full Person address: accepted", async () => {
    const { deps } = seat({ pointer: `${ROOT}/e/${LEGACY}`, cards: { [LEGACY]: ["https://veda.example.test/base/t/Person"] } });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f.cardId).toBe(LEGACY);
    expect(await decide(LEGACY, f)).toBe(true);
  });

  it("D5b: a pointed legacy card with no served type is his, as MyNet main accepts it", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { deps } = seat({ pointer: `${ROOT}/e/${LEGACY}`, cards: { [LEGACY]: undefined, [derived]: "t:Person" } });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f.cardId).toBe(LEGACY);
    expect(await decide(LEGACY, f)).toBe(true);
  });

  it("an unpointed legacy card beside his vsc- card: an ordinary record", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const { deps } = seat({ cards: { [LEGACY]: "t:Person", [derived]: "t:Person" } });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f.cardId).toBe(derived);
    expect(await decide(LEGACY, f)).toBe(false);
  });

  it("D5 ruling: an unpointed legacy card with no vsc- card is an ordinary record too (no listing road)", async () => {
    const { deps, reads } = seat({ cards: { [LEGACY]: "t:Person", [ORG]: "t:Organization" } });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f).toMatchObject({ cardId: null, road: "none" });
    expect(reads).toEqual(["pointer", `card ${await selfCardIdForVault(ROOT)}`]);
    expect(await decide(LEGACY, f)).toBe(false);
  });
});

describe("the Person test", () => {
  it("isPersonCardType: a Person in any spelling; nothing else, and not an absent type", () => {
    for (const t of ["t:Person", "Person", "https://veda.example.test/base/t/Person", ["t:Agent", "t:Person"]]) expect(isPersonCardType(t)).toBe(true);
    for (const t of [undefined, null, "", "t:Organization", "t:NoteDocument", "t:PersonGroup", ["t:Organization"], 3]) expect(isPersonCardType(t)).toBe(false);
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
