// Cycle214 s12 follow-up (Agent.Tester s17 F1, ruled BLOCKING): an organization whose people are linked BOTH ways (employment and member-of) read the page
// `limit` for EACH source, so the first open read up to 20 people ("Tri Source AS": 60 employments + 160 member-of: 121 record reads) and every "Show more"
// added up to 100. ONE page now holds at most `limit` records across both sources (employments first half, member-of the rest, either one all of it when the
// other has run out), and the person test of the org-card fix and the paging counts of Scaling N1/N3 are kept.
import { describe, expect, it } from "vitest";
import { strictHost } from "../test/fakeHost";
import { readOrgEmployeesPage, type EmployeesDeps, type OrgEmployeesPage } from "./orgEmployees";

const HOST = "https://v.example.test/base";
const host = strictHost();
const ORG = `${HOST}/e/org1`;
const e = (id: string) => `${HOST}/e/${id}`;

interface Log {
  finds: { attr: string; limit: number; offset: number }[];
  employmentReads: string[];
  personReads: string[];
}

/** nEmp employments (one employee each), nMem people whose member-of names the organization, `both` of the first employees are also members. */
function world(nEmp: number, nMem: number, both = 0, nonPersons = 0) {
  const log: Log = { finds: [], employmentReads: [], personReads: [] };
  const emps = Array.from({ length: nEmp }, (_, i) => ({ id: `m${String(i).padStart(3, "0")}`, person: `p${String(i).padStart(3, "0")}` }));
  const members = [
    ...Array.from({ length: both }, (_, i) => `p${String(i).padStart(3, "0")}`),
    ...Array.from({ length: Math.max(nMem - both, 0) }, (_, i) => `q${String(i).padStart(3, "0")}`),
  ].slice(0, nMem);
  const notPersons = new Set(Array.from({ length: nonPersons }, (_, i) => `q${String(Math.max(nMem - both, 0) - 1 - i).padStart(3, "0")}`));
  const deps: EmployeesDeps = {
    employerAttr: async () => "a:employer",
    employeeKey: async () => "employee",
    jobTitleKey: async () => "jobTitle",
    memberAttr: async () => "a:memberOf",
    personKinds: async () => ["Person"],
    photoKeys: async () => ["profilePhoto"],
    find: async (attr, value, page) => {
      const target = (value as { "@id": string })["@id"];
      log.finds.push({ attr, limit: page.limit, offset: page.offset });
      if (!target.includes("/base/e/")) return { count: 0, ids: [] };
      if (attr === "a:employer") return { count: emps.length, ids: emps.slice(page.offset, page.offset + page.limit).map((x) => e(x.id)) };
      return { count: members.length, ids: members.slice(page.offset, page.offset + page.limit).map(e) };
    },
    readEmployments: async (uris) => {
      log.employmentReads.push(...uris);
      return uris.map((uri) => {
        const x = emps.find((y) => e(y.id) === uri)!;
        return { id: x.id, uri, gone: false, doc: { employer: { "@id": ORG }, employee: [{ "@id": e(x.person) }] } };
      });
    },
    readPerson: async (id) => {
      log.personReads.push(id);
      return { typeUri: notPersons.has(id) ? "https://veda.example.test/base/t/Task" : "https://veda.example.test/base/t/Person", facts: { name: `Name ${id}` } };
    },
  };
  return { deps, log };
}

/** Every page of the organization, the way the card asks them (first page `first`, then the reader's own 50). */
async function walk(deps: EmployeesDeps, log: Log, first = 10) {
  const pages: OrgEmployeesPage[] = [];
  const perPage: { records: number; people: number }[] = [];
  let param: Record<string, unknown> = { limit: first };
  for (let guard = 0; guard < 400; guard++) {
    const e0 = log.employmentReads.length;
    const p0 = log.personReads.length;
    const page = await readOrgEmployeesPage(host, ORG, HOST, param as never, deps);
    pages.push(page);
    perPage.push({ records: log.employmentReads.length - e0 + (log.personReads.length - p0), people: page.employees.length });
    if (page.nextOffset === null && page.nextMemberOffset === null) break;
    param = { offset: page.nextOffset, memberOffset: page.nextMemberOffset, employmentCounts: page.employmentCounts, memberCounts: page.memberCounts };
  }
  return { pages, perPage };
}

describe("the first page of an organization linked both ways reads at most `limit` records across the two sources", () => {
  it("Tri Source AS (60 employments + 160 member-of): 10 people, not 20, and a handful of reads", async () => {
    const { deps, log } = world(60, 160);
    const page = await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, deps);
    expect(page.employees).toHaveLength(10);
    expect(page.total).toBe(60);
    expect(page.memberTotal).toBe(160);
    // one single-source page of 10 reads 10 employments and 10 people; this one reads no more
    expect(log.employmentReads.length).toBeLessThanOrEqual(10);
    expect(log.personReads.length).toBeLessThanOrEqual(10);
    expect(log.employmentReads.length + log.personReads.length).toBeLessThanOrEqual(15);
  });
  it("both sources are in the first page (the member-of people are not starved behind 20,000 employments)", async () => {
    const { deps } = world(60, 160);
    const page = await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, deps);
    expect(page.employees.some((p) => p.id.startsWith("p"))).toBe(true);
    expect(page.employees.some((p) => p.id.startsWith("q"))).toBe(true);
  });
  it("Dual Source AS (100 employments + 30 member-of): 10 people", async () => {
    const { deps } = world(100, 30);
    const page = await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, deps);
    expect(page.employees).toHaveLength(10);
  });
  it("when one source has run out the other fills the page: 8 employments and 2 members make 10", async () => {
    const { deps } = world(8, 2);
    const page = await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, deps);
    expect(page.employees).toHaveLength(10);
    expect(page.nextOffset).toBeNull();
    expect(page.nextMemberOffset).toBeNull();
  });
  it("only members: the whole page is members; only employments: the whole page is employments", async () => {
    const onlyMembers = world(0, 40);
    expect((await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, onlyMembers.deps)).employees).toHaveLength(10);
    const onlyEmps = world(40, 0);
    expect((await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, onlyEmps.deps)).employees).toHaveLength(10);
  });
});

describe("a 'Show more' page of an organization linked both ways holds 50 records in all, never 100", () => {
  it("Tri Source: every page after the first reads at most 50 records and lists at most 50 people", async () => {
    const { deps, log } = world(60, 160);
    const { perPage } = await walk(deps, log);
    for (const pg of perPage.slice(1)) {
      expect(pg.people).toBeLessThanOrEqual(50);
      expect(pg.records).toBeLessThanOrEqual(100); // 50 employments + 50 people at most, as a single-source page
    }
    expect(perPage.length).toBeGreaterThan(2);
  });
  it("Tri Source: the walk lists every person once (60 + 160), the paging counts of both sources are honest, and it ends", async () => {
    const { deps, log } = world(60, 160);
    const { pages } = await walk(deps, log);
    const ids = pages.flatMap((p) => p.employees.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(220);
    expect(pages[0]!.total + pages[0]!.memberTotal).toBe(220);
  });
  it("Dual Source with people in both (100 employments, 30 members of whom 12 are also employees): 118 people, each once", async () => {
    const { deps, log } = world(100, 30, 12);
    const { pages } = await walk(deps, log);
    const ids = pages.flatMap((p) => p.employees.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(118);
  });
  it("the records a page takes (its employments read plus its member-of people) stay within the page limit", async () => {
    const { deps, log } = world(60, 160);
    const took: number[] = [];
    let param: Record<string, unknown> = { limit: 10 };
    for (let i = 0; i < 40; i++) {
      const e0 = log.employmentReads.length;
      const p0 = log.personReads.length;
      const page = await readOrgEmployeesPage(host, ORG, HOST, param as never, deps);
      // every person read is either an employment's person or a member-of person: employments read + members read = records taken
      const emps = log.employmentReads.length - e0;
      const members = log.personReads.length - p0 - emps;
      took.push(emps + members);
      if (page.nextOffset === null && page.nextMemberOffset === null) break;
      param = { offset: page.nextOffset, memberOffset: page.nextMemberOffset, employmentCounts: page.employmentCounts, memberCounts: page.memberCounts };
    }
    expect(took[0]).toBeLessThanOrEqual(10);
    for (const n of took.slice(1)) expect(n).toBeLessThanOrEqual(50);
    expect(took.reduce((a, b) => a + b, 0)).toBe(220);
  });
});

describe("kept: the person test of the org-card fix and the paging counts", () => {
  it("a member-of hit that is not a person is not listed (12 member-of records, 3 of them tasks: 9 people)", async () => {
    const w = world(0, 12, 0, 3);
    const all = await walk(w.deps, w.log, 50);
    expect(all.pages.flatMap((p) => p.employees)).toHaveLength(9);
  });
  it("a page given the previous page's counts asks no probe find (limit 1)", async () => {
    const { deps, log } = world(60, 160);
    const p1 = await readOrgEmployeesPage(host, ORG, HOST, { limit: 10 }, deps);
    log.finds.length = 0;
    await readOrgEmployeesPage(host, ORG, HOST, { offset: p1.nextOffset, memberOffset: p1.nextMemberOffset, employmentCounts: p1.employmentCounts, memberCounts: p1.memberCounts }, deps);
    expect(log.finds.some((f) => f.limit === 1)).toBe(false);
  });
});
