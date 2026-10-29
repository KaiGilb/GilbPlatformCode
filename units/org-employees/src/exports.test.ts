// Every export of the entry point is pinned: its name, its kind, and (for the helpers org-hierarchy takes as a peer) its behaviour in one line.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

const FUNCTIONS = [
  "OrgEmployeesSection", "OrgEmployeeRow", "OrgShortList", "OrgListSheet", "useOrgEmployees", "readOrgEmployeesPage", "__resetPersonKinds",
  "foldName", "filterEmployeesByName", "searchScopeSentence", "noMatchSentence", "groupCountText", "stillLoadingSentence",
  "pagedFindBothSpellings", "orgSectionOrder", "subjectSpellings", "inVault", "refsOf", "servedValue", "useOrgEmployeesHost",
] as const;
const CONSTANTS = { EMPLOYEES_PAGE: 50, INLINE_EMPLOYEES: 10, SEARCH_DEBOUNCE_MS: 250, FULL_LIST_STEP: 50 } as const;

describe("the entry point", () => {
  it.each(FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof (unit as Record<string, unknown>)[name]).toBe("function");
  });
  it.each(Object.entries(CONSTANTS))("exports %s = %s", (name, value) => {
    expect((unit as Record<string, unknown>)[name]).toBe(value);
  });
  it("exports EMPLOYEE_FOCUS as the row's focus classes", () => {
    expect(unit.EMPLOYEE_FOCUS).toContain("focus-visible:outline");
  });
  it("exports the host context", () => {
    expect(unit.OrgEmployeesHostContext).toBeDefined();
  });
  it("exports nothing else (a new export must be pinned here)", () => {
    const expected = new Set<string>([...FUNCTIONS, ...Object.keys(CONSTANTS), "EMPLOYEE_FOCUS", "OrgEmployeesHostContext"]);
    expect(Object.keys(unit).filter((k) => !expected.has(k))).toEqual([]);
    expect([...expected].filter((k) => !(k in unit))).toEqual([]);
  });
});

describe("the helpers org-hierarchy takes from here", () => {
  it("subjectSpellings gives both address spellings, the given one first", () => {
    expect(unit.subjectSpellings("https://v.example.test/base/e/a")).toEqual(["https://v.example.test/base/e/a", "https://v.example.test/vault/e/a"]);
    expect(unit.subjectSpellings("https://v.example.test/vault/e/a")).toEqual(["https://v.example.test/vault/e/a", "https://v.example.test/base/e/a"]);
    expect(unit.subjectSpellings("https://v.example.test/x/a")).toEqual(["https://v.example.test/x/a"]);
  });
  it("inVault compares hosts, ignoring case, and is false when either side is not an address", () => {
    expect(unit.inVault("https://V.Example.test/base/e/a", "https://v.example.test/base")).toBe(true);
    expect(unit.inVault("https://w.example.test/base/e/a", "https://v.example.test/base")).toBe(false);
    expect(unit.inVault("not a url", "https://v.example.test/base")).toBe(false);
    expect(unit.inVault("https://v.example.test/base/e/a", "not a url")).toBe(false);
    expect(unit.inVault("not a url", "also not")).toBe(false);
  });
});
