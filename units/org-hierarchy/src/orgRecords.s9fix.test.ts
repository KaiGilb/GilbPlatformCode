// The organization chooser asks the SERVER to match the typed words (one typed search) instead of walking 19 pages of the list on every keystroke, and so reaches organization 401 and beyond.
import "../test/origins";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => {
  const real = await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>();
  return { ...real, attributeSpelling: vi.fn(async (n: string) => n) };
});

// eslint-disable-next-line import/first
import { findOrganizationRecords } from "./orgRecords";
// eslint-disable-next-line import/first
import { __resetOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;
const TYPE = "https://onto.example.test/base/t/Organization";
beforeEach(() => __resetOrgTerms());

const names: Record<string, string> = { org450: "Nordlys Holding AS", org451: "Nordlys Bergen", notorg: "Nordlys Person" };
const reader = vi.fn(async (id: string) => (id in names ? { id, entityUri: e(id), typeUri: id === "notorg" ? "https://onto.example.test/base/t/Person" : TYPE, facts: { name: names[id]! }, served: { facts: { name: names[id]! } } } : null));
const searcher = (ids: string[], next: string | null = null) => vi.fn(async () => ({ total: null, ids, next }));

describe("typed text is matched by the server", () => {
  it("makes ONE typed search (type Organization, prefix match, at the vault) and reads only the hits", async () => {
    reader.mockClear();
    const search = searcher([e("org450"), e("org451")]);
    const list = vi.fn();
    const r = await findOrganizationRecords(HOST, "nordlys", { search: search as never, read: reader as never, list: list as never });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("nordlys", ["Organization"], undefined, HOST, "prefix");
    expect(list).not.toHaveBeenCalled();
    expect(reader).toHaveBeenCalledTimes(2);
    expect(r.hits.map((h) => h.label)).toEqual(["Nordlys Bergen", "Nordlys Holding AS"]);
    expect(r.complete).toBe(true);
  });
  it("reaches an organization that would be record 450 of the list (the old walk stopped at 400)", async () => {
    const search = searcher([e("org450")]);
    const r = await findOrganizationRecords(HOST, "holding", { search: search as never, read: reader as never, list: vi.fn() as never });
    expect(r.hits.map((h) => h.uri)).toEqual([e("org450")]);
  });
  it("a search with no hit says 'complete' (the server looked everywhere), unlike a partial walk", async () => {
    const r = await findOrganizationRecords(HOST, "zzz", { search: searcher([]) as never, read: reader as never, list: vi.fn() as never });
    expect(r).toEqual({ hits: [], complete: true });
  });
  it("when the search says there is a next page the answer is NOT complete", async () => {
    const r = await findOrganizationRecords(HOST, "nordlys", { search: searcher([e("org450")], "cursor1") as never, read: reader as never, list: vi.fn() as never });
    expect(r.complete).toBe(false);
  });
  it("a hit in another vault, a record that does not read, and a record that is not an organization are not offered", async () => {
    const search = searcher([e("org450"), "https://other.example.test/base/e/org451", e("gone"), e("notorg")]);
    const r = await findOrganizationRecords(HOST, "nordlys", { search: search as never, read: reader as never, list: vi.fn() as never });
    expect(r.hits.map((h) => h.uri)).toEqual([e("org450")]);
  });
  it("a failed search is an error, never 'no match'", async () => {
    const search = vi.fn(async () => {
      throw new Error("Search could not reach your vault");
    });
    await expect(findOrganizationRecords(HOST, "x", { search: search as never, read: reader as never, list: vi.fn() as never })).rejects.toThrow(/could not reach/);
  });
});

describe("with no text typed the chooser reads ONE page of the list, not the whole vault", () => {
  it("one list page; not complete unless the list says so", async () => {
    const row = { id: "a", entityUri: e("a"), typeUri: TYPE, label: "Alpha AS", updatedAt: null };
    const list = vi.fn(async () => ({ records: [row], total: 99, complete: false, pageSize: 20, offset: 0 }));
    const search = vi.fn();
    const r = await findOrganizationRecords(HOST, "", { list: list as never, search: search as never });
    expect(list).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    expect(r.hits.map((h) => h.label)).toEqual(["Alpha AS"]);
    expect(r.complete).toBe(false);
  });
});
