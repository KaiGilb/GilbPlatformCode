// The units reader: both address spellings in the count, finds asked together, at the vault's host, and a page of unreadable units that still names the next page.
import "../test/origins";
import { describe, expect, it } from "vitest";
import { turn } from "../test/timing";
import { readOrgUnitsPage, readUnitEmployments, type UnitsDeps } from "./orgUnits";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import type { OrgRead } from "./orgRecords";

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;
const v = (id: string) => `https://v.example.test/vault/e/${id}`;
const HQ = e("hq");

interface Log {
  finds: { attr: string; value: string; origin: string }[];
  inflight: { now: number; max: number };
  /** In flight at once among the EMPLOYER (count) finds only. */
  countInflight: { now: number; max: number };
}

function deps(opts: { children: string[]; employments: Record<string, { base: number; vault: number }>; failCount?: string }, log: Log = { finds: [], inflight: { now: 0, max: 0 }, countInflight: { now: 0, max: 0 } }): UnitsDeps {
  return {
    parentAttr: async () => "a:parentOrganization",
    employerAttr: async () => "a:employer",
    find: async (attr, value, page, origin) => {
      const target = (value as { "@id": string })["@id"];
      log.finds.push({ attr, value: target, origin });
      log.inflight.now++;
      log.inflight.max = Math.max(log.inflight.max, log.inflight.now);
      if (attr === "a:employer") {
        log.countInflight.now++;
        log.countInflight.max = Math.max(log.countInflight.max, log.countInflight.now);
      }
      await turn();
      log.inflight.now--;
      if (attr === "a:employer") log.countInflight.now--;
      const id = target.split("/").pop()!;
      if (attr === "a:parentOrganization") {
        if (!target.includes("/base/e/")) return { count: 0, ids: [] };
        return { count: opts.children.length, ids: opts.children.slice(page.offset, page.offset + page.limit).map(e) };
      }
      if (opts.failCount === id) throw new Error("503");
      const n = opts.employments[id] ?? { base: 0, vault: 0 };
      return { count: target.includes("/base/e/") ? n.base : n.vault, ids: [] };
    },
    readOrg: async (uri): Promise<OrgRead> => ({ state: "ok", uri, name: `Org ${uri.split("/").pop()}`, logo: null, parent: HQ, parentCount: 1 }),
  };
}

describe("the unit's employment count asks BOTH address spellings", () => {
  it("adds an employment written with the /vault/e/ spelling to the one written with /base/e/", async () => {
    expect(await readUnitEmployments(e("u1"), HOST, deps({ children: ["u1"], employments: { u1: { base: 3, vault: 1 } } }))).toBe(4);
  });
  it("counts the vault-spelling-only case too", async () => {
    expect(await readUnitEmployments(e("u1"), HOST, deps({ children: ["u1"], employments: { u1: { base: 0, vault: 2 } } }))).toBe(2);
  });
  it("a count that failed on EITHER spelling is not known (null), never a partial number", async () => {
    expect(await readUnitEmployments(e("u1"), HOST, deps({ children: ["u1"], employments: { u1: { base: 3, vault: 1 } }, failCount: "u1" }))).toBeNull();
  });
  it("asks the two spellings of the count together (not one after the other)", async () => {
    const log: Log = { finds: [], inflight: { now: 0, max: 0 }, countInflight: { now: 0, max: 0 } };
    await readUnitEmployments(e("u1"), HOST, deps({ children: ["u1"], employments: {} }, log));
    expect(log.countInflight.max).toBeGreaterThanOrEqual(2);
    const employerFinds = log.finds.filter((f) => f.attr === "a:employer").map((f) => f.value).sort();
    expect(employerFinds).toEqual([e("u1"), v("u1")].sort());
  });
});

describe("the units finds are asked at the VAULT's host, never the apex", () => {
  it("every find, the parent finds and the count finds, goes to vaultOriginOf(vaultId)", async () => {
    const log: Log = { finds: [], inflight: { now: 0, max: 0 }, countInflight: { now: 0, max: 0 } };
    const d = deps({ children: ["u1", "u2"], employments: {} }, log);
    await readOrgUnitsPage(HQ, HOST, {}, d);
    await readUnitEmployments(e("u1"), HOST, d);
    await readUnitEmployments(e("u2"), HOST, d);
    expect(log.finds.length).toBeGreaterThanOrEqual(6);
    expect(new Set(log.finds.map((f) => f.origin))).toEqual(new Set([vaultOriginOf(HOST)]));
  });
});

describe("a page of units none of which the reader may read still names the next page", () => {
  it("returns no units, notListed, and the next offset", async () => {
    const d = deps({ children: Array.from({ length: 120 }, (_, i) => `u${i}`), employments: {} });
    const unreadable: UnitsDeps = { ...d, readOrg: async (uri) => (Number(uri.split("/").pop()!.slice(1)) < 100 ? { state: "unreadable" } : d.readOrg(uri)) };
    const p1 = await readOrgUnitsPage(HQ, HOST, { limit: 50 }, unreadable);
    expect(p1.units).toEqual([]);
    expect(p1.notListed).toBe(50);
    expect(p1.nextOffset).toBe(50);
    const p3 = await readOrgUnitsPage(HQ, HOST, { offset: 100, limit: 50 }, unreadable);
    expect(p3.units).toHaveLength(20);
  });
});
