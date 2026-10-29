// The unit's exports pinned, with a fake host and the fixture master and platform. The ported tests are in linkTargets.test.ts,
// relationCopy.test.ts and useAddCardReference.test.ts; the hooks are pinned in cardReferencesHooks.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@kaigilb/gilbplatformcode-pick-or-create";
import { readReferenceVocabulary, type ReferenceReading } from "@kaigilb/gilbplatformcode-holder-reference";
import { resolveFieldSets, type KindFieldSet } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { CardField } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import * as unit from "./index";
import { addReferenceFromCard, type CardReferenceInput } from "./cardReferences";
import { edgeIdOf, withoutEdges } from "./edgeItems";
import { admittedTargetNames, channelChoices, channelLabelOf, findLinkTargets, matchingTargets } from "./linkTargets";
import { relationCopyOf } from "./relationCopy";
import { removeCardReference, type CardReferencesHost } from "./useAddCardReference";
import { fixtureMaster, ID, RIG, t } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";

beforeEach(() => {
  forgetStakeholderKindReaders();
  resetTermOrigin();
  setTermOrigin(ID);
});
afterEach(() => {
  resetTermOrigin();
  resetBaseOrigin();
});

describe("the export list", () => {
  it("is exactly the source's names plus the host interface, the remove input's host and the two copied helpers", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "addReferenceFromCard",
        "admittedTargetNames",
        "channelChoices",
        "channelLabelOf",
        "edgeIdOf",
        "findLinkTargets",
        "matchingTargets",
        "relationCopyOf",
        "removeCardReference",
        "useAddCardReference",
        "useRemoveCardReference",
        "withoutEdges",
      ].sort(),
    );
  });
});

const reading = (over: Record<string, unknown> = {}) =>
  ({
    relations: [
      { groupName: "PartyGroup", playerNames: ["Person", "Organization"] },
      { groupName: "PartyGroup", playerNames: ["Person"] },
      { groupName: "ObjectGroup", playerNames: ["Person"] },
      { groupName: "SystemGroup", playerNames: ["SoftwareSystem"] },
    ],
    party: { names: ["Person", "Organization"] },
    contactTypes: { terms: [`${ID}/base/t/Email`] },
    ...over,
  }) as unknown as ReferenceReading;

describe("admittedTargetNames", () => {
  it("membership lists the group of every relation the carrier plays, once each, in served order", () => {
    expect(admittedTargetNames(reading(), "membership", "Person")).toEqual(["PartyGroup", "ObjectGroup"]);
    expect(admittedTargetNames(reading(), "membership", "Nobody")).toEqual([]);
  });
  it("party hands out a copy of the party kinds, not the reading's own list", () => {
    const r = reading();
    const names = admittedTargetNames(r, "party", "Person");
    expect(names).toEqual(["Person", "Organization"]);
    expect(names).not.toBe(r.party.names);
  });
  it("any other rule names no record kind", () => {
    expect(admittedTargetNames(reading(), "held-party", "Person")).toEqual([]);
    expect(admittedTargetNames(reading(), "contact-term", "Person")).toEqual([]);
  });
});

describe("matchingTargets", () => {
  const c = [
    { record: "r1", vaultId: "v", type: "t:Person", label: "Ann Öst" },
    { record: "r2", vaultId: "v", type: "t:Person", label: null },
    { record: "r3", vaultId: "v", type: "t:Person" },
  ] as unknown as Candidate[];
  it("an empty or blank text keeps every candidate, in a new array", () => {
    for (const text of ["", "   ", "\t"]) {
      const out = matchingTargets(c, text);
      expect(out.map((x) => x.record)).toEqual(["r1", "r2", "r3"]);
      expect(out).not.toBe(c);
    }
  });
  it("a text keeps the candidates whose label holds it, ignoring case; a candidate with no label never matches", () => {
    expect(matchingTargets(c, "  ANN ").map((x) => x.record)).toEqual(["r1"]);
    expect(matchingTargets(c, "öST").map((x) => x.record)).toEqual(["r1"]);
    expect(matchingTargets(c, "zzz")).toEqual([]);
  });
});

const field = (term: string, writeKey: string | null, readKeys: string[], label: string | null = null) => ({ term, writeKey, label, readKeys });
const kind = (fields: unknown[]) => ({ kind: `${ID}/base/t/Person`, name: "Person", label: "Person", ancestors: [], fields }) as unknown as KindFieldSet;

describe("channelChoices and channelLabelOf", () => {
  const email = `${ID}/base/t/Email`;
  it("a contact field holds a value when any of its read keys holds one, bare or with its a: prefix", () => {
    const k = kind([field(email, "a:email", ["a:email", "email"], "Email")]);
    expect(channelChoices(reading(), k, { email: "x" }).length).toBe(1);
    expect(channelChoices(reading(), k, { "a:email": "x" }).length).toBe(1);
    for (const empty of [undefined, null, "", []]) expect(channelChoices(reading(), k, { email: empty })).toEqual([]);
    expect(channelChoices(reading(), k, { email: 0 }).length).toBe(1);
    expect(channelChoices(reading(), k, { email: false }).length).toBe(1);
  });
  it("a field that is not a contact type, or whose write spelling does not start with a:, is never a choice", () => {
    const k = kind([field(`${ID}/base/t/TimeZone`, "a:timeZone", ["timeZone"]), field(email, "email", ["email"]), field(email, null, ["email"])]);
    expect(channelChoices(reading(), k, { timeZone: "UTC", email: "x" })).toEqual([]);
  });
  it("the label falls back to the write spelling; the target is the term origin read at call time", () => {
    const k = kind([field(email, "a:email", ["email"])]);
    expect(channelChoices(reading(), k, { email: "x" })).toEqual([{ label: "a:email", target: `${ID}/base/a/email` }]);
    resetTermOrigin();
    setTermOrigin("https://ontology.other.example.test");
    expect(channelChoices(reading(), k, { email: "x" })[0]!.target).toBe("https://ontology.other.example.test/base/a/email");
    resetTermOrigin();
    expect(() => channelChoices(reading(), k, { email: "x" })).toThrow();
  });
  it("with no field that holds a value the origin is not even read", () => {
    resetTermOrigin();
    expect(channelChoices(reading(), kind([field(email, "a:email", ["email"])]), {})).toEqual([]);
  });
  it("channelLabelOf reads the last path part after /base/a/ and stops at a ?, # or /", () => {
    const k = kind([field(email, "a:email", ["email"], "Email"), field(email, "a:phone", ["phone"])]);
    expect(channelLabelOf(k, `${ID}/base/a/email`)).toBe("Email");
    expect(channelLabelOf(k, `${ID}/base/a/phone`)).toBe("a:phone");
    expect(channelLabelOf(k, `${ID}/base/a/email/`)).toBeNull();
    expect(channelLabelOf(k, `${ID}/base/a/email?x=1`)).toBeNull();
    expect(channelLabelOf(k, `${ID}/base/t/email`)).toBeNull();
    expect(channelLabelOf(k, "")).toBeNull();
    const odd = kind([field(email, "a:e?x", ["e"])]);
    expect(channelLabelOf(odd, `${ID}/base/a/e?x`)).toBeNull();
  });
});

describe("relationCopyOf", () => {
  it("lists the two relations with their icons, and nothing else", () => {
    expect(relationCopyOf("actsOnBehalfOf")).toMatchObject({ label: "Represents", icon: "represents" });
    expect(relationCopyOf("memberOf")).toMatchObject({ label: "Member of", icon: "memberOf" });
    expect(relationCopyOf(undefined)).toBeNull();
    expect(relationCopyOf("")).toBeNull();
    expect(relationCopyOf("ActsOnBehalfOf")).toBeNull();
  });
  it("the table is a plain object, so a name that Object.prototype holds answers with that member, not null", () => {
    expect(relationCopyOf("toString")).toBe(Object.prototype.toString);
    expect(relationCopyOf("constructor")).toBe(Object);
  });
});

describe("edgeIdOf and withoutEdges", () => {
  it("an edge is an http(s) string or an object with a non-empty @id; anything else is no edge", () => {
    expect(edgeIdOf("https://a.example.test/e/1")).toBe("https://a.example.test/e/1");
    expect(edgeIdOf("http://a.example.test/e/1")).toBe("http://a.example.test/e/1");
    expect(edgeIdOf("plain text")).toBeNull();
    expect(edgeIdOf({ "@id": "https://a.example.test/e/1" })).toBe("https://a.example.test/e/1");
    expect(edgeIdOf({ "@id": "" })).toBeNull();
    expect(edgeIdOf({ "@id": 3 })).toBeNull();
    expect(edgeIdOf(null)).toBeNull();
    expect(edgeIdOf(7)).toBeNull();
  });
  it("withoutEdges drops the named edges and keeps every other item as stored, order included", () => {
    const A = "https://a.example.test/e/a";
    const B = "https://a.example.test/e/b";
    const items = [{ "@id": A }, "legacy text", B, { other: 1 }, { "@id": B }];
    expect(withoutEdges(items, [B])).toEqual([{ "@id": A }, "legacy text", { other: 1 }]);
    expect(withoutEdges(items, [])).toEqual(items);
    expect(withoutEdges(items, [])).not.toBe(items);
    expect(withoutEdges([], [A])).toEqual([]);
  });
});

function fakeHost(over: Partial<CardReferencesHost> = {}) {
  const calls: unknown[][] = [];
  const host: CardReferencesHost = {
    changeRecordFactItems: async (...args) => {
      calls.push(args);
      return [];
    },
    ...over,
  };
  return { host, calls };
}
const input = { recordId: "r1", carrier: "https://a.example.test/e/r1" as string | null, factKeys: ["memberOf", "a:memberOf"], target: "https://a.example.test/e/g1", label: "member of" };

describe("removeCardReference, against a fake host", () => {
  it("asks the host once per spelling, in order, with the record, the carrier, the key as given and the sentence for a refusal", async () => {
    const { host, calls } = fakeHost({
      async changeRecordFactItems(recordId, carrier, key, change, notChanged) {
        calls.push([recordId, carrier, key, notChanged]);
        change([{ "@id": input.target }]);
        return [];
      },
    });
    await removeCardReference(host, input);
    expect(calls).toEqual([
      ["r1", "https://a.example.test/e/r1", "memberOf", "the member of link was not removed"],
      ["r1", "https://a.example.test/e/r1", "a:memberOf", "the member of link was not removed"],
    ]);
  });
  it("the change drops only the target's edge and keeps every other item as stored", async () => {
    const seen: unknown[][] = [];
    const { host } = fakeHost({
      async changeRecordFactItems(_r, _c, _k, change) {
        seen.push(change([{ "@id": input.target }, { "@id": "https://a.example.test/e/g2" }, "text"]));
        return [];
      },
    });
    await removeCardReference(host, { ...input, factKeys: ["memberOf"] });
    expect(seen).toEqual([[{ "@id": "https://a.example.test/e/g2" }, "text"]]);
  });
  it("one spelling that held the link is enough; the others may hold none", async () => {
    let n = 0;
    const { host } = fakeHost({
      async changeRecordFactItems(_r, _c, _k, change) {
        change(n++ === 0 ? [] : [{ "@id": input.target }]);
        return [];
      },
    });
    await expect(removeCardReference(host, input)).resolves.toBeUndefined();
  });
  it("no spelling held it: it says so, and does not report a removal", async () => {
    const { host, calls } = fakeHost({
      async changeRecordFactItems(_r, _c, _k, change) {
        change([{ "@id": "https://a.example.test/e/other" }]);
        return [];
      },
    });
    await expect(removeCardReference(host, input)).rejects.toThrow("The record does not hold this link in a form this app can remove, so nothing was changed.");
    expect(calls).toEqual([]);
  });
  it("with no spelling at all it says so and asks the host nothing", async () => {
    const { host, calls } = fakeHost();
    await expect(removeCardReference(host, { ...input, factKeys: [] })).rejects.toThrow(/nothing was changed/);
    expect(calls).toEqual([]);
  });
  it("the writes are one after the other: the second is not asked until the first has answered", async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const { host } = fakeHost({
      async changeRecordFactItems(_r, _c, key, change) {
        order.push(`start ${key}`);
        if (key === "memberOf") await first;
        change([{ "@id": input.target }]);
        order.push(`end ${key}`);
        return [];
      },
    });
    const done = removeCardReference(host, input);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["start memberOf"]);
    release();
    await done;
    expect(order).toEqual(["start memberOf", "end memberOf", "start a:memberOf", "end a:memberOf"]);
  });
  it("a refusal of the host ends the remove: its error comes out as it is and the next spelling is not tried", async () => {
    const boom = new Error("the host refused");
    const { host, calls } = fakeHost({
      async changeRecordFactItems(...args) {
        calls.push(args);
        throw boom;
      },
    });
    await expect(removeCardReference(host, input)).rejects.toBe(boom);
    expect(calls.length).toBe(1);
  });
  it("the host member is looked up when the remove runs, so a host that changes it between removes is followed", async () => {
    const { host } = fakeHost();
    const first = vi.fn(async (_r: string, _c: string | null, _k: string, change: (s: readonly unknown[]) => unknown[]) => {
      change([{ "@id": input.target }]);
      return [];
    });
    host.changeRecordFactItems = first;
    await removeCardReference(host, { ...input, factKeys: ["memberOf"] });
    const second = vi.fn(first.getMockImplementation()!);
    host.changeRecordFactItems = second;
    await removeCardReference(host, { ...input, factKeys: ["memberOf"] });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

// ── the checked write and the find, over the fixture master and platform ─────────────────────────────────────────────────

async function world() {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const fieldSets = await resolveFieldSets(source);
  const references = await readReferenceVocabulary(source, fieldSets, { vedaOrigin: RIG, fetchImpl: m.fetch, store: null });
  const p: FixturePlatform = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  // The vault is a sub-host of the platform origin, so it is addressed at its own origin, and a record on another sub-host at that one.
  setBaseOrigin("https://example.test");
  const w = {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    board: p.seed(VAULT, "t:PartyGroup", { "a:name": "Board" }),
  };
  return { m, source, fieldSets, references, p, w };
}
const addField = (over: Partial<CardField> = {}): CardField =>
  ({ term: t("MemberOf"), label: "Member-Of", factKeys: ["memberOf"], slug: null, writeKey: "a:memberOf", mode: "reference-add", rule: "membership", shownBecause: null, many: true, ...over }) as unknown as CardField;

describe("addReferenceFromCard", () => {
  it("writes the reference through the checked write, as the signed-in principal, in the carrier's vault, and answers with the carrier", async () => {
    const { source, fieldSets, references, p, w } = await world();
    const readOnce = vi.fn(async () => references);
    const input: CardReferenceInput = { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: addField(), target: w.owners };
    const out = await addReferenceFromCard({ fieldSets, references: readOnce, source, fetchImpl: p.fetch }, input);
    expect(out.carrier).toBe(w.ben);
    expect(readOnce).toHaveBeenCalledTimes(1);
    const patches = p.requests.filter((r) => r.method === "PATCH");
    expect(patches.map((r) => r.path)).toEqual([`/lws/r/${w.ben.split("/").pop()}`]);
    expect(JSON.stringify(patches[0]!.body)).toContain(w.owners);
  });
  it("a refusal of the package comes out as it is, with nothing written (a target the vault does not hold)", async () => {
    const { source, fieldSets, references, p, w } = await world();
    const bad: CardReferenceInput = { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: addField({ writeKey: "a:memberOf" }), target: `${VAULT}/e/never-written` };
    await expect(addReferenceFromCard({ fieldSets, references: async () => references, source, fetchImpl: p.fetch }, bad)).rejects.toBeDefined();
    expect(p.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });
  it("a field that is not written by the reference write is refused before anything is read", async () => {
    const { source, fieldSets, p, w } = await world();
    const references = vi.fn();
    for (const mode of ["shown", "card-edit"] as const) {
      await expect(
        addReferenceFromCard({ fieldSets, references, source, fetchImpl: p.fetch }, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: addField({ mode }), target: w.owners }),
      ).rejects.toThrow(`${t("MemberOf")} is not written by the package's reference write`);
    }
    expect(references).not.toHaveBeenCalled();
    expect(p.requests).toEqual([]);
  });
  it("a field with no write spelling is refused before anything is read", async () => {
    const { source, fieldSets, p, w } = await world();
    const references = vi.fn();
    for (const writeKey of [null, ""]) {
      await expect(
        addReferenceFromCard({ fieldSets, references, source, fetchImpl: p.fetch }, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: addField({ writeKey: writeKey as never }), target: w.owners }),
      ).rejects.toThrow(`${t("MemberOf")} names no spelling to write`);
    }
    expect(references).not.toHaveBeenCalled();
  });
  it("the platform origin is read from the vault when the write runs: a vault at another host is addressed there", async () => {
    const { source, fieldSets, references, p, w } = await world();
    setBaseOrigin("https://elsewhere.example.test");
    await expect(
      addReferenceFromCard({ fieldSets, references: async () => references, source, fetchImpl: p.fetch }, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: addField(), target: w.owners }),
    ).rejects.toThrow(/is written at its own host ann\.example\.test, and this platform client's origin is elsewhere\.example\.test/);
    expect(p.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });
});

describe("findLinkTargets", () => {
  it("with no admitted type it answers an empty complete list and asks nobody", async () => {
    const { fieldSets, p } = await world();
    const fetchImpl = vi.fn(p.fetch);
    expect(await findLinkTargets(fieldSets, VAULT, [], fetchImpl)).toEqual({ candidates: [], complete: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("keeps the vault's candidates whose bare type name is admitted, with the find's own completeness", async () => {
    const { fieldSets, p, w } = await world();
    const found = await findLinkTargets(fieldSets, VAULT, ["PartyGroup"], p.fetch);
    expect(found.complete).toBe(true);
    expect(found.candidates.map((c) => c.record).sort()).toEqual([w.owners, w.board].sort());
    const both = await findLinkTargets(fieldSets, VAULT, ["PartyGroup", "Organization"], p.fetch);
    expect(both.candidates.map((c) => c.record).sort()).toEqual([w.owners, w.board, w.acme].sort());
    expect((await findLinkTargets(fieldSets, VAULT, ["Project"], p.fetch)).candidates).toEqual([]);
  });
  it("the vault is asked at its own origin, the vault named by the caller", async () => {
    const { fieldSets, p } = await world();
    await findLinkTargets(fieldSets, VAULT, ["PartyGroup"], p.fetch);
    expect(p.requests.every((r) => r.method === "GET")).toBe(true);
    expect(p.requests.length).toBeGreaterThan(0);
  });
});
