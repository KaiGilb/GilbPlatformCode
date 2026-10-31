// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/heldNote.twoStore.d8.test.ts` (4 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). The apex is `baseOrigin()` as set by test/support.ts.
// Agent.Scaling Delta8 B1 (GilbApp) — the held-note read must ask the VAULT'S OWN HOST, never the apex.
// Production: `platform.example.test/base/*` reaches the `:8787` process (db `base`); every vault minted since
// 2026-08-20 lives in `base_pods` behind its own host. The find-by-attribute route has no crossing, so a
// find asked at the apex answers "none" for those vaults, with no error: notes vanish on reopen, each save
// makes a new claim, a removal finds nothing (AgentScaling-C214-1e-Interests-Delta8 §3 B1).
// MOCK: `fakePlaceStore` in two-store mode (`topology`): a find answers only from the store of the host it
// was asked at, as GilbPlatform's route does (Rule_Code_gilb-store-topology rule 3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fake from "../test/fakePlaceStore";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

// eslint-disable-next-line import/first
import { addHeldTopic, heldNotesAbout, listHeldNotesAbout, notesForTopic, saveHeldNote } from "./heldNote";
// eslint-disable-next-line import/first
import { __resetHeldNoteVocab } from "./heldNoteVocab";
// eslint-disable-next-line import/first
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setUp, tearDown } from "../test/support";


/** Host B: a vault on the second store (`base_pods`). The apex is `baseOrigin()` (`https://platform.example.test` in prod). */
const VAULT_B = fake.VAULT; // https://hytta.platform.example.test/base
const HOST_B = "hytta.platform.example.test";
let APEX_HOST = "";
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const PHOTO = "https://veda.platform.example.test/base/t/Photography";
const uriOf = (id: string) => `${VAULT_B}/e/${id}`;
let tom: string;
let SELF: string;

afterEach(tearDown);
beforeEach(() => {
  setUp();
  APEX_HOST = new URL(baseOrigin()).host;
  fake.resetStore();
  __resetHeldNoteVocab();
  fake.topology.storeOfHost = { [APEX_HOST]: "base", [HOST_B]: "base_pods" };
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  SELF = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
});

const hostsAsked = () => fake.findByAttribute.mock.calls.map((c) => new URL((c[3] as string | undefined) ?? baseOrigin()).host);
const notesOf = async (kind: "skill" | "interest") => heldNotesAbout(await listHeldNotesAbout(kind, VAULT_B, uriOf(tom)), uriOf(tom));

describe("Delta8 B1: a vault on host B is read on B, ⛔ never on the apex", () => {
  it("control: the fake really is two stores — asked at the apex, the find does not see vault B's claims", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": SELF }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "x" });
    expect((await fake.findByAttribute("a:heldParty", { "@id": uriOf(tom) })).count).toBe(0);
    expect((await fake.findByAttribute("a:heldParty", { "@id": uriOf(tom) }, {}, `https://${HOST_B}`)).count).toBe(1);
  });

  it("the note held in vault B shows on the card, and every find was asked at B", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": SELF }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ICU nights" });
    fake.findByAttribute.mockClear();
    expect((await notesOf("skill")).map((n) => n.note)).toEqual(["ICU nights"]);
    expect(hostsAsked().length).toBeGreaterThan(0);
    expect(new Set(hostsAsked())).toEqual(new Set([HOST_B]));
    expect(hostsAsked()).not.toContain(APEX_HOST);
  });

  it("a second save of the note on B amends the ONE claim (⛔ no duplicate from an empty read)", async () => {
    await saveHeldNote({ kind: "skill", vaultId: VAULT_B, subject: uriOf(tom), topic: NURSING, text: "first", existing: [], stater: SELF });
    const existing = notesForTopic(await notesOf("skill"), NURSING);
    expect(existing).toHaveLength(1);
    await saveHeldNote({ kind: "skill", vaultId: VAULT_B, subject: uriOf(tom), topic: NURSING, text: "second", existing, stater: SELF });
    const claims = [...fake.store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim");
    expect(claims).toHaveLength(1);
    expect(claims[0]!.facts["a:skillDepthNote"]).toBe("second");
  });

  it("an interest added on B is found again on B (reopen shows it)", async () => {
    await addHeldTopic({ kind: "interest", vaultId: VAULT_B, subject: uriOf(tom), topic: PHOTO, existing: [], stater: SELF });
    fake.findByAttribute.mockClear();
    expect((await notesOf("interest")).map((n) => n.topic)).toEqual([PHOTO]);
    expect(hostsAsked()).not.toContain(APEX_HOST);
  });
});
