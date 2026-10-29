// The UNITS directly below an organization: "seeing the children is a read of 'who points here' and widens nobody's rung".
import "../test/origins";
import { describe, expect, it } from "vitest";
import src from "./orgUnits.ts?raw";
import { readOrgUnitsPage, readUnitEmployments, type UnitsDeps } from "./orgUnits";
import type { OrgRead } from "./orgRecords";

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;
const HQ = e("hq");

function deps(opts: {
  children: Record<string, string[]>; // parent id -> child ids this reader may find
  names: Record<string, string | null>; // child id -> name; missing = unreadable
  logos?: Record<string, string>;
  employees?: Record<string, number | "fail">;
}): UnitsDeps {
  return {
    parentAttr: async () => "a:parentOrganization",
    employerAttr: async () => "a:employer",
    find: async (attr, value, page) => {
      const target = (value as { "@id": string })["@id"];
      const id = target.split("/").pop()!;
      if (attr === "a:parentOrganization") {
        if (!target.includes("/base/e/")) return { count: 0, ids: [] }; // the other spelling matches nothing
        const kids = opts.children[id] ?? [];
        return { count: kids.length, ids: kids.slice(page.offset, page.offset + page.limit).map(e) };
      }
      const n = opts.employees?.[id];
      if (n === "fail") throw new Error("503");
      return { count: target.includes("/base/e/") ? (n ?? 0) : 0, ids: [] }; // the employments are stored under the /base/e/ spelling
    },
    readOrg: async (uri): Promise<OrgRead> => {
      const id = uri.split("/").pop()!;
      if (!(id in opts.names)) return { state: "unreadable" };
      return { state: "ok", uri, name: opts.names[id]!, logo: opts.logos?.[id] ?? null, parent: HQ, parentCount: 1 };
    },
  };
}

describe("readOrgUnitsPage", () => {
  it("lists the direct children with name and logo; each unit's count is its own lazy read", async () => {
    const d = deps({ children: { hq: ["u2", "u1"] }, names: { u1: "Butikk Oslo", u2: "Butikk Bergen" }, logos: { u1: `${HOST}/e/logo1` }, employees: { u1: 12, u2: 3 } });
    const page = await readOrgUnitsPage(HQ, HOST, {}, d);
    expect(page.units.map((u) => [u.name, u.logo])).toEqual([
      ["Butikk Bergen", null],
      ["Butikk Oslo", `${HOST}/e/logo1`],
    ]);
    expect(page.total).toBe(2);
    expect(await readUnitEmployments(e("u1"), HOST, d)).toBe(12);
    expect(await readUnitEmployments(e("u2"), HOST, d)).toBe(3);
  });
  it("a unit the viewer may not read is not listed (and not named)", async () => {
    const page = await readOrgUnitsPage(HQ, HOST, {}, deps({ children: { hq: ["u1", "secret"] }, names: { u1: "Butikk Oslo" } }));
    expect(page.units.map((u) => u.name)).toEqual(["Butikk Oslo"]);
    expect(page.notListed).toBe(1);
    expect(JSON.stringify(page)).not.toContain("secret");
  });
  it("a count that could not be read is null (not known), ⛔ never 0", async () => {
    expect(await readUnitEmployments(e("u1"), HOST, deps({ children: { hq: ["u1"] }, names: { u1: "A" }, employees: { u1: "fail" } }))).toBeNull();
  });
  it("a head office with no units is an empty list, with a total of 0", async () => {
    const page = await readOrgUnitsPage(HQ, HOST, {}, deps({ children: {}, names: {} }));
    expect(page).toMatchObject({ units: [], total: 0, nextOffset: null });
  });
  it("names the next page while the find says there is more", async () => {
    const kids = Array.from({ length: 60 }, (_, i) => `k${String(i).padStart(2, "0")}`);
    const names = Object.fromEntries(kids.map((k) => [k, k]));
    const p1 = await readOrgUnitsPage(HQ, HOST, {}, deps({ children: { hq: kids }, names }));
    expect(p1.units).toHaveLength(50);
    expect(p1.nextOffset).toBe(50);
  });
});

describe("the units read is never a find key and writes nothing", () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("does not use the value plane and writes nothing", () => {
    expect(code).not.toMatch(/find-by-value|findByValue|networkFindKey|connect\//);
    expect(code).not.toMatch(/createRecord|patchRecord|deleteRecord|createResource|patchResource|deleteResource/);
  });
});
