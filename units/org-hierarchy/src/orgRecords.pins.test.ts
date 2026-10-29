// More pins on the organization reads: the order of the hits, the shape of the answers and what is passed to the reader.
import "../test/origins";
import { describe, expect, it, vi } from "vitest";
import { findOrganizationRecords, organizationParentReader, readOrganization } from "./orgRecords";
import { __resetOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>()),
  attributeSpelling: vi.fn(async (n: string) => n),
}));

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;
const TYPE = "https://onto.example.test/base/t/Organization";
const row = (id: string, label: string, typeUri = TYPE) => ({ id, entityUri: e(id), typeUri, label, updatedAt: null });

describe("findOrganizationRecords", () => {
  it("lists in name order (the list, no text typed)", async () => {
    const list = vi.fn(async () => ({ records: [row("z", "Zeta AS"), row("a", "Alpha AS"), row("m", "Midt AS")], total: 3, complete: true, pageSize: 20, offset: 0 }));
    const r = await findOrganizationRecords(HOST, "", { list: list as never });
    expect(r.hits.map((h) => h.label)).toEqual(["Alpha AS", "Midt AS", "Zeta AS"]);
  });
  it("lists in name order (a typed search)", async () => {
    __resetOrgTerms();
    const names: Record<string, string> = { a: "Zeta AS", b: "Alpha AS" };
    const read = vi.fn(async (id: string) => ({ id, typeUri: TYPE, facts: { name: names[id]! } }));
    const search = vi.fn(async () => ({ total: null, ids: [e("a"), e("b")], next: null }));
    const r = await findOrganizationRecords(HOST, "as", { search: search as never, read: read as never });
    expect(r.hits.map((h) => h.label)).toEqual(["Alpha AS", "Zeta AS"]);
  });
  it("reads each hit once by its id and address, and a hit named twice is read once", async () => {
    const read = vi.fn(async (id: string) => ({ id, typeUri: TYPE, facts: { name: "Nordlys AS" } }));
    const search = vi.fn(async () => ({ total: null, ids: [e("a"), e("a")], next: null }));
    const r = await findOrganizationRecords(HOST, "nord", { search: search as never, read: read as never });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("a", e("a"));
    expect(r.hits).toEqual([{ uri: e("a"), label: "Nordlys AS" }]);
  });
  it("trims the typed text before it is searched, and an all-space text is the list", async () => {
    const search = vi.fn(async () => ({ total: null, ids: [], next: null }));
    const list = vi.fn(async () => ({ records: [], total: 0, complete: true, pageSize: 20, offset: 0 }));
    await findOrganizationRecords(HOST, "  nord  ", { search: search as never, list: list as never });
    expect(search).toHaveBeenCalledWith("nord", ["Organization"], undefined, HOST, "prefix");
    await findOrganizationRecords(HOST, "   ", { search: search as never, list: list as never });
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("a list record with no label or an address in another vault is not offered", async () => {
    const list = vi.fn(async () => ({
      records: [row("a", "Alpha AS"), row("b", "   "), { ...row("c", "Other AS"), entityUri: "https://other.example.test/base/e/c" }],
      total: 3, complete: true, pageSize: 20, offset: 0,
    }));
    const r = await findOrganizationRecords(HOST, "", { list: list as never });
    expect(r.hits.map((h) => h.label)).toEqual(["Alpha AS"]);
  });
  it("walks pages by the number served, and stops when a page serves none", async () => {
    const list = vi.fn(async (_v: string, _t: string[], offset: number) => ({ records: [], total: 99, complete: false, pageSize: 20, offset, served: 0 }));
    const r = await findOrganizationRecords(HOST, "", { list: list as never, maxPages: 5 });
    expect(list).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ hits: [], complete: false });
    const list2 = vi.fn(async (_v: string, _t: string[], offset: number) => ({ records: [row(`r${offset}`, `R${offset}`)], total: 99, complete: false, pageSize: 20, offset, served: 7 }));
    await findOrganizationRecords(HOST, "", { list: list2 as never, maxPages: 3 });
    expect(list2.mock.calls.map((c) => c[2])).toEqual([0, 7, 14]);
  });
});

describe("readOrganization and the parent reader", () => {
  it("passes the id and the address to the reader", async () => {
    __resetOrgTerms();
    const read = vi.fn(async () => ({ facts: { name: "A" } }));
    await readOrganization(e("a"), read);
    expect(read).toHaveBeenCalledWith("a", e("a"));
  });
  it("takes the served facts when there are some, else the record's own", async () => {
    __resetOrgTerms();
    expect(await readOrganization(e("a"), async () => ({ facts: { name: "A", parentOrganization: e("x") }, served: { facts: { parentOrganization: { "@id": e("y") } } } }))).toMatchObject({ parent: e("y") });
    expect(await readOrganization(e("a"), async () => ({ facts: { name: "A", parentOrganization: e("x") } }))).toMatchObject({ parent: e("x") });
  });
  it("the first of several parents is the one named, and the count says there are several", async () => {
    __resetOrgTerms();
    const r = await readOrganization(e("a"), async () => ({ facts: { name: "A" }, served: { facts: { parentOrganization: [{ "@id": e("x") }, { "@id": e("y") }] } } }));
    expect(r).toMatchObject({ state: "ok", parent: e("x"), parentCount: 2 });
    expect(await organizationParentReader(async () => ({ facts: { name: "A" }, served: { facts: { parentOrganization: [e("x"), e("y")] } } }))(e("a"))).toEqual({ state: "unreadable" });
  });
  it("a record with a logo and a name gives them; no name is null", async () => {
    __resetOrgTerms();
    expect(await readOrganization(e("a"), async () => ({ facts: {}, served: { facts: { logo: { "@id": e("img") } } } }))).toEqual({ state: "ok", uri: e("a"), name: null, logo: e("img"), parent: null, parentCount: 0 });
  });
});
