// The organization type address was a constant built when the module loaded; it is now read from the term-origin setting when it is used.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import "../test/origins";
import { findOrganizationRecords, organizationTypeUri } from "./orgRecords";

const HOST = "https://v.example.test/base";
beforeEach(() => setTermOrigin("https://onto.example.test"));
afterEach(() => setTermOrigin("https://onto.example.test"));

describe("organizationTypeUri", () => {
  it("is the organization type under the ontology origin that is set NOW, not the one set when the module loaded", async () => {
    expect(organizationTypeUri()).toBe("https://onto.example.test/base/t/Organization");
    setTermOrigin("https://other-onto.example.test");
    expect(organizationTypeUri()).toBe("https://other-onto.example.test/base/t/Organization");
  });
  it("throws the setting's error when no origin is set (it never falls back to a host)", async () => {
    resetTermOrigin();
    expect(() => organizationTypeUri()).toThrow(/term-origin: call setTermOrigin/);
  });
});

describe("findOrganizationRecords reads the setting when it asks", () => {
  it("a typed search asks for the type name 'Organization' whichever origin is set, and fails with the setting's error when none is", async () => {
    const search = vi.fn(async () => ({ total: null, ids: [], next: null }));
    await findOrganizationRecords(HOST, "x", { search: search as never, read: vi.fn() as never });
    expect(search).toHaveBeenCalledWith("x", ["Organization"], undefined, HOST, "prefix");
    setTermOrigin("https://other-onto.example.test");
    await findOrganizationRecords(HOST, "x", { search: search as never, read: vi.fn() as never });
    expect(search).toHaveBeenLastCalledWith("x", ["Organization"], undefined, HOST, "prefix");
    resetTermOrigin();
    await expect(findOrganizationRecords(HOST, "x", { search: search as never, read: vi.fn() as never })).rejects.toThrow(/term-origin/);
  });
  it("the list without text asks for the type name 'Organization' and keeps only records of that type under whichever origin is set", async () => {
    const row = (id: string, typeUri: string) => ({ id, entityUri: `${HOST}/e/${id}`, typeUri, label: id, updatedAt: null });
    const list = vi.fn(async () => ({ records: [row("a", "https://other-onto.example.test/base/t/Organization"), row("b", "https://other-onto.example.test/base/t/Person")], total: 2, complete: true, pageSize: 20, offset: 0 }));
    setTermOrigin("https://other-onto.example.test");
    const r = await findOrganizationRecords(HOST, "", { list: list as never });
    expect(list).toHaveBeenCalledWith(HOST, ["Organization"], 0);
    expect(r.hits.map((h) => h.label)).toEqual(["a"]);
  });
});

describe("loading the module", () => {
  it("reads no origin: the module loads while none is set (a fresh copy of both modules)", async () => {
    vi.resetModules();
    const origin = await import("@kaigilb/gilbplatformcode-term-origin");
    expect(() => origin.termOrigin()).toThrow(/term-origin: call setTermOrigin/);
    await expect(import("./orgRecords")).resolves.toHaveProperty("organizationTypeUri");
  });
});
