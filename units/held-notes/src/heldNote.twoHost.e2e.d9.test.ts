// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/heldNote.twoHost.e2e.d9.test.ts` (9 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). The source verified an ES256 DPoP proof and the apex htu rewrite; those belong to the auth seam (`lws-session-bridge`), so the proof here is the fake seam's `htu=<origin><path>` and the check is that every credential was signed for the host the request names (`allAuthOk`).
// @vitest-environment node
// Agent.Scaling Delta9 F5 (GilbApp, Cycle214 1e) — the Delta8 B1 path pinned in ONE piece: held note →
// find → DPoP proof → host. Before this, `attributeFind.origin.d8` tested the real find with the signer
// mocked and `heldNote.twoStore.d8` mocked the find away, so nothing ran the whole path.
// Adopted from Agent.Scaling's Delta9 probe (`agscD9B1.probe.test.ts`; its log lines dropped).
// REAL: heldNote.ts, attributeFind.ts, dpop.ts (a real ES256 proof, real htuFor), config.ts at the
// production values of `build:prod`. MOCK: the record client (fakePlaceStore) and the vocabulary; the
// network is the two-host fake (`twoHostFindFake.ts`), which verifies every proof.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

// eslint-disable-next-line import/first
import * as fake from "../test/fakePlaceStore";
// eslint-disable-next-line import/first
import { server, resetServer, serverFetch, VAULT_A, VAULT_B } from "../test/twoHostFindFake";
// eslint-disable-next-line import/first
import { addHeldTopic, listHeldClaimsAbout, listHeldNotesAbout, notesForTopic, removeHeldNotes, saveHeldNote } from "./heldNote";
// eslint-disable-next-line import/first
import { __resetHeldNoteVocab } from "./heldNoteVocab";
// eslint-disable-next-line import/first
import { findByAttribute } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setUp, tearDown } from "../test/support";

const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const PHOTO = "https://veda.platform.example.test/base/t/Photography";
const SAIL = "https://veda.platform.example.test/base/t/Sailing";
let tomB: string; // Tom's card, vault B
let selfB: string;
let tomA: string;
let selfA: string;

const finds = () => server.log.filter((r) => r.path === "/base/find-by-attribute");
const summary = () => {
  const f = finds();
  return {
    finds: f.length,
    hosts: [...new Set(f.map((r) => r.host))],
    apexFinds: f.filter((r) => r.host === "platform.example.test").length,
    htus: [...new Set(f.map((r) => r.htu))],
    allHtuMatchHost: f.every((r) => r.htu === r.htuExpected),
    allAuthOk: f.every((r) => r.status !== 401),
    statuses: [...new Set(f.map((r) => r.status))],
  };
};
const heldClaims = (vault: string) => [...fake.store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim" && (e.vault ?? fake.VAULT) === vault);

afterEach(tearDown);
beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  resetServer();
  vi.stubGlobal("fetch", vi.fn(serverFetch));
  tomB = `${VAULT_B}/e/${fake.seed("t:Person", { "a:givenName": "Tom" })}`;
  selfB = `${VAULT_B}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  tomA = `${VAULT_A}/e/${fake.seed("t:Person", { "a:givenName": "Tom A" }, undefined, VAULT_A)}`;
  selfA = `${VAULT_A}/e/${fake.seed("t:Person", { "a:name": "Old vault" }, undefined, VAULT_A)}`;
});

describe("Delta9 F5 (Delta8 B1 end to end) · two hosts, two stores; production config", () => {
  it("the apex is the one the host set, and the vaults are its subdomains", () => {
    expect(baseOrigin()).toBe("https://platform.example.test");
  });

  it("B1-0 control: the fake discriminates — asked at the apex, vault B's claim is not found; asked at B, it is", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": selfB }, "a:heldParty": { "@id": tomB }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ICU" });
    const apex = await findByAttribute("a:heldParty", { "@id": tomB }, { limit: 200 });
    const atB = await findByAttribute("a:heldParty", { "@id": tomB }, { limit: 200 }, "https://hytta.platform.example.test");
    expect(apex.count).toBe(0);
    expect(atB.count).toBe(1);
  });

  it("B1-1 a note and an interest held in vault B: shown, every find asked at B, every proof's htu is B's, none at the apex", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": selfB }, "a:heldParty": { "@id": tomB }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ICU nights" });
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": selfB }, "a:heldParty": { "@id": tomB }, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "night shots" });
    const skills = await listHeldNotesAbout("skill", VAULT_B, tomB);
    const interests = await listHeldNotesAbout("interest", VAULT_B, tomB);
    const s = summary();
    expect(skills.map((n) => n.note)).toEqual(["ICU nights"]);
    expect(interests.map((n) => n.note)).toEqual(["night shots"]);
    expect(s.apexFinds).toBe(0);
    expect(s.hosts).toEqual(["hytta.platform.example.test"]);
    expect(s.htus).toEqual(["https://hytta.platform.example.test/base/find-by-attribute"]);
    expect(s.allAuthOk).toBe(true);
    expect(s.statuses).toEqual([200]);
  });

  it("B1-2 save twice, add, reopen, remove — all on B: one claim, last text, found again, removed", async () => {
    await saveHeldNote({ kind: "skill", vaultId: VAULT_B, subject: tomB, topic: NURSING, text: "first", existing: [], stater: selfB });
    const ex1 = notesForTopic(await listHeldNotesAbout("skill", VAULT_B, tomB), NURSING);
    await saveHeldNote({ kind: "skill", vaultId: VAULT_B, subject: tomB, topic: NURSING, text: "second", existing: ex1, stater: selfB });
    await addHeldTopic({ kind: "interest", vaultId: VAULT_B, subject: tomB, topic: SAIL, existing: [], stater: selfB });
    const reopenSkills = await listHeldNotesAbout("skill", VAULT_B, tomB);
    const reopenInterests = await listHeldNotesAbout("interest", VAULT_B, tomB);
    const claimsAfterWrites = heldClaims(VAULT_B).length;
    await removeHeldNotes(VAULT_B, notesForTopic(reopenInterests, SAIL), "interest");
    const afterRemove = await listHeldNotesAbout("interest", VAULT_B, tomB);
    const s = summary();
    expect(claimsAfterWrites).toBe(2);
    expect(reopenSkills.map((n) => n.note)).toEqual(["second"]);
    expect(reopenInterests.map((n) => n.topic)).toEqual([SAIL]);
    expect(afterRemove).toHaveLength(0);
    expect(s.apexFinds).toBe(0);
    expect(s.allHtuMatchHost && s.allAuthOk).toBe(true);
  });

  it("B1-3 a vault on the FIRST store (olda.platform.example.test, db base) is asked at ITS host and read too", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": selfA }, "a:heldParty": { "@id": tomA }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "store A" }, undefined, VAULT_A);
    const got = await listHeldNotesAbout("skill", VAULT_A, tomA);
    const s = summary();
    expect(got.map((n) => n.note)).toEqual(["store A"]);
    expect(s.hosts).toEqual(["olda.platform.example.test"]);
    expect(s.htus).toEqual(["https://olda.platform.example.test/base/find-by-attribute"]);
  });

  it("B1-4 an older Base refuses paging (400): the retry stays on B, proof re-signed for B", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": selfB }, "a:heldParty": { "@id": tomB }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "x" });
    server.refusePaging = true;
    const got = await listHeldNotesAbout("skill", VAULT_B, tomB);
    const s = summary();
    expect(got).toHaveLength(1);
    expect(s.apexFinds).toBe(0);
    expect(s.statuses.sort()).toEqual([200, 400]);
  });

  it("B1-5 the same claim in vault B is NOT found by a card in vault A (the inVault filter, cross-store)", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": selfB }, "a:heldParty": { "@id": tomB }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "B only" });
    const fromA = await listHeldNotesAbout("skill", VAULT_A, tomB);
    expect(fromA).toHaveLength(0);
  });
});

describe("Delta8 F6 end to end · a claim gone between the find and its read", () => {
  function seedThree() {
    const by = { "a:statedBy": { "@id": selfB }, "a:heldParty": { "@id": tomB } };
    const a = fake.seed("t:HeldPartyFieldClaim", { ...by, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "kept 1" });
    const b = fake.seed("t:HeldPartyFieldClaim", { ...by, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "deleted meanwhile" });
    const c = fake.seed("t:HeldPartyFieldClaim", { ...by, "a:topicInterest": { "@id": SAIL }, "a:topicInterestNote": "kept 2" });
    return { a, b, c };
  }
  it("F6-1 404 on one claim: the other two are shown, no error", async () => {
    const { b } = seedThree();
    server.afterFind = () => { fake.store.delete(b); };
    let error: string | null = null;
    let got: string[] = [];
    try {
      got = (await listHeldClaimsAbout(VAULT_B, tomB)).map((d) => d.id);
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error).toBeNull();
    expect(got).toHaveLength(2);
  });
  it("F6-2 a 503 on one claim still fails the whole read (never shown as none)", async () => {
    const { b } = seedThree();
    const orig = fake.readRecord.getMockImplementation()!;
    fake.readRecord.mockImplementation(async (id: string, at: string | null) => {
      if (id === b) throw Object.assign(new Error("503 Service Unavailable"), { status: 503 });
      return orig(id, at);
    });
    let error: string | null = null;
    try {
      await listHeldClaimsAbout(VAULT_B, tomB);
    } catch (e) {
      error = (e as Error).message;
    }
    fake.readRecord.mockImplementation(orig);
    expect(error).not.toBeNull();
  });
});
