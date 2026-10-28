// Every name the package index exports, and no other.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package index", () => {
  it("exports the reads and writes the Stakeholder, Authority and Resource Owner lines are served with", () => {
    const names = [
      "endThenWriteAuthority",
      "findAnyRecords",
      "findStakeholderRecords",
      "migratedAuthorityRelation",
      "writeAuthorityRelation",
      "STAKEHOLDER_TYPE_SET_QUERY",
      "kindWordOf",
      "masterKindReader",
      "readStakeholderTypeSet",
      "stakeholderTypeSetQueryKey",
      "subscribeStakeholderTypeSet",
      "toStakeholderTypeSet",
      "useAuthorityTypes",
      "usePersonAuthorities",
      "useRelations",
      "useResolvedRefLabel",
    ];
    expect(Object.keys(unit).sort()).toEqual(names.sort());
    for (const name of names) expect(typeof (unit as Record<string, unknown>)[name]).toBe(name === "STAKEHOLDER_TYPE_SET_QUERY" ? "object" : "function");
  });
});
