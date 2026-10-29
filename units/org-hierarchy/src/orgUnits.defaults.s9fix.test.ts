// At the DEFAULT wiring: with the real default dependencies, every find the units group makes (units, unit counts) reaches `findByAttribute`
// with the VAULT's host as its origin, never the apex. (The app's test of this also drove the employees group; that half is `org-employees`'s.)
import "../test/origins";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finds = vi.hoisted(() => ({ calls: [] as { attr: string; value: unknown; page: unknown; origin: unknown }[] }));
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()),
  findByAttribute: vi.fn(async (attr: string, value: unknown, page: unknown, origin?: unknown) => {
    finds.calls.push({ attr, value, page, origin });
    return { count: 0, ids: [] };
  }),
}));
vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>()),
  attributeSpelling: vi.fn(async (n: string) => n),
}));

// eslint-disable-next-line import/first
import { readOrgUnitsPage, readUnitEmployments } from "./orgUnits";
// eslint-disable-next-line import/first
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
// eslint-disable-next-line import/first
import { __resetEmploymentLinkVocab, __resetOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";

const HOST = "https://v.example.test/base";
beforeEach(() => {
  finds.calls.length = 0;
  __resetOrgTerms();
  __resetEmploymentLinkVocab();
});

describe("the default finds are asked at the vault's host", () => {
  it("units: the parent finds (the page has no unit, so no count find)", async () => {
    await readOrgUnitsPage(`${HOST}/e/org1`, HOST);
    expect(finds.calls.length).toBe(2);
    expect(new Set(finds.calls.map((c) => c.origin))).toEqual(new Set([vaultOriginOf(HOST)]));
  });
});

describe("the default wiring, pinned", () => {
  it("the parent finds ask the master's spelling of a:parentOrganization, with the organization as an {@id} value, once per address spelling", async () => {
    await readOrgUnitsPage(`${HOST}/e/org1`, HOST);
    expect(finds.calls.map((c) => c.attr)).toEqual(["a:parentOrganization", "a:parentOrganization"]);
    expect(finds.calls.map((c) => (c.value as { "@id": string })["@id"]).sort()).toEqual(["https://v.example.test/base/e/org1", "https://v.example.test/vault/e/org1"]);
  });
  it("a unit's count asks the employer spelling of org-terms ('a:employer') under both address spellings, at the vault's host, one record each", async () => {
    expect(await readUnitEmployments(`${HOST}/e/u1`, HOST)).toBe(0);
    expect(finds.calls.map((c) => c.attr)).toEqual(["a:employer", "a:employer"]);
    expect(finds.calls.map((c) => c.page)).toEqual([{ limit: 1, offset: 0 }, { limit: 1, offset: 0 }]);
    expect(new Set(finds.calls.map((c) => c.origin))).toEqual(new Set([vaultOriginOf(HOST)]));
  });
});
