// Ported from `gilb-stakeholders` `test/kinds.test.ts` at 0a261488: all 16 tests, with `kindTypeNames` (not in this unit) written out as the type names of the kinds.
// The stakeholder kinds come from the master's `a:playableBy` and is-a, never a list. Every expected value is a literal; the discriminating
// cases change the served documents and require the answer to move with them.
import { describe, it, expect } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveStakeholderKinds, type StakeholderKinds } from "./kinds";
import { fixtureMaster, RIG, t, a, CONTEXT, SERVED_PLAYERS } from "../test/support";

const kindTypeNames = (kinds: Pick<StakeholderKinds, "types">): string[] => kinds.types.map((k) => k.name);

const resolve = (m: ReturnType<typeof fixtureMaster>) =>
  resolveStakeholderKinds(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));

describe("resolveStakeholderKinds — the served master", () => {
  it("lists the seven served players, Passenger under Person, and the two types under Software System", async () => {
    const kinds = await resolve(fixtureMaster());
    expect(kinds.members).toEqual(SERVED_PLAYERS.map(t));
    expect(kindTypeNames(kinds).sort()).toEqual(
      [
        "AiAgent",
        "DataStore",
        "Organization",
        "Passenger",
        "PartyGroup",
        "PartyMemberOf",
        "Person",
        "SoftwareSystem",
        "SoftwareSystemGroup",
        "SoftwareSystemMemberOf",
      ].sort(),
    );
    expect(kinds.complete).toBe(true);
    expect(kinds.role).toBe(`${RIG}/base/t/Stakeholder`);
  });

  it("records where each subtype sits: parent, member, label from the listing", async () => {
    const kinds = await resolve(fixtureMaster());
    const ai = kinds.types.find((k) => k.name === "AiAgent")!;
    expect(ai.isMember).toBe(false);
    expect(ai.parents).toEqual([t("SoftwareSystem")]);
    expect(ai.members).toEqual([t("SoftwareSystem")]);
    expect(ai.label).toBe("AI Agent");
    const person = kinds.types.find((k) => k.name === "Person")!;
    expect(person.isMember).toBe(true);
    expect(person.members).toEqual([t("Person")]);
    // A member's label is not read by this step (no member dereference); it is null, not guessed.
    expect(person.label).toBeNull();
  });

  it("fetches from the rig origin, never from the identity host in the IRIs", async () => {
    const m = fixtureMaster();
    await resolve(m);
    expect(m.requested.length).toBeGreaterThan(0);
    expect(m.requested.every((u) => u.startsWith(RIG))).toBe(true);
    expect(m.requested).toContain(`${RIG}/base/t/SoftwareSystem/children`);
  });
});

describe("resolveStakeholderKinds — the answer moves with the master", () => {
  // 🔴 THE DISCRIMINATOR. A kind no app has heard of appears, and a kind the master stops
  // naming disappears, with no code change. A hardcoded kind list fails both halves.
  it("picks up a kind the master adds and drops one it removes", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", {
      "@context": CONTEXT,
      "@id": t("Stakeholder"),
      "a:playableBy": [{ "@id": t("Zorblax") }, { "@id": t("Organization") }],
    });
    m.children("Zorblax", [{ name: "ZorblaxJunior" }]);
    m.children("ZorblaxJunior", []);
    const names = kindTypeNames(await resolve(m));
    expect(names).toEqual(["Zorblax", "Organization", "ZorblaxJunior"]);
    expect(names).not.toContain("Person");
  });

  it("reads the predicate under the spelling ITS OWN TERM publishes, retired spellings included", async () => {
    const m = fixtureMaster();
    m.put("a/playableBy", {
      "@id": a("playableBy"),
      "a:predicateAttribute": "a:playableBy|a:fixturePlayedBy",
      "a:deprecatedNotation": "a:fixturePlayedBy",
    });
    // The role carries its players ONLY under the retired spelling.
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder"), "a:fixturePlayedBy": [{ "@id": t("Person") }] });
    const kinds = await resolve(m);
    expect(kinds.members).toEqual([t("Person")]);
    expect(kinds.predicates.playableBy.writeKey).toBe("a:playableBy");
  });

  it("reads the bare spelling a frame compacts to", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder"), playableBy: [{ "@id": t("PartyGroup") }] });
    expect((await resolve(m)).members).toEqual([t("PartyGroup")]);
  });

  it("expands a CURIE through the document's own context", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder"), "a:playableBy": ["t:Organization"] });
    expect((await resolve(m)).members).toEqual([t("Organization")]);
  });

  it("walks is-a to the bottom: a grandchild is a kind", async () => {
    const m = fixtureMaster();
    m.children("AiAgent", [{ name: "CodingAgent", label: "Coding Agent" }]);
    m.children("CodingAgent", []);
    const kinds = await resolve(m);
    const coding = kinds.types.find((k) => k.name === "CodingAgent")!;
    expect(coding.parents).toEqual([t("AiAgent")]);
    expect(coding.members).toEqual([t("SoftwareSystem")]);
  });

  it("a type reached from two members carries both", async () => {
    const m = fixtureMaster();
    m.children("PartyGroup", [{ name: "Shared" }]);
    m.children("SoftwareSystemGroup", [{ name: "Shared" }]);
    m.children("Shared", []);
    const shared = (await resolve(m)).types.filter((k) => k.name === "Shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]!.members.sort()).toEqual([t("PartyGroup"), t("SoftwareSystemGroup")].sort());
  });

  it("a cycle in the served graph ends, each type once", async () => {
    const m = fixtureMaster();
    m.children("DataStore", [{ name: "SoftwareSystem" }]);
    const names = kindTypeNames(await resolve(m));
    expect(names.filter((n) => n === "SoftwareSystem")).toHaveLength(1);
    expect(names).toHaveLength(10);
  });
});

describe("resolveStakeholderKinds — a failure is never an empty set", () => {
  it("an incomplete children listing makes the set a declared floor", async () => {
    const m = fixtureMaster();
    m.children("SoftwareSystem", [{ name: "AiAgent" }], false);
    const kinds = await resolve(m);
    expect(kinds.complete).toBe(false);
    expect(kinds.incompleteAt).toEqual([t("SoftwareSystem")]);
  });

  it("a children listing that does not say it is complete is not taken as complete", async () => {
    const m = fixtureMaster();
    m.docs.set(`${RIG}/base/t/SoftwareSystem/children`, {
      type: t("SoftwareSystem"),
      children: [{ term: t("AiAgent"), name: "AiAgent", label: "AI Agent" }],
    });
    const kinds = await resolve(m);
    expect(kinds.complete).toBe(false);
    expect(kinds.incompleteAt).toEqual([t("SoftwareSystem")]);
  });

  it("a children document with no children list is an error, not zero children", async () => {
    const m = fixtureMaster();
    m.docs.set(`${RIG}/base/t/SoftwareSystem/children`, { type: t("SoftwareSystem"), complete: true });
    await expect(resolve(m)).rejects.toThrow(/served no children list/);
  });

  it("an unreachable role is an error", async () => {
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Stakeholder`, 503);
    await expect(resolve(m)).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });

  it("a role that declares no players is an error, not zero kinds", async () => {
    const m = fixtureMaster();
    m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder"), "a:label": "Stakeholder" });
    await expect(resolve(m)).rejects.toThrow(/declares no players/);
  });

  it("an unreadable predicate term is an error", async () => {
    const m = fixtureMaster();
    m.put("a/playableBy", { "@id": a("playableBy") });
    await expect(resolve(m)).rejects.toThrow(/no a:predicateAttribute/);
  });
});
