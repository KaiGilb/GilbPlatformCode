// Reading one organization record, and choosing organization RECORDS.
import "../test/origins";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => {
  const real = await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>();
  return { ...real, attributeSpelling: vi.fn(async (n: string) => n) };
});

// eslint-disable-next-line import/first
import { findOrganizationRecords, organizationParentReader, readOrganization } from "./orgRecords";
// eslint-disable-next-line import/first
import { __resetOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;

beforeEach(() => __resetOrgTerms());

const rec = (facts: Record<string, string>, served?: Record<string, unknown>) => async () => ({ facts, served: { facts: served ?? facts } });

describe("readOrganization", () => {
  it("reads the name, the logo and the parent", async () => {
    const r = await readOrganization(e("a"), rec({ name: "Butikk AS", logo: e("img"), parentOrganization: e("hq") }));
    expect(r).toMatchObject({ state: "ok", name: "Butikk AS", logo: e("img"), parent: e("hq"), parentCount: 1 });
  });
  it("reads a parent held as an {@id} link", async () => {
    const r = await readOrganization(e("a"), rec({ name: "B" }, { parentOrganization: { "@id": e("hq") } }));
    expect(r).toMatchObject({ state: "ok", parent: e("hq"), parentCount: 1 });
  });
  it("a record that does not read (null or an error) is unreadable, never an empty organization", async () => {
    expect(await readOrganization(e("a"), async () => null)).toEqual({ state: "unreadable" });
    expect(
      await readOrganization(e("a"), async () => {
        throw new Error("403");
      }),
    ).toEqual({ state: "unreadable" });
  });
  it("no parent is a head office: parent null, count 0", async () => {
    expect(await readOrganization(e("a"), rec({ name: "B" }))).toMatchObject({ state: "ok", parent: null, parentCount: 0 });
  });
});

describe("organizationParentReader", () => {
  it("hands the walker the parent and the name", async () => {
    const read = organizationParentReader(rec({ name: "Butikk", parentOrganization: e("hq") }));
    expect(await read(e("a"))).toEqual({ state: "ok", parent: e("hq"), label: "Butikk" });
  });
  it("a record holding TWO parents is unreadable (which is 'the' parent is not known: none is taken)", async () => {
    const read = organizationParentReader(rec({ name: "B" }, { parentOrganization: [{ "@id": e("x") }, { "@id": e("y") }] }));
    expect(await read(e("a"))).toEqual({ state: "unreadable" });
  });
  it("an unreadable record is unreadable to the walker", async () => {
    expect(await organizationParentReader(async () => null)(e("a"))).toEqual({ state: "unreadable" });
  });
});

describe("findOrganizationRecords", () => {
  const row = (id: string, label: string, typeUri = "https://onto.example.test/base/t/Organization", vault = HOST) => ({
    id,
    entityUri: `${vault}/e/${id}`,
    typeUri,
    label,
    updatedAt: null,
  });
  it("offers the vault's own organization records (no text typed: one page of the list), sorted", async () => {
    const list = vi.fn(async () => ({
      records: [row("b", "Butikk AS"), row("c", "Kaffe AS"), row("d", "Butikk Nord", "https://onto.example.test/base/t/Person"), row("f", "Butikk Far", undefined, "https://other.example.test/base")],
      total: 4,
      complete: true,
      pageSize: 20,
      offset: 0,
    }));
    const r = await findOrganizationRecords(HOST, "", { list: list as never });
    expect(r.hits.map((h) => h.label)).toEqual(["Butikk AS", "Kaffe AS"]);
    expect(r.complete).toBe(true);
    expect(list).toHaveBeenCalledWith(HOST, ["Organization"], 0);
  });
  it("says it is not complete when the walk stopped before the list said it had no more", async () => {
    const list = vi.fn(async () => ({ records: [row("b", "Butikk AS")], total: 99, complete: false, pageSize: 1, offset: 0 }));
    const r = await findOrganizationRecords(HOST, "", { list: list as never, maxPages: 3 });
    expect(r.complete).toBe(false);
    expect(list).toHaveBeenCalledTimes(3);
  });
});
