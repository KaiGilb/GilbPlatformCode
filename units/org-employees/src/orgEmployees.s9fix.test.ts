// Cycle214 s9 organization card FIX ROUND — the employees reader (Agent.Scaling C1 C4 C7, Agent.Tester M2 M3 Y1 Y8).
// Spec: 3P.F.Stakeholders.OrganizationCardSameAsPerson.GilbApp item 3 ("every person whose employment OR member-of points to
// this organization"); the platform answers per reader (a small model of it here), the reader code is driven against it.
import { describe, expect, it } from "vitest";
import { strictHost } from "../test/fakeHost";
import { turn, turns } from "../test/timing";
import { readOrgEmployeesPage, type EmployeesDeps } from "./orgEmployees";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

const HOST = "https://v.example.test/base";
const host = strictHost();
setBaseOrigin("https://example.test");
const ORG = `${HOST}/e/org1`;
const e = (id: string) => `${HOST}/e/${id}`;

interface World {
  /** employment id -> { employer spelling kept as stored, employee ids } */
  emps: { id: string; employer: string; employees: string[]; titles?: string[] }[];
  /** person id -> member-of target as stored, name, photo, readable */
  people: Record<string, { name: string; memberOf?: string; readable?: boolean; photo?: string }>;
}

function deps(w: World, log: { finds: { attr: string; value: string; origin: string; offset: number }[]; personReads: string[]; inflight: { now: number; max: number }; photoKeyCalls: number } = { finds: [], personReads: [], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 }): EmployeesDeps {
  return {
    employerAttr: async () => "a:employer",
    employeeKey: async () => "employee",
    jobTitleKey: async () => "jobTitle",
    memberAttr: async () => "a:memberOf",
    personKinds: async () => ["Person"],
    photoKeys: async () => {
      log.photoKeyCalls++;
      return ["profilePhoto"];
    },
    find: async (attr, value, page, origin) => {
      const target = (value as { "@id": string })["@id"];
      log.finds.push({ attr, value: target, origin, offset: page.offset });
      log.inflight.now++;
      log.inflight.max = Math.max(log.inflight.max, log.inflight.now);
      await turn();
      log.inflight.now--;
      if (attr === "a:employer") {
        const all = w.emps.filter((x) => x.employer === target);
        return { count: all.length, ids: all.slice(page.offset, page.offset + page.limit).map((x) => e(x.id)) };
      }
      const all = Object.entries(w.people).filter(([, p]) => p.memberOf === target);
      return { count: all.length, ids: all.slice(page.offset, page.offset + page.limit).map(([id]) => e(id)) };
    },
    readEmployments: async (uris) =>
      uris.map((uri) => {
        const x = w.emps.find((y) => e(y.id) === uri)!;
        return {
          id: x.id,
          uri,
          gone: false,
          doc: { employer: { "@id": x.employer }, employee: x.employees.map((p) => ({ "@id": e(p) })), ...(x.titles ? { jobTitle: x.titles } : {}) },
        };
      }),
    readPerson: async (id) => {
      log.personReads.push(id);
      const p = w.people[id];
      return p && p.readable !== false ? { typeUri: "https://veda.example.test/base/t/Person", facts: { name: p.name, ...(p.photo ? { profilePhoto: p.photo } : {}) } } : null;
    },
  };
}

const world = (): World => ({
  emps: [{ id: "m1", employer: ORG, employees: ["ann"], titles: ["CEO"] }],
  people: { ann: { name: "Ann", photo: "/files/ann1" }, cy: { name: "Cy", memberOf: ORG } },
});

describe("Y8: the finds are asked at the VAULT's host, never the apex", () => {
  it("every find (employer and member-of, both address spellings) is asked at vaultOriginOf(vaultId)", async () => {
    const log = { finds: [] as { attr: string; value: string; origin: string; offset: number }[], personReads: [] as string[], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 };
    await readOrgEmployeesPage(host, ORG, HOST, {}, deps(world(), log));
    expect(log.finds.length).toBeGreaterThanOrEqual(4);
    expect(new Set(log.finds.map((f) => f.origin))).toEqual(new Set([vaultOriginOf(HOST)]));
    expect(vaultOriginOf(HOST)).not.toBe("https://example.test");
  });
});

describe("M2: people whose member-of points to the organization are in the list (spec item 3)", () => {
  it("lists a member-of person who has no employment, and counts them apart from employments", async () => {
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(world()));
    expect(page.employees.map((p) => [p.name, p.titles])).toEqual([["Ann", ["CEO"]], ["Cy", []]]);
    expect(page.total).toBe(1);
    expect(page.memberTotal).toBe(1);
  });
  it("a person with both an employment and a member-of is listed ONCE, with the title", async () => {
    const w = world();
    w.people.ann!.memberOf = ORG;
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w));
    expect(page.employees.filter((p) => p.name === "Ann")).toHaveLength(1);
    expect(page.employees.find((p) => p.name === "Ann")!.titles).toEqual(["CEO"]);
  });
  it("a member-of person the viewer may not read is not listed and not named (counted in notListed)", async () => {
    const w = world();
    w.people.cy!.readable = false;
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w));
    expect(page.employees.map((p) => p.name)).toEqual(["Ann"]);
    expect(page.notListed).toBe(1);
    expect(JSON.stringify(page)).not.toContain("Cy");
  });
  it("an ORGANIZATION whose member-of names this one is a unit, not a person: not listed and not counted as left out", async () => {
    const w = world();
    const d = deps(w);
    const withUnit: EmployeesDeps = {
      ...d,
      find: async (attr, value, pg, origin) => {
        const r = await d.find(attr, value, pg, origin);
        return attr === "a:memberOf" && (value as { "@id": string })["@id"] === ORG ? { count: r.count + 1, ids: [...r.ids, e("unit1")] } : r;
      },
      readPerson: async (id, at) => (id === "unit1" ? { facts: { name: "Unit One" }, typeUri: "https://veda.example.test/base/t/Organization" } : d.readPerson(id, at)),
    };
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, withUnit);
    expect(page.employees.map((p) => p.name)).toEqual(["Ann", "Cy"]);
    expect(page.notListed).toBe(0);
  });
  it("finds a member-of stored under the OTHER address spelling (/vault/e/)", async () => {
    const w = world();
    w.people.cy!.memberOf = ORG.replace("/base/e/", "/vault/e/");
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w));
    expect(page.employees.map((p) => p.name)).toContain("Cy");
  });
  it("pages the two sources on their own offsets: nextMemberOffset names where the members go on", async () => {
    const w = world();
    for (let i = 0; i < 7; i++) w.people[`m${i}`] = { name: `Member ${i}`, memberOf: ORG };
    const p1 = await readOrgEmployeesPage(host, ORG, HOST, { limit: 3 }, deps(w));
    // s12 (Tester F1): one page holds `limit` records across BOTH sources: here the 1 employment and 2 members make the 3
    expect(p1.employees).toHaveLength(3);
    expect(p1.nextMemberOffset).toBe(2);
    expect(p1.nextOffset).toBeNull();
    const p2 = await readOrgEmployeesPage(host, ORG, HOST, { offset: null, memberOffset: 2, limit: 3 }, deps(w));
    expect(p2.employees).toHaveLength(3);
    expect(p2.nextMemberOffset).toBe(5);
  });
  it("an employment source marked finished (offset null) is not asked again", async () => {
    const log = { finds: [] as { attr: string; value: string; origin: string; offset: number }[], personReads: [] as string[], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 };
    await readOrgEmployeesPage(host, ORG, HOST, { offset: null, memberOffset: 0 }, deps(world(), log));
    expect(log.finds.every((f) => f.attr === "a:memberOf")).toBe(true);
  });
});

describe("M3 Y1: an employment naming several employees is no person's employment", () => {
  it("is not listed and counts as not listed", async () => {
    const w = world();
    w.emps.push({ id: "m2", employer: ORG, employees: ["ann", "cy"] });
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w));
    expect(page.employees.find((p) => p.name === "Ann")!.titles).toEqual(["CEO"]);
    expect(page.notListed).toBe(1);
  });
  it("an employment whose only employee is a different person than the others stays that person's", async () => {
    const w = world();
    w.emps.push({ id: "m3", employer: ORG, employees: ["cy"], titles: ["CFO"] });
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(w));
    expect(page.employees.find((p) => p.name === "Cy")!.titles).toEqual(["CFO"]);
  });
});

describe("C4: fewer and parallel reads", () => {
  it("asks the two address spellings together, not one after the other", async () => {
    const log = { finds: [] as { attr: string; value: string; origin: string; offset: number }[], personReads: [] as string[], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 };
    // Only the employments are asked here (the member source is finished), so the two in flight are the two spellings.
    await readOrgEmployeesPage(host, ORG, HOST, { memberOffset: null }, deps(world(), log));
    expect(log.finds.every((f) => f.attr === "a:employer")).toBe(true);
    expect(log.inflight.max).toBeGreaterThanOrEqual(2);
  });
  it("asks the employment source and the member source together", async () => {
    const log = { finds: [] as { attr: string; value: string; origin: string; offset: number }[], personReads: [] as string[], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 };
    await readOrgEmployeesPage(host, ORG, HOST, {}, deps(world(), log));
    expect(log.inflight.max).toBeGreaterThanOrEqual(4);
  });
  it("nothing waits for the picture spellings: the finds go out while they are still being asked", async () => {
    const log = { finds: [] as { attr: string; value: string; origin: string; offset: number }[], personReads: [] as string[], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 };
    let release: (k: readonly string[]) => void = () => {};
    const slow: EmployeesDeps = { ...deps(world(), log), photoKeys: () => new Promise<readonly string[]>((r) => (release = r)) };
    const done = readOrgEmployeesPage(host, ORG, HOST, {}, slow);
    await turns();
    expect(log.finds.length).toBeGreaterThanOrEqual(4);
    release(["profilePhoto"]);
    const page = await done;
    expect(page.employees.find((p) => p.name === "Ann")!.photoRef).toBe("/files/ann1");
  });
  it("reads each person ONCE and hands the picture reference to the row (the row does not read the person again)", async () => {
    const log = { finds: [] as { attr: string; value: string; origin: string; offset: number }[], personReads: [] as string[], inflight: { now: 0, max: 0 }, photoKeyCalls: 0 };
    const page = await readOrgEmployeesPage(host, ORG, HOST, {}, deps(world(), log));
    expect(log.personReads.sort()).toEqual(["ann", "cy"]);
    expect(page.employees.find((p) => p.name === "Ann")!.photoRef).toBe("/files/ann1");
    expect(page.employees.find((p) => p.name === "Cy")!.photoRef).toBeNull();
    // the picture spellings are asked once for the page, not once per person (each ask was a request: +1.1 s a page at 140 ms)
    expect(log.photoKeyCalls).toBe(1);
  });
});

describe("C1: a page whose readable employments name nobody the reader may read still says there is more", () => {
  it("returns no people, the next offset, and notListed > 0 (never a bare empty page)", async () => {
    const w: World = { emps: [], people: {} };
    for (let i = 0; i < 120; i++) {
      w.emps.push({ id: `x${i}`, employer: ORG, employees: [`p${i}`] });
      w.people[`p${i}`] = { name: `P${i}`, readable: i >= 110 };
    }
    const p1 = await readOrgEmployeesPage(host, ORG, HOST, { limit: 50 }, deps(w));
    expect(p1.employees).toEqual([]);
    expect(p1.notListed).toBe(50);
    expect(p1.nextOffset).toBe(50);
    const p3 = await readOrgEmployeesPage(host, ORG, HOST, { offset: 100, limit: 50 }, deps(w));
    expect(p3.employees).toHaveLength(10);
    expect(p3.nextOffset).toBeNull();
  });
});
