// The New-record picker starts from the master's shortcuts (`a:createShortcut`), never from a list in the app: the long list is reduced to
// Organization, Person, "System", with "More types…" keeping every other type reachable.
import { beforeEach, describe, expect, it } from "vitest";
import { readStakeholderCardVocabulary, type StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
// The master is the package's own fixture master, imported and not mirrored.
import { fixtureMaster, RIG, CONTEXT, ID, t, a } from "../test/support";

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin(ID);
});
import { moreTypeOptions, orderByShortcuts, shortcutOfType, startShortcuts, shortcutDisplay } from "./stakeholderStart";

const OPTIONS = ["Person", "Organization", "SoftwareSystem", "AiAgent", "DataStore", "PartyGroup"].map((n) => ({ typeName: n }));
const vocab = (over: Partial<StakeholderCardVocabulary> = {}) =>
  ({
    kindNames: [],
    kindsComplete: true,
    fieldSets: null,
    fieldSetsRefusal: null,
    createShortcuts: [
      { term: t("Organization"), name: "Organization", label: "Organization" },
      { term: t("Person"), name: "Person", label: "Person" },
      { term: t("SoftwareSystem"), name: "SoftwareSystem", label: "Software System" },
    ],
    shortcutSteps: { SoftwareSystem: [{ name: "AiAgent", label: "AI Agent", depth: 1 }, { name: "DataStore", label: "Data Store", depth: 1 }] },
    ...over,
  }) as StakeholderCardVocabulary;

describe("startShortcuts", () => {
  it("is the master's three, in the master's order, with Software System shown as 'System'", () => {
    expect(startShortcuts(vocab(), OPTIONS).map((s) => [s.name, s.display])).toEqual([
      ["Organization", "Organization"],
      ["Person", "Person"],
      ["SoftwareSystem", "System"],
    ]);
  });
  it("the System step offers the master's own sub-types of Software System that can be created", () => {
    const sys = startShortcuts(vocab(), OPTIONS).find((s) => s.name === "SoftwareSystem")!;
    expect(sys.steps.map((s) => [s.name, s.label])).toEqual([["AiAgent", "AI Agent"], ["DataStore", "Data Store"]]);
    // a sub-type that cannot be created here is not offered
    const only = startShortcuts(vocab(), OPTIONS.filter((o) => o.typeName !== "DataStore")).find((s) => s.name === "SoftwareSystem")!;
    expect(only.steps.map((s) => s.name)).toEqual(["AiAgent"]);
  });
  it("a shortcut that cannot be created here is dropped (nothing is offered that cannot be made)", () => {
    expect(startShortcuts(vocab(), OPTIONS.filter((o) => o.typeName !== "Person")).map((s) => s.name)).toEqual(["Organization", "SoftwareSystem"]);
  });
  it("no shortcuts known (an old reading, or a master without the term): none, and the picker lists everything alike", () => {
    expect(startShortcuts(vocab({ createShortcuts: [] }), OPTIONS)).toEqual([]);
    expect(startShortcuts(vocab({ createShortcuts: undefined }), OPTIONS)).toEqual([]);
    expect(startShortcuts(undefined, OPTIONS)).toEqual([]);
  });
  it("a label the master did not give falls back to the type's name, a word it did give is kept", () => {
    expect(shortcutDisplay("Organization", null)).toBe("Organization");
    expect(shortcutDisplay("AiAgent", "AI Agent")).toBe("AI Agent");
    expect(shortcutDisplay("SoftwareSystem", "Software System")).toBe("System");
  });
});

describe("shortcutOfType — which shortcut a chosen type belongs to", () => {
  const sc = startShortcuts(vocab(), OPTIONS);
  it("a shortcut's own type, and a sub-type under it, both belong to it", () => {
    expect(shortcutOfType(sc, "Person")?.name).toBe("Person");
    expect(shortcutOfType(sc, "SoftwareSystem")?.name).toBe("SoftwareSystem");
    expect(shortcutOfType(sc, "AiAgent")?.name).toBe("SoftwareSystem");
  });
  it("a type reached through 'More types…' belongs to none", () => {
    expect(shortcutOfType(sc, "PartyGroup")).toBeNull();
  });
});

describe("ordering and 'More types…'", () => {
  const sc = startShortcuts(vocab(), OPTIONS);
  const opts = ["AiAgent", "DataStore", "Organization", "PartyGroup", "Person", "SoftwareSystem"].map((n) => ({ typeName: n }));
  it("puts the master's shortcuts first, in its order, and drops nothing", () => {
    expect(orderByShortcuts(opts, sc).map((o) => o.typeName)).toEqual(["Organization", "Person", "SoftwareSystem", "AiAgent", "DataStore", "PartyGroup"]);
  });
  it("with no shortcuts the order is unchanged", () => {
    expect(orderByShortcuts(opts, []).map((o) => o.typeName)).toEqual(opts.map((o) => o.typeName));
  });
  it("'More types…' lists every type that is not a shortcut, so all of them stay reachable and none is listed twice", () => {
    expect(moreTypeOptions(opts, sc).map((o) => o.typeName)).toEqual(["AiAgent", "DataStore", "PartyGroup"]);
    expect(moreTypeOptions(opts, []).length).toBe(6);
  });
});

describe("the vocabulary read carries the master's shortcuts", () => {
  it("reads createShortcuts and the types below each, from the master (the package's answer)", async () => {
    const m = fixtureMaster();
    m.put("a/createShortcut", { "@context": CONTEXT, "@id": a("createShortcut"), "a:predicateAttribute": "a:createShortcut" });
    const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
    m.put("t/Stakeholder", { ...role, "a:createShortcut": ["Organization", "Person", "SoftwareSystem"].map((n) => ({ "@id": t(n) })) });
    const v = await readStakeholderCardVocabulary(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    expect(v.createShortcuts!.map((s) => [s.name, s.label])).toEqual([["Organization", "Organization"], ["Person", "Person"], ["SoftwareSystem", "Software System"]]);
    expect(v.shortcutSteps!["SoftwareSystem"]!.map((d) => d.name)).toEqual(["AiAgent", "DataStore"]);
    expect(v.shortcutSteps!["Person"]!.map((d) => d.name)).toEqual(["Passenger"]);
  });
});
