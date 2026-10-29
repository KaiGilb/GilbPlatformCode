// Cycle214 s10 organization card FIX — Agent.Tester F1 (the member-of source listed a Task, a Note and an Event as "people") and
// Agent.Scaling N1 (a page of employments held up to 100 when both address spellings are in use).
// THE PERSON TEST is the one the card itself uses: a stakeholder kind whose master field set carries the given-name AND family-name
// terms (RecordDetail `personNames`); `personKindNamesOf` in stakeholderCard.ts is that test, asked of the session's card vocabulary.
import { describe, expect, it } from "vitest";
import { strictHost } from "../test/fakeHost";
import { readOrgEmployeesPage, type EmployeesDeps } from "./orgEmployees";
import { personKindNamesOf } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import type { StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

const HOST = "https://v.example.test/base";
const host = strictHost();
const ORG = `${HOST}/e/org1`;
const e = (id: string) => `${HOST}/e/${id}`;
const T = (name: string) => `https://veda.example.test/base/t/${name}`;

interface World {
  emps: { id: string; employer: string; employee: string }[];
  /** id -> { type name, name } (a member-of record: person or not) */
  members: Record<string, { type: string; name: string }>;
  people: Record<string, string>;
}

function deps(w: World, over: Partial<EmployeesDeps> = {}, log = { employmentsRead: [] as number[] }): EmployeesDeps {
  return {
    employerAttr: async () => "a:employer",
    employeeKey: async () => "employee",
    jobTitleKey: async () => "jobTitle",
    memberAttr: async () => "a:memberOf",
    personKinds: async () => ["Person"],
    find: async (attr, value, page) => {
      const target = (value as { "@id": string })["@id"];
      if (attr === "a:employer") {
        const all = w.emps.filter((x) => x.employer === target);
        return { count: all.length, ids: all.slice(page.offset, page.offset + page.limit).map((x) => e(x.id)) };
      }
      const all = target === ORG ? Object.keys(w.members) : [];
      return { count: all.length, ids: all.slice(page.offset, page.offset + page.limit).map(e) };
    },
    readEmployments: async (uris) => {
      log.employmentsRead.push(uris.length);
      return uris.map((uri) => {
        const x = w.emps.find((y) => e(y.id) === uri)!;
        return { id: x.id, uri, gone: false, doc: { employer: { "@id": x.employer }, employee: { "@id": e(x.employee) } } };
      });
    },
    readPerson: async (id) => {
      const m = w.members[id];
      if (m) return { typeUri: T(m.type), facts: { name: m.name } };
      return w.people[id] ? { typeUri: T("Person"), facts: { name: w.people[id]! } } : null;
    },
    ...over,
  };
}

describe("F1: a member-of hit is listed only when it reads as a person", () => {
  const w = (): World => ({
    emps: [],
    people: {},
    members: {
      ann: { type: "Person", name: "Ann Person" },
      task: { type: "Task", name: "Task Alpha Project" },
      note: { type: "NoteDocument", name: "Note Beta memo" },
      event: { type: "Event", name: "Event Gamma offsite" },
    },
  });
  it("lists the Person and not the Task, the Note or the Event; the three are not 'left out' either (they are not people)", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w()));
    expect(page.employees.map((p) => p.name)).toEqual(["Ann Person"]);
    expect(page.notListed).toBe(0);
    expect(JSON.stringify(page)).not.toMatch(/Task Alpha|Note Beta|Event Gamma/);
  });
  it("a hit whose record carries no type is not listed", async () => {
    const d = deps(w());
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, { ...d, readPerson: async (id) => (id === "ann" ? { facts: { name: "Ann Person" } } : d.readPerson(id, "")) });
    expect(page.employees).toEqual([]);
  });
  it("when the person kinds cannot be known, no member-of hit is listed (and they are said to be left out)", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w(), { personKinds: async () => null }));
    expect(page.employees).toEqual([]);
    expect(page.notListed).toBeGreaterThan(0);
  });
  it("a person who is also named by an employment is listed whatever the member-of type test says (the employee link is a person by definition)", async () => {
    const ww = w();
    ww.emps.push({ id: "m1", employer: ORG, employee: "bob" });
    ww.people.bob = "Bob Employee";
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(ww, { personKinds: async () => null }));
    expect(page.employees.map((p) => p.name)).toEqual(["Bob Employee"]);
  });
});

describe("the card's person test (personKindNamesOf)", () => {
  const field = (name: string) => ({ term: `https://veda.example.test/base/t/${name[0]!.toUpperCase()}${name.slice(1)}`, label: name, readKeys: [`a:${name}`], writeKey: `a:${name}`, many: false, encoding: "text", record: false, writeKeyProblem: null });
  const vocab = (): StakeholderCardVocabulary =>
    ({
      kindNames: ["Person", "Organization", "SoftwareSystem"],
      kindsComplete: true,
      fieldSetsRefusal: null,
      fieldSets: {
        complete: true,
        incompleteAt: [],
        unreadable: [],
        byKind: {
          p: { kind: "p", name: "Person", label: "Person", ancestors: [], fields: [field("givenName"), field("familyName"), field("email")] },
          o: { kind: "o", name: "Organization", label: "Organization", ancestors: [], fields: [field("name"), field("logo")] },
          s: { kind: "s", name: "SoftwareSystem", label: "Software System", ancestors: [], fields: [field("name")] },
        },
      },
    }) as unknown as StakeholderCardVocabulary;
  it("is the kinds whose field set has the given-name and family-name terms: Person, not Organization or a software system", () => {
    expect(personKindNamesOf(vocab())).toEqual(["Person"]);
  });
  it("a kind with only one of the two name terms is not a person kind (both are asked, as the card asks)", () => {
    const v = vocab();
    const f = (v.fieldSets as unknown as { byKind: Record<string, { name: string; fields: unknown[] }> }).byKind;
    f.g = { name: "OnlyGiven", fields: [field("givenName")] };
    f.h = { name: "OnlyFamily", fields: [field("familyName")] };
    expect(personKindNamesOf(v)).toEqual(["Person"]);
  });
  it("a reading without field sets knows no person kind (null, never a guess)", () => {
    expect(personKindNamesOf({ ...vocab(), fieldSets: null })).toBeNull();
  });
});

describe("N1: one page holds at most `limit` employments when both address spellings carry records", () => {
  const both = (nA: number, nB: number): World => {
    const emps: World["emps"] = [];
    const people: Record<string, string> = {};
    for (let i = 0; i < nA; i++) {
      emps.push({ id: `a${i}`, employer: ORG, employee: `pa${i}` });
      people[`pa${i}`] = `PA${i}`;
    }
    for (let i = 0; i < nB; i++) {
      emps.push({ id: `b${i}`, employer: ORG.replace("/base/e/", "/vault/e/"), employee: `pb${i}` });
      people[`pb${i}`] = `PB${i}`;
    }
    return { emps, members: {}, people };
  };
  it("100 employments, 50 in each spelling: pages of 50 employments read, 100 people in all, none twice", async () => {
    const log = { employmentsRead: [] as number[] };
    const w = both(50, 50);
    const seen: string[] = [];
    let page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w, {}, log));
    seen.push(...page.employees.map((p) => p.name!));
    expect(page.total).toBe(100);
    for (let i = 0; i < 5 && page.nextOffset !== null; i++) {
      page = await readOrgEmployeesPage(host, ORG, HOST, { offset: page.nextOffset, memberOffset: null, employmentCounts: page.employmentCounts }, deps(w, {}, log));
      seen.push(...page.employees.map((p) => p.name!));
    }
    expect(log.employmentsRead).toEqual([50, 50]);
    expect(seen).toHaveLength(100);
    expect(new Set(seen).size).toBe(100);
  });
  it("a page given the previous page's counts makes no probe finds (no limit-1 find to learn the counts again)", async () => {
    const w = both(60, 40);
    const limits: number[] = [];
    const d = deps(w);
    const counted: EmployeesDeps = { ...d, find: async (a, v, pg, o) => (limits.push(pg.limit), d.find(a, v, pg, o)) };
    await readOrgEmployeesPage(host, ORG, HOST, { offset: 50, memberOffset: null, employmentCounts: [60, 40] }, counted);
    expect(limits).not.toContain(1);
    expect(limits.length).toBeGreaterThan(0);
    limits.length = 0;
    await readOrgEmployeesPage(host, ORG, HOST, { offset: 50, memberOffset: null }, counted);
    expect(limits).toContain(1); // without counts it has to learn them
  });
  it("returns the counts so the next page does not have to ask for them", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(both(60, 40)));
    expect(page.employmentCounts).toEqual([60, 40]);
    expect(page.nextOffset).toBe(50);
  });
});
