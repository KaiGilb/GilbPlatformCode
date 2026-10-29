// A page of units is the unit RECORDS and nothing more; a unit's employment count is its own lazy read. What a 200-unit organization pays for its first page is measured here by counting the finds.
import "../test/origins";
import { describe, expect, it } from "vitest";
import { readOrgUnitsPage, readUnitEmployments, type UnitsDeps } from "./orgUnits";
import type { OrgRead } from "./orgRecords";

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;
const HQ = e("hq");

function world(n: number) {
  const kids = Array.from({ length: n }, (_, i) => `u${String(i).padStart(3, "0")}`);
  const log = { parentFinds: [] as { limit: number; offset: number }[], employerFinds: [] as string[], reads: [] as string[] };
  const deps: UnitsDeps = {
    parentAttr: async () => "a:parentOrganization",
    employerAttr: async () => "a:employer",
    find: async (attr, value, page) => {
      const target = (value as { "@id": string })["@id"];
      if (attr === "a:parentOrganization") {
        log.parentFinds.push({ limit: page.limit, offset: page.offset });
        if (!target.includes("/base/e/")) return { count: 0, ids: [] };
        return { count: kids.length, ids: kids.slice(page.offset, page.offset + page.limit).map(e) };
      }
      log.employerFinds.push(target);
      return { count: target.includes("/base/e/") ? 7 : 0, ids: [] };
    },
    readOrg: async (uri): Promise<OrgRead> => {
      log.reads.push(uri);
      return { state: "ok", uri, name: `Org ${uri.split("/").pop()}`, logo: null, parent: HQ, parentCount: 1 };
    },
  };
  return { deps, log };
}

describe("a page of units makes NO count find", () => {
  it("200 units, a page of 10: one parent find per spelling, ten record reads, zero employer finds", async () => {
    const { deps, log } = world(200);
    const page = await readOrgUnitsPage(HQ, HOST, { limit: 10 }, deps);
    expect(page.units).toHaveLength(10);
    expect(page.total).toBe(200);
    expect(page.nextOffset).toBe(10);
    expect(log.employerFinds).toEqual([]);
    expect(log.reads).toHaveLength(10);
    expect(log.parentFinds.every((f) => f.limit === 10)).toBe(true);
  });
  it("a default page (50) makes no count find either", async () => {
    const { deps, log } = world(200);
    await readOrgUnitsPage(HQ, HOST, {}, deps);
    expect(log.employerFinds).toEqual([]);
    expect(log.reads).toHaveLength(50);
  });
  it("a unit carries no count field at all (a count comes only from its own read)", async () => {
    const { deps } = world(3);
    const page = await readOrgUnitsPage(HQ, HOST, {}, deps);
    for (const u of page.units) expect(Object.keys(u).sort()).toEqual(["id", "logo", "name", "uri"]);
  });
});

describe("readUnitEmployments: one unit, two finds (both spellings, together)", () => {
  it("asks exactly the two spellings of that unit and adds them", async () => {
    const { deps, log } = world(3);
    expect(await readUnitEmployments(e("u001"), HOST, deps)).toBe(7);
    expect(log.employerFinds.sort()).toEqual([e("u001"), "https://v.example.test/vault/e/u001"].sort());
  });
});
