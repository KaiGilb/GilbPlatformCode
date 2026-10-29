// What the other test files leave unpinned: the export list, the constants, the reading's shape, `referenceFieldFor`, the write call's
// bounds, and the error classes.
import { beforeEach, describe, expect, it } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import * as unit from "./index";
import {
  ADD_REFERENCE_ATTEMPTS,
  CONTACT_POINT_TERM,
  ENDPOINT_TERM,
  PARTY_ROLE_TERM,
  PartialReferenceError,
  REFERENCE_RULES,
  ReferenceChangedElsewhereError,
  ReferenceRefusedError,
  ReferenceUnknownError,
  WriteCall,
  conditionFromEtag,
  openWriteCall,
  readReferenceVocabulary,
  referenceFieldFor,
  type ReferencePicker,
  type ReferenceReading,
} from "./holderReference";
import { PlacementUnknownError, rowPlacement } from "./rowVault";
import { fixtureMaster, RIG, t } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform } from "../test/fixturePlatform";

// The page's shared readers keep the fetch they were first made with; each test starts with none.
beforeEach(() => forgetStakeholderKindReaders());

async function readingOf() {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const fieldSets = await resolveFieldSets(source);
  const n0 = m.requested.length;
  const reading = await readReferenceVocabulary(source, fieldSets, { vedaOrigin: RIG, fetchImpl: m.fetch, store: null });
  return { m, source, fieldSets, reading, n0 };
}

describe("the unit's export list", () => {
  it("is exactly the symbols of holderReference.ts and rowVault.ts", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "ADD_REFERENCE_ATTEMPTS",
        "CONTACT_POINT_TERM",
        "ENDPOINT_TERM",
        "PARTY_ROLE_TERM",
        "PartialReferenceError",
        "PlacementUnknownError",
        "REFERENCE_RULES",
        "ReferenceChangedElsewhereError",
        "ReferenceRefusedError",
        "ReferenceUnknownError",
        "WriteCall",
        "addReference",
        "checkReference",
        "conditionFromEtag",
        "openWriteCall",
        "readReferenceVocabulary",
        "referenceFieldFor",
        "rowPlacement",
        "writeRoleRecord",
      ].sort(),
    );
  });
  it("the term addresses and the ruled check of each reference predicate are the master's addresses, not a list of kinds", () => {
    expect(PARTY_ROLE_TERM).toBe("t/PartyMemberOf");
    expect(CONTACT_POINT_TERM).toBe("t/ContactPoint");
    expect(ENDPOINT_TERM).toBe("a/endpoint");
    expect(REFERENCE_RULES).toEqual({
      "a/memberOf": "membership",
      "a/heldParty": "held-party",
      "a/actsOnBehalfOf": "party",
      "a/preferredChannel": "contact-term",
    });
    expect(ADD_REFERENCE_ATTEMPTS).toBe(3);
  });
});

describe("readReferenceVocabulary", () => {
  it("reads the role relations, the party kinds, the contact types and the four reference fields from the master", async () => {
    const { reading } = await readingOf();
    expect(reading.relations.map((r) => [r.name, r.writeType, r.groupName, r.complete])).toEqual([
      ["PartyMemberOf", "t:PartyMemberOf", "PartyGroup", true],
      ["SoftwareSystemMemberOf", "t:SoftwareSystemMemberOf", "SoftwareSystemGroup", true],
      ["ObjectMemberOf", "t:ObjectMemberOf", "ObjectGroup", true],
    ]);
    expect(reading.relations[0]!.playerNames).toEqual(["Person", "Organization", "PartyGroup", "AiAgent", "Passenger"]);
    expect(reading.relations[1]!.playerNames).toEqual(["SoftwareSystem", "AiAgent", "DataStore"]);
    expect(reading.party).toEqual({ names: ["Person", "Organization", "PartyGroup", "AiAgent", "Passenger"], roleRecordName: "PartyMemberOf", complete: true });
    expect(reading.contactTypes).toEqual({
      terms: ["ElectronicContactPoint", "PhysicalContactPoint", "Email", "Phone", "PostalAddress"].map(t),
      complete: true,
    });
    expect(reading.fields.map((f) => [f.rule, f.many, f.spelling.writeKey])).toEqual([
      ["membership", true, "a:memberOf"],
      ["held-party", false, "a:heldParty"],
      ["party", true, "a:actsOnBehalfOf"],
      ["contact-term", false, "a:preferredChannel"],
    ]);
    expect(reading.complete).toBe(true);
    expect(reading.incompleteAt).toEqual([]);
  });
  it("a children listing that is not complete makes the reading a floor and names where", async () => {
    const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
    m.children("PhysicalContactPoint", [{ name: "PostalAddress" }], false);
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    const reading = await readReferenceVocabulary(source, await resolveFieldSets(source), { vedaOrigin: RIG, fetchImpl: m.fetch, store: null });
    expect(reading.complete).toBe(false);
    expect(reading.contactTypes.complete).toBe(false);
    expect(reading.incompleteAt.length).toBeGreaterThan(0);
  });
  it.each([0, -1, Number.NaN, Infinity, 2 ** 31])("a bound of %s is refused with a RangeError before anything is read", async (bad) => {
    const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    const fieldSets = await resolveFieldSets(source);
    const n0 = m.requested.length;
    await expect(readReferenceVocabulary(source, fieldSets, { timeoutMs: bad })).rejects.toThrow(RangeError);
    await expect(readReferenceVocabulary(source, fieldSets, { readCapMs: bad })).rejects.toThrow(RangeError);
    expect(m.requested.length).toBe(n0);
  });
  it("a reading made with no readers and no origin keeps nothing: memory-only readers over the source", async () => {
    const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
    const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    const fieldSets = await resolveFieldSets(source);
    const a = await readReferenceVocabulary(source, fieldSets);
    const n1 = m.requested.length;
    await readReferenceVocabulary(source, fieldSets);
    expect(m.requested.length).toBeGreaterThan(n1);
    expect(a.complete).toBe(true);
  });
});

describe("referenceFieldFor", () => {
  it("finds the field by its term IRI, its write key or any read key, and gives null for anything else", async () => {
    const { reading } = await readingOf();
    const memberOf = reading.fields[0]!;
    expect(referenceFieldFor(reading, memberOf.term)).toBe(memberOf);
    expect(referenceFieldFor(reading, "a:memberOf")).toBe(memberOf);
    expect(referenceFieldFor(reading, "memberOf")).toBe(memberOf);
    expect(referenceFieldFor(reading, "a:preferredChannel")).toBe(reading.fields[3]);
    expect(referenceFieldFor(reading, "a:skill")).toBeNull();
    expect(referenceFieldFor({ fields: [] } as unknown as ReferenceReading, "a:memberOf")).toBeNull();
  });
});

describe("WriteCall and openWriteCall", () => {
  it("a call with no master has no live reads, and a bound that is not a finite number of ms above 0, at most 2,147,483,647, is refused", async () => {
    const { source } = await readingOf();
    expect(new WriteCall(undefined).live).toBeNull();
    expect(new WriteCall(source).live).not.toBeNull();
    expect(new WriteCall(source, { readCapMs: 5_000 }).live).not.toBeNull();
    for (const bad of [0, -1, Number.NaN, Infinity, 2 ** 31]) expect(() => new WriteCall(source, { readCapMs: bad })).toThrow(RangeError);
  });
  it("openWriteCall takes the picker's master and its cap, and refuses a bad cap", async () => {
    const { source, fieldSets } = await readingOf();
    const picker = (extra: Partial<ReferencePicker>): ReferencePicker => ({ platform: { origin: "https://ann.example.test", fetch: (async () => new Response("{}")) as never }, reading: { fieldSets }, ...extra });
    expect(openWriteCall(picker({})).live).toBeNull();
    expect(openWriteCall(picker({ master: source })).live).not.toBeNull();
    expect(openWriteCall(picker({ master: source, masterReadCapMs: 1_000 })).live).not.toBeNull();
    expect(() => openWriteCall(picker({ master: source, masterReadCapMs: 0 }))).toThrow(RangeError);
    expect(() => openWriteCall(picker({ master: source, masterReadCapMs: 2 ** 31 }))).toThrow(RangeError);
  });
});

describe("the read-back of a role record", () => {
  it("a stored record whose ends are not the checked records is reported written and unread, with the record named", async () => {
    const { m, source, fieldSets } = await readingOf();
    const vault = "https://ann.example.test/vault";
    const p = fixturePlatform({ origin: new URL(vault).origin });
    p.reach.add(vault);
    const ben = p.seed(vault, "t:Person", { "a:name": "Ben" });
    const owners = p.seed(vault, "t:PartyGroup", { "a:name": "Owners" });
    const other = p.seed(vault, "t:PartyGroup", { "a:name": "Board" });
    const real = p.fetch;
    const reading = await readReferenceVocabulary(source, fieldSets, { vedaOrigin: RIG, fetchImpl: m.fetch, store: null });
    const picker: ReferencePicker = {
      platform: {
        origin: p.origin,
        fetch: async (url, init) => {
          const res = await real(url, init);
          if ((init?.method ?? "GET") !== "GET" || !url.includes("/r/sh-")) return res;
          const doc = (await res.json()) as Record<string, unknown>;
          return new Response(JSON.stringify({ ...doc, "role:target": { "@id": other }, target: { "@id": other } }), { status: 200 });
        },
      },
      reading: { fieldSets, references: reading },
      master: source,
    };
    let err: unknown;
    try {
      await unit.writeRoleRecord(picker, { vaultId: vault, agent: "https://id.example.test/base/p/writer", player: ben, group: owners });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PartialReferenceError);
    expect((err as PartialReferenceError).written.startsWith(`${vault}/r/sh-`)).toBe(true);
    expect(String((err as PartialReferenceError).cause)).toContain("the stored ends are not the checked records");
  });
});

describe("the error classes", () => {
  it("a refusal carries its reason and its name", () => {
    const e = new ReferenceRefusedError("not-in-vault", "no");
    expect(e).toBeInstanceOf(Error);
    expect([e.name, e.reason, e.message]).toEqual(["ReferenceRefusedError", "not-in-vault", "no"]);
  });
  it("'not known yet' is its own class, never a refusal", () => {
    const e = new ReferenceUnknownError("later");
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ReferenceRefusedError);
    expect([e.name, e.message]).toEqual(["ReferenceUnknownError", "later"]);
  });
  it("a partial write names what was written and why the read-back failed", () => {
    const cause = new Error("boom");
    const e = new PartialReferenceError("written, unread", "https://ann.example.test/vault/r/x", cause);
    expect([e.name, e.written, e.cause, e.message]).toEqual(["PartialReferenceError", "https://ann.example.test/vault/r/x", cause, "written, unread"]);
  });
  it("'changed elsewhere' names the carrier and the attempts", () => {
    const e = new ReferenceChangedElsewhereError("https://ann.example.test/base/e/x", 3);
    expect([e.name, e.carrier, e.attempts]).toEqual(["ReferenceChangedElsewhereError", "https://ann.example.test/base/e/x", 3]);
    expect(e.message).toBe("https://ann.example.test/base/e/x changed elsewhere after each of 3 reads, so the reference was not written");
  });
  it("an unplaced row names the vault and the record", () => {
    const e = new PlacementUnknownError("https://ann.example.test/vault", "https://ann.example.test/base/e/y");
    expect([e.name, e.vaultId, e.record]).toEqual(["PlacementUnknownError", "https://ann.example.test/vault", "https://ann.example.test/base/e/y"]);
    expect(e.message).toContain("https://ann.example.test/vault");
    expect(e.message).toContain("not known yet");
  });
});

describe("rowPlacement and conditionFromEtag, pinned beside the unit's other exports", () => {
  it("a row with a vault that is the named one is in the vault; an empty vault is not known", () => {
    expect(rowPlacement({ vault: "v" }, "v")).toBe("in-vault");
    expect(rowPlacement({ vault: "w" }, "v")).toBe("other-vault");
    expect(rowPlacement({ vault: "" }, "v")).toBe("not-known-yet");
    expect(rowPlacement({ vault: "v", vaultAmbiguous: true }, "v")).toBe("more-than-one-vault");
    expect(rowPlacement({ vault: "v", vaultAmbiguous: false }, "v")).toBe("in-vault");
  });
  it("a strong tag is sent as it is; W/ before the platform's own tag form gives that tag; any other weak tag gives nothing", () => {
    const hex = "a".repeat(64);
    expect(conditionFromEtag(`"sha256:${hex}"`)).toBe(`"sha256:${hex}"`);
    expect(conditionFromEtag(`W/"sha256:${hex}"`)).toBe(`"sha256:${hex}"`);
    expect(conditionFromEtag(`W/"x"`)).toBeNull();
    expect(conditionFromEtag(`"x"`)).toBe(`"x"`);
    expect(conditionFromEtag("")).toBeNull();
  });
});
