// 0.1.0 exported refsOf, servedValue and the type EmploymentLinkVocab from this unit; from 0.2.0 they are org-terms's, re-exported.
// The five tests of 0.1.0's servedValue.test.ts moved with the code to org-terms.
import { describe, expect, it } from "vitest";
import * as terms from "@kaigilb/gilbplatformcode-org-terms";
import * as unit from "./index";
import type { EmploymentLinkVocab, OrgEmployeesHost } from "./index";

describe("what this unit re-exports from org-terms", () => {
  it("refsOf and servedValue are the very functions of org-terms", () => {
    expect(unit.refsOf).toBe(terms.refsOf);
    expect(unit.servedValue).toBe(terms.servedValue);
  });
  it("refsOf still reads a string, an {@id} node and an array of either", () => {
    expect(unit.refsOf([" a ", { "@id": " b " }, "", 5])).toEqual(["a", "b"]);
  });
  it("servedValue still reads the bare key, else the a:-prefixed one", () => {
    expect(unit.servedValue({ "a:x": 2 }, "x")).toBe(2);
    expect(unit.servedValue({ x: 1, "a:x": 2 }, "x")).toBe(1);
  });
  it("EmploymentLinkVocab is still a type of this entry point", () => {
    const v: EmploymentLinkVocab = { employer: "a:employer", employee: "a:employee" };
    expect(v.employer).toBe("a:employer");
  });
  it("the host type no longer has a resolveEmploymentLinkVocab member (the typecheck proves it)", () => {
    const h: OrgEmployeesHost = {
      readResources: async () => [],
      photoReadKeys: async () => [],
      // @ts-expect-error 0.1.0's member is gone from the host: an object literal that names it is an error
      resolveEmploymentLinkVocab: async () => ({ employer: "a:employer", employee: "a:employee" }),
      useSheetHistory: () => ({ requestClose: () => {} }),
      dropStaleSheetEntry: () => {},
    };
    expect(Object.keys(h)).toContain("readResources");
  });
});
