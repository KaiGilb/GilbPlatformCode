import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNTYPED_FIND, type VaultRecordRef } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { searchPlanRecords, searchVaults } from "./planSearch";
import { setUp, tearDown } from "../test/support";
import { baseRow, entityUri, fakeDoor, VAULT } from "../test/rows";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

const A = "https://a.platform.example.test/vault";
const B = "https://b.platform.example.test/vault";

function ref(id: string, over: Partial<VaultRecordRef> = {}): VaultRecordRef {
  return { id, entityUri: entityUri(id), typeUri: "t:Value", updatedAt: 1, label: "", etag: '"e"', ...over } as VaultRecordRef;
}

describe("searchVaults", () => {
  it("blank vaults or an empty list of type names is nothing, and asks nothing", async () => {
    const search = vi.fn();
    expect(await searchVaults(["  ", ""], "x", ["Value"], { search })).toEqual({ hits: [], complete: false, vaultsMissed: false });
    expect(await searchVaults([A], "x", [], { search })).toEqual({ hits: [], complete: false, vaultsMissed: false });
    expect(search).not.toHaveBeenCalled();
  });
  it("asks each vault once, trimmed and without repeats, with the text trimmed and the prefix match", async () => {
    const search = vi.fn(async () => ({ ids: [], next: null }));
    await searchVaults([` ${A} `, A, B], "  Speed ", [" Value ", "Value", ""], { search: search as never });
    expect(search.mock.calls.map((c) => c.slice(0, 5))).toEqual([
      ["Speed", ["Value"], undefined, A, "prefix"],
      ["Speed", ["Value"], undefined, B, "prefix"],
    ]);
  });
  it("null type names search with no type filter and keep a hit of any type", async () => {
    const search = vi.fn(async () => ({ ids: [entityUri("a")], next: null }));
    const read = async () => baseRow("a", { label: "Anything" });
    const out = await searchVaults([A], "x", null, { search: search as never, read });
    expect((search.mock.calls[0] as unknown[])[1]).toBe(UNTYPED_FIND);
    expect(out.hits.map((h) => h.label)).toEqual(["Anything"]);
  });
  it("drops a row of another type, sorts by label then address, and a dropped row does not make the answer incomplete", async () => {
    const rows = [baseRow("b", { label: "Same" }), baseRow("a", { label: "Same" }), baseRow("c", { label: "Alpha" }), { ...baseRow("d", { label: "Other" }), typeUri: "t:Note" }];
    const search = async () => ({ ids: rows.map((r) => r.entityUri!), next: null });
    const out = await searchVaults([A], "x", ["SpecificationElement"], { search: search as never, read: async (id) => rows.find((r) => r.id === id) ?? null });
    expect(out.hits.map((h) => h.id)).toEqual(["c", "a", "b"]);
    expect(out.complete).toBe(true);
  });
  it("a custom toHit decides the hit; null drops it without making the answer incomplete", async () => {
    const out = await searchVaults([A], "x", ["SpecificationElement"], {
      search: (async () => ({ ids: [entityUri("a"), entityUri("b")], next: null })) as never,
      read: async (id) => baseRow(id, { label: id }),
      toHit: (row, uri, id) => (id === "a" ? null : { uri, id, label: "custom", tag: "", typeName: "T", row }),
    });
    expect(out.hits.map((h) => h.label)).toEqual(["custom"]);
    expect(out.complete).toBe(true);
  });
  it("a read that throws is a missing row and not a failure of the search", async () => {
    const out = await searchVaults([A], "x", ["SpecificationElement"], {
      search: (async () => ({ ids: [entityUri("a"), entityUri("b")], next: null })) as never,
      read: async (id) => {
        if (id === "a") throw new Error("down");
        return baseRow(id, { label: "B" });
      },
    });
    expect(out.hits.map((h) => h.id)).toEqual(["b"]);
    expect(out.complete).toBe(false);
    expect(out.vaultsMissed).toBe(false);
  });
  it("a row with no facts is named by the tail of its address", async () => {
    const empty = { ...baseRow("a"), entityUri: "" };
    const out = await searchVaults([A], "x", ["SpecificationElement"], {
      search: (async () => ({ ids: ["https://h.example.test/base/e/tail-id"], next: null })) as never,
      read: async () => empty,
    });
    expect(out.hits.map((h) => [h.id, h.uri, h.label])).toEqual([["a", "https://h.example.test/base/e/tail-id", "tail-id"]]);
  });
});

describe("searchPlanRecords from the list (an empty box)", () => {
  it("keeps the rows of the picker's types, once each, sorted, with the label of a row that came without a body", async () => {
    const list = vi.fn(async () => ({
      records: [ref("b", { label: "Beta" }), ref("a", { label: "Alpha" }), ref("a", { label: "Alpha again" }), ref("n", { typeUri: "t:Note", label: "Note" }), ref("x", { label: "" })],
      complete: true,
    }));
    const out = await searchPlanRecords(VAULT, "", ["Value"], { list: list as never });
    expect(out.hits.map((h) => [h.id, h.label])).toEqual([["a", "Alpha"], ["b", "Beta"], ["x", "x"]]);
    expect(out.complete).toBe(true);
    expect(list).toHaveBeenCalledWith(VAULT, ["Value"], 0, { includeBody: true, limit: 50 });
  });
  it("without a list option it asks the vault's own list page", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json({ records: [], total: 0, complete: true, pageSize: 50 });
    });
    const out = await searchPlanRecords(VAULT, " ", ["Value"]);
    expect(out).toEqual({ hits: [], complete: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/records");
    expect(calls[0]).toContain("limit=50");
  });
});

describe("searchPlanRecords with an exact tag and a client", () => {
  function tagDoor(found: string[], docs: Record<string, { body: Record<string, unknown>; etag?: string }>) {
    const door = fakeDoor(docs);
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/base/find-by-attribute")) {
        urls.push(url);
        return Response.json({ count: found.length, ids: found });
      }
      return door.fetchMock(input);
    });
    return { urls, reads: door.reads };
  }
  const search = async () => ({ ids: [], next: null });

  it("finds a:unitTag at the vault's own origin with limit 1, reads that one id, and puts the hit first", async () => {
    const door = tagDoor([entityUri("speed")], { speed: { body: { "a:unitTag": "Walk.Speed" } } });
    const out = await searchPlanRecords(VAULT, "Walk.Speed", ["SpecificationElement"], { qc: new QueryClient(), search: search as never });
    expect(door.urls).toHaveLength(1);
    const u = new URL(door.urls[0]!);
    expect(u.origin).toBe("https://plan.platform.example.test");
    expect(u.searchParams.get("attr")).toBe("a:unitTag");
    expect(u.searchParams.get("value")).toBe("Walk.Speed");
    expect(u.searchParams.get("limit")).toBe("1");
    expect(door.reads).toEqual(["speed"]);
    expect(out.hits.map((h) => h.tag)).toEqual(["Walk.Speed"]);
    expect(out.complete).toBe(true);
  });
  it("no record with that tag is no hit and still complete", async () => {
    const door = tagDoor([], {});
    const out = await searchPlanRecords(VAULT, "Nope.Tag", ["SpecificationElement"], { qc: new QueryClient(), search: search as never });
    expect(out).toEqual({ hits: [], complete: true });
    expect(door.reads).toEqual([]);
  });
  it("a tag whose record will not read makes the answer not complete", async () => {
    tagDoor([entityUri("gone")], {});
    const out = await searchPlanRecords(VAULT, "Gone.Tag", ["SpecificationElement"], { qc: new QueryClient(), search: search as never });
    expect(out).toEqual({ hits: [], complete: false });
  });
  it("the exact hit is not listed twice when the search also returned it", async () => {
    tagDoor([entityUri("speed")], { speed: { body: { "a:unitTag": "Walk.Speed" } } });
    const row = baseRow("speed", { unitTag: "Walk.Speed" });
    const out = await searchPlanRecords(VAULT, "Walk.Speed", ["SpecificationElement"], {
      qc: new QueryClient(),
      search: (async () => ({ ids: [entityUri("speed"), entityUri("other")], next: null })) as never,
      read: async (id) => (id === "speed" ? row : baseRow(id, { unitTag: "Walk.Other" })),
    });
    expect(out.hits.map((h) => h.id)).toEqual(["speed", "other"]);
  });
  it("a search that cannot reach a vault throws, so the picker shows its error line", async () => {
    await expect(
      searchPlanRecords(VAULT, "Speed", ["Value"], {
        search: (async () => {
          throw new Error("down");
        }) as never,
      }),
    ).rejects.toThrow("Could not search");
  });
});
