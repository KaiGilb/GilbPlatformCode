// New. Pins the export list of the package, so an export added or dropped by a later change is a decision and not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("stakeholder-list-state exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "deletedLinkedRecords",
      "deletedLinkedRevision",
      "forgetDeletedLinkedRecord",
      "forgetPageLink",
      "forgetPageLinks",
      "notePageLinks",
      "onDeletedLinkedRecords",
      "onPageLinks",
      "pageLinkOf",
      "pageLinksRevision",
    ]);
  });
  it("all are functions", () => {
    for (const v of Object.values(unit)) expect(typeof v).toBe("function");
  });
});
