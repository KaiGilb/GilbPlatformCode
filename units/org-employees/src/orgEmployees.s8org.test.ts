// Cycle214 s8 organization card — THE EMPLOYEES LIST (Kai 2026-10-16: "And then if one can easily list all the employees";
// Kai-Zen's reading: "the list shows only the people the viewer may see ... the list is never a find key and never widens
// anyone's rung"). The platform's find-by-attribute answers per requester; here a small model of that platform answers
// per reader (anonymous, holder, member, outsider) and the reader code is driven against it.
import { describe, expect, it } from "vitest";
import { strictHost } from "../test/fakeHost";
import src from "./orgEmployees.ts?raw";
import { EMPLOYEES_PAGE, readOrgEmployeesPage, type EmployeesDeps } from "./orgEmployees";

const HOST = "https://v.example.test/base";
const host = strictHost();
const ORG = `${HOST}/e/org1`;
const e = (id: string) => `${HOST}/e/${id}`;

interface Emp {
  id: string;
  employer: string;
  employee: string;
  titles?: string | string[];
  /** Who may read this employment record (its rung / the vault's grants). */
  readers: string[];
}
interface Person {
  id: string;
  name: string;
  readers: string[];
}

/** The platform as one reader sees it: a find that answers only what that reader may read, and reads that refuse the rest. */
function platformFor(reader: string, emps: Emp[], people: Person[], log: { finds: string[]; reads: string[] } = { finds: [], reads: [] }): EmployeesDeps {
  const readable = (e2: Emp) => e2.readers.includes(reader);
  return {
    employerAttr: async () => "a:employer",
    employeeKey: async () => "employee",
    jobTitleKey: async () => "jobTitle",
    find: async (attr, value, page) => {
      log.finds.push(`${attr}=${JSON.stringify(value)}@${page.offset}`);
      if (reader === "anonymous") throw new Error("find-by-attribute failed: 401");
      const target = (value as { "@id": string })["@id"];
      const all = emps.filter((x) => e(x.employer) === target && readable(x));
      const slice = all.slice(page.offset, page.offset + page.limit);
      return { count: all.length, ids: slice.map((x) => e(x.id)) };
    },
    readEmployments: async (uris) =>
      uris.map((uri) => {
        log.reads.push(uri);
        const x = emps.find((y) => e(y.id) === uri);
        if (!x || !readable(x)) return { id: uri.split("/").pop()!, uri, doc: {}, gone: true };
        return {
          id: x.id,
          uri,
          gone: false,
          doc: { employer: { "@id": e(x.employer) }, employee: { "@id": e(x.employee) }, ...(x.titles !== undefined ? { jobTitle: x.titles } : {}) },
        };
      }),
    readPerson: async (id) => {
      log.reads.push(`person:${id}`);
      const p = people.find((q) => q.id === id);
      return p && p.readers.includes(reader) ? { facts: { name: p.name } } : null;
    },
  };
}

const people: Person[] = [
  { id: "ann", name: "Ann Visible", readers: ["holder", "member", "outsider"] },
  { id: "bob", name: "Bob Private", readers: ["holder"] },
  { id: "cy", name: "Cy Member", readers: ["holder", "member"] },
];
const emps: Emp[] = [
  { id: "m1", employer: "org1", employee: "ann", titles: "CEO", readers: ["holder", "member", "outsider"] },
  { id: "m2", employer: "org1", employee: "bob", titles: ["CTO", "Founder"], readers: ["holder"] },
  { id: "m3", employer: "org1", employee: "cy", titles: "CFO", readers: ["holder", "member"] },
  { id: "m4", employer: "org2", employee: "ann", titles: "Elsewhere", readers: ["holder", "member", "outsider"] },
];

describe("the employees list, per reader (nothing widened)", () => {
  it("the holder, who may read everything, sees all three, each with the titles read", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("holder", emps, people));
    expect(page.employees.map((p) => [p.name, p.titles])).toEqual([
      ["Ann Visible", ["CEO"]],
      ["Bob Private", ["CTO", "Founder"]],
      ["Cy Member", ["CFO"]],
    ]);
    expect(page.total).toBe(3);
    expect(page.nextOffset).toBeNull();
  });
  it("a member sees only the people whose employment AND record they may read", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("member", emps, people));
    expect(page.employees.map((p) => p.name)).toEqual(["Ann Visible", "Cy Member"]);
    expect(page.total).toBe(2); // the platform's own count for THIS reader: Bob's employment is not counted
  });
  it("an outsider sees one, and never learns of the others (not named, not counted)", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("outsider", emps, people));
    expect(page.employees.map((p) => p.name)).toEqual(["Ann Visible"]);
    expect(page.total).toBe(1);
    expect(JSON.stringify(page)).not.toMatch(/Bob|Cy/);
  });
  it("an anonymous reader gets the platform's refusal, ⛔ not an empty list that reads as 'no employees'", async () => {
    await expect(readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("anonymous", emps, people))).rejects.toThrow(/401/);
  });
  it("a person whose employment the reader may read but whose RECORD they may not is not listed (the person's own rung decides)", async () => {
    const e2: Emp[] = [{ id: "m9", employer: "org1", employee: "bob", titles: "CTO", readers: ["outsider"] }];
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("outsider", e2, people));
    expect(page.employees).toEqual([]);
    expect(page.notListed).toBe(1);
    expect(JSON.stringify(page)).not.toContain("Bob");
  });
  it("lists a person once, with every title, when they have two employments at the organization", async () => {
    const e2: Emp[] = [
      { id: "a1", employer: "org1", employee: "ann", titles: "CEO", readers: ["holder"] },
      { id: "a2", employer: "org1", employee: "ann", titles: ["Chair", "CEO"], readers: ["holder"] },
    ];
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("holder", e2, people));
    expect(page.employees).toHaveLength(1);
    expect(page.employees[0]!.titles).toEqual(["CEO", "Chair"]);
  });
  it("does not list a person whose employment names ANOTHER organization, even if a find returned it", async () => {
    const deps = platformFor("holder", emps, people);
    const lying: EmployeesDeps = { ...deps, find: async () => ({ count: 1, ids: [e("m4")] }) };
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, lying);
    expect(page.employees).toEqual([]);
    expect(page.notListed).toBe(1);
  });
  it("an employment with no employee, or two, is not a person", async () => {
    const deps = platformFor("holder", emps, people);
    const odd: EmployeesDeps = {
      ...deps,
      readEmployments: async (uris) => uris.map((uri) => ({ id: uri, uri, gone: false, doc: { employer: { "@id": ORG } } })),
    };
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, odd);
    expect(page.employees).toEqual([]);
  });
  it("pages: the next offset is named while the find says there is more, and the count is the platform's", async () => {
    const many: Emp[] = Array.from({ length: 120 }, (_, i) => ({ id: `x${i}`, employer: "org1", employee: "ann", readers: ["holder"] }));
    const log = { finds: [] as string[], reads: [] as string[] };
    const p1 = await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("holder", many, people, log));
    expect(p1.total).toBe(120);
    expect(p1.nextOffset).toBe(EMPLOYEES_PAGE);
    const p3 = await readOrgEmployeesPage(host, ORG, HOST, { offset: 100 }, platformFor("holder", many, people));
    expect(p3.nextOffset).toBeNull();
  });
  it("asks the find for BOTH spellings of the organization address (the platform matches the stored text exactly)", async () => {
    const log = { finds: [] as string[], reads: [] as string[] };
    await readOrgEmployeesPage(host, ORG, HOST, {}, platformFor("holder", emps, people, log));
    expect(log.finds.some((f) => f.includes("/base/e/org1"))).toBe(true);
    expect(log.finds.some((f) => f.includes("/vault/e/org1"))).toBe(true);
    expect(log.finds.every((f) => f.startsWith("a:employer="))).toBe(true);
  });
});

describe("the employees list is never a find key and writes nothing", () => {
  // Comments are stripped: the header names the value plane in order to forbid it.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("never calls the value plane (find-by-value) or names a network find key", () => {
    expect(code).not.toMatch(/find-by-value|findByValue|networkFindKey|connect\//);
  });
  it("never writes (no create, patch, delete, put)", () => {
    expect(code).not.toMatch(/createRecord|patchRecord|deleteRecord|replaceRecord|createResource|patchResource|deleteResource|method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  });
  it("never reads a rung or a grant (the platform decides what this reader may read)", () => {
    expect(code).not.toMatch(/visibilityTier|directReader|grant/i);
  });
});
