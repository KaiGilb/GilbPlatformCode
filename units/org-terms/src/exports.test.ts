import { describe, expect, it } from "vitest";
import * as unit from "./index";
import type { EmploymentLinkVocab } from "./index";

describe("the unit's exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "EmploymentLinkVocabUnavailableError",
      "OrgTermsUnavailableError",
      "__resetEmploymentLinkVocab",
      "__resetOrgTerms",
      "refsOf",
      "resolveEmploymentLinkVocab",
      "resolveOrgTerms",
      "servedValue",
    ]);
  });
  it("hold the type EmploymentLinkVocab (employer and employee, both strings)", () => {
    const v: EmploymentLinkVocab = { employer: "a:employer", employee: "a:employee" };
    expect(Object.keys(v)).toEqual(["employer", "employee"]);
  });
});
