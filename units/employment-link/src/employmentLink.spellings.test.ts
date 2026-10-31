// New. The keys are the spellings the caller was handed, never typed here, and the address rule is exact.
import { describe, expect, it } from "vitest";
import { employmentLinkFacts } from "./index";

const ORG = "https://v.example.test/base/e/org1";
const PERSON = "https://v.example.test/base/e/person1";

describe("employmentLinkFacts, the spellings and the address rule", () => {
  it("uses the spellings it was given, whatever they are", () => {
    const facts = employmentLinkFacts({ employer: "a:worksAt", employee: "a:hasStaff" }, { employer: ORG, employee: PERSON });
    expect(Object.keys(facts).sort()).toEqual(["a:hasStaff", "a:worksAt"]);
    expect(facts["a:worksAt"]).toEqual({ "@id": ORG });
  });
  it("refuses an address with a trailing slash or a space inside, and one on no host", () => {
    const V = { employer: "a:employer", employee: "a:employee" };
    expect(() => employmentLinkFacts(V, { employer: `${ORG}/`, employee: PERSON })).toThrow(/address/);
    expect(() => employmentLinkFacts(V, { employer: "https://v.example.test/base/e/or g", employee: PERSON })).toThrow(/address/);
    expect(() => employmentLinkFacts(V, { employer: "/base/e/org1", employee: PERSON })).toThrow(/address/);
  });
  it("trims the two addresses it is given", () => {
    const V = { employer: "a:employer", employee: "a:employee" };
    expect(employmentLinkFacts(V, { employer: ` ${ORG} `, employee: ` ${PERSON}` })["a:employer"]).toEqual({ "@id": ORG });
  });
});
