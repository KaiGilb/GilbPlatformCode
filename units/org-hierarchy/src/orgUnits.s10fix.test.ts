// A page of units holds at most `limit` when the units name the parent under both address spellings, and carries the counts to the next page.
import "../test/origins";
import { describe, expect, it } from "vitest";
import { readOrgUnitsPage, type UnitsDeps } from "./orgUnits";
import type { OrgRead } from "./orgRecords";

const HOST = "https://v.example.test/base";
const HQ = `${HOST}/e/hq`;
const kids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${HOST}/e/${p}${String(i).padStart(3, "0")}`);

function deps(a: number, b: number, reads: number[]): UnitsDeps {
  const A = kids("a", a);
  const B = kids("b", b);
  return {
    parentAttr: async () => "a:parentOrganization",
    employerAttr: async () => "a:employer",
    find: async (attr, value, page) => {
      const v = (value as { "@id": string })["@id"];
      if (attr !== "a:parentOrganization") return { count: 0, ids: [] };
      const all = v.includes("/base/e/") && v === HQ ? A : v === HQ.replace("/base/e/", "/vault/e/") ? B : [];
      return { count: all.length, ids: all.slice(page.offset, page.offset + page.limit) };
    },
    readOrg: async (uri): Promise<OrgRead> => {
      reads.push(1);
      return { state: "ok", uri, name: uri.split("/").pop()!, logo: null, parent: HQ, parentCount: 1 };
    },
  };
}

describe("a page of units holds at most the limit over both address spellings", () => {
  it("a page given the previous page's counts makes no limit-1 probe finds on the parent attribute", async () => {
    const reads: number[] = [];
    const d = deps(60, 40, reads);
    const limits: number[] = [];
    await readOrgUnitsPage(HQ, HOST, { offset: 50, counts: [60, 40] }, { ...d, find: async (a, v, pg, o) => (a === "a:parentOrganization" && limits.push(pg.limit), d.find(a, v, pg, o)) });
    expect(limits.length).toBeGreaterThan(0);
    expect(limits).not.toContain(1);
  });
  it("50 + 50 units: two pages of 50, 100 units, none twice, the counts handed on", async () => {
    const reads: number[] = [];
    const d = deps(50, 50, reads);
    const p1 = await readOrgUnitsPage(HQ, HOST, {}, d);
    expect(p1.units).toHaveLength(50);
    expect(p1.total).toBe(100);
    expect(p1.counts).toEqual([50, 50]);
    expect(p1.nextOffset).toBe(50);
    const p2 = await readOrgUnitsPage(HQ, HOST, { offset: 50, counts: p1.counts }, d);
    expect(p2.units).toHaveLength(50);
    expect(p2.nextOffset).toBeNull();
    expect(new Set([...p1.units, ...p2.units].map((u) => u.uri)).size).toBe(100);
    expect(reads).toHaveLength(100);
  });
});
