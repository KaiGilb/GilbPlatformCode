// Ported from GilbApp `employmentLink.s8org.test.ts`, 7 cases, unchanged. An employment that names an organization RECORD carries `a:employer` and `a:employee` together, beside `a:org`. Both or neither.
import { describe, expect, it } from "vitest";
import { employmentLinkFacts } from "./employmentLink";

const V = { employer: "a:employer", employee: "a:employee" };
const ORG = "https://v.gilb.com/base/e/org1";
const PERSON = "https://v.gilb.com/base/e/person1";

describe("employmentLinkFacts", () => {
  it("writes both links as references under the spellings the master named", () => {
    expect(employmentLinkFacts(V, { employer: ORG, employee: PERSON })).toEqual({
      "a:employer": { "@id": ORG },
      "a:employee": { "@id": PERSON },
    });
  });
  it("writes nothing when neither is given (a text-only employment stays as it is)", () => {
    expect(employmentLinkFacts(V, {})).toEqual({});
    expect(employmentLinkFacts(V, { employer: null, employee: null })).toEqual({});
  });
  it("accepts the spelling a vault record really has (/vault/e/, with a port on a local rig)", () => {
    // Found on the real rig: the app's own record address is `<host>/vault/e/<id>`, and the first form of the rule refused it.
    const o = "https://s8ocga.localhost:8882/vault/e/butikk-bergen-06gm5exxnhrm76tyfab9sd74q4";
    const p = "https://s8ocga.localhost:8882/vault/e/fay-06gm5gf7hxsr38bzx3z14jrr68";
    expect(employmentLinkFacts(V, { employer: o, employee: p })).toEqual({ "a:employer": { "@id": o }, "a:employee": { "@id": p } });
  });
  it("refuses one without the other", () => {
    expect(() => employmentLinkFacts(V, { employer: ORG })).toThrow(/together/);
    expect(() => employmentLinkFacts(V, { employee: PERSON })).toThrow(/together/);
  });
  it("refuses a link that is not an entity address", () => {
    expect(() => employmentLinkFacts(V, { employer: "Butikk AS", employee: PERSON })).toThrow(/address/);
    expect(() => employmentLinkFacts(V, { employer: ORG, employee: "/lws/r/x" })).toThrow(/address/);
  });
  it("refuses an employer that is the employee (a person is not an organization)", () => {
    expect(() => employmentLinkFacts(V, { employer: ORG, employee: ORG })).toThrow(/same/);
  });
  it("never writes a find key or a rung", () => {
    const facts = employmentLinkFacts(V, { employer: ORG, employee: PERSON });
    expect(Object.keys(facts).sort()).toEqual(["a:employee", "a:employer"]);
  });
});
