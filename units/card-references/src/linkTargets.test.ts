// What a link picker offers is the package's rule, read from its reading.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReferenceReading } from "@kaigilb/gilbplatformcode-holder-reference";
import type { KindFieldSet } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { admittedTargetNames, channelChoices, channelLabelOf, matchingTargets } from "./linkTargets";

const V = "https://ontology.example.test";

// The app read its ontology origin as a constant; the unit reads the setting at call time.
beforeEach(() => setTermOrigin(V));
afterEach(() => resetTermOrigin());

const reading = {
  relations: [
    { term: `${V}/base/t/PartyMemberOf`, name: "PartyMemberOf", writeType: "t:PartyMemberOf", groupType: `${V}/base/t/PartyGroup`, groupName: "PartyGroup", playerNames: ["Person", "Organization"], complete: true },
    { term: `${V}/base/t/SoftwareSystemMemberOf`, name: "SoftwareSystemMemberOf", writeType: null, groupType: `${V}/base/t/SoftwareSystemGroup`, groupName: "SoftwareSystemGroup", playerNames: ["SoftwareSystem"], complete: true },
    { term: `${V}/base/t/ObjectMemberOf`, name: "ObjectMemberOf", writeType: null, groupType: `${V}/base/t/ObjectGroup`, groupName: "ObjectGroup", playerNames: ["Person"], complete: true },
  ],
  party: { names: ["Person", "Organization", "PartyGroup"], roleRecordName: "PartyMemberOf", complete: true },
  contactTypes: { terms: [`${V}/base/t/Email`, `${V}/base/t/Phone`], complete: true },
  fields: [],
  complete: true,
  incompleteAt: [],
} as unknown as ReferenceReading;

const field = (term: string, writeKey: string, label: string | null) => ({ term, writeKey, label, readKeys: [writeKey, writeKey.slice(2)] });
const person = {
  kind: `${V}/base/t/Person`,
  name: "Person",
  label: "Person",
  ancestors: [],
  fields: [field(`${V}/base/t/Email`, "a:email", "Email"), field(`${V}/base/t/Phone`, "a:phone", "Phone"), field(`${V}/base/t/TimeZone`, "a:timeZone", "Time zone")],
} as unknown as KindFieldSet;

describe("the link picker's targets come from the package's reading, never a typed kind", () => {
  it("membership: the groups of the relations the carrier's kind plays", () => {
    expect(admittedTargetNames(reading, "membership", "Person")).toEqual(["PartyGroup", "ObjectGroup"]);
    expect(admittedTargetNames(reading, "membership", "SoftwareSystem")).toEqual(["SoftwareSystemGroup"]);
  });
  it("party: the party kinds; held-party and contact-term pick no record", () => {
    expect(admittedTargetNames(reading, "party", "Person")).toEqual(["Person", "Organization", "PartyGroup"]);
    expect(admittedTargetNames(reading, "held-party", "Person")).toEqual([]);
    expect(admittedTargetNames(reading, "contact-term", "Person")).toEqual([]);
  });
  it("typing narrows the candidates by name, ignoring case", () => {
    const c = [
      { record: "r1", vaultId: "v", type: "t:PartyGroup", label: "Owners" },
      { record: "r2", vaultId: "v", type: "t:PartyGroup", label: "Board" },
      { record: "r3", vaultId: "v", type: "t:PartyGroup", label: null },
    ];
    expect(matchingTargets(c, "ow").map((x) => x.record)).toEqual(["r1"]);
    expect(matchingTargets(c, " ").map((x) => x.record)).toEqual(["r1", "r2", "r3"]);
  });
  it("preferred channel: the carrier's contact fields that hold a value, as attribute addresses, named back by label", () => {
    const choices = channelChoices(reading, person, { email: "a@b.c", phone: "", timeZone: "UTC" });
    expect(choices).toEqual([{ label: "Email", target: `${V}/base/a/email` }]);
    expect(channelLabelOf(person, `${V}/base/a/email`)).toBe("Email");
    expect(channelLabelOf(person, `${V}/base/a/nothing`)).toBeNull();
  });
});
