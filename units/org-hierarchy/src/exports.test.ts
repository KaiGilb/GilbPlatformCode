// Every export of the entry point is pinned: its name and its kind.
import { describe, expect, it } from "vitest";
import "../test/origins";
import * as unit from "./index";

const FUNCTIONS = [
  "orgKey", "walkUp", "checkParentWrite",
  "organizationTypeUri", "readOrganization", "organizationParentReader", "findOrganizationRecords",
  "readOrgUnitsPage", "readUnitEmployments",
  "chainEndText", "setParentOrganization", "OrgPartOfSection", "OrgUnitsSection",
  "useOrgUnits",
] as const;
const CONSTANTS = {
  ORG_DEPTH_CAP: 20,
  UNITS_PAGE: 50,
  FOCUS: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
  PARENT_RACE_TEXT: "That would make a loop with another change made at the same moment, so the parent was put back as it was. Choose again.",
} as const;

describe("the entry point", () => {
  it.each(FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof (unit as Record<string, unknown>)[name]).toBe("function");
  });
  it.each(Object.entries(CONSTANTS))("exports %s", (name, value) => {
    expect((unit as Record<string, unknown>)[name]).toBe(value);
  });
  it("exports nothing else (a new export must be pinned here)", () => {
    const expected = new Set<string>([...FUNCTIONS, ...Object.keys(CONSTANTS)]);
    expect(Object.keys(unit).filter((k) => !expected.has(k))).toEqual([]);
    expect([...expected].filter((k) => !(k in unit))).toEqual([]);
  });
  it("no longer exports the constants ORGANIZATION_TYPE_URI and ORGANIZATION_TYPE_NAME: the type address is a function of the setting", () => {
    expect(Object.keys(unit)).not.toContain("ORGANIZATION_TYPE_URI");
    expect(Object.keys(unit)).not.toContain("ORGANIZATION_TYPE_NAME");
  });
});
