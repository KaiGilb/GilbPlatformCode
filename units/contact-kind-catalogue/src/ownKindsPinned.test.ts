// The holder's own kinds against a fake host: what is asked of each host member and in what order, the refusals before any write, the
// fallback for the type's spelling, and the flags of an incomplete read. The vault is the in-memory one of `test/fakeVault.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as fake from "../test/fakeVault";

vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listVaultRecordsPage: (await import("../test/fakeVault")).listVaultRecordsPage,
}));
vi.mock("@kaigilb/gilbplatformcode-term-slots", async (importOriginal) => {
  const f = await import("../test/fakeVault");
  return { ...(await importOriginal<Record<string, unknown>>()), attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling };
});

import { OwnKindError, __resetOwnKindType, addOwnKind, readOwnEntryName, readOwnKinds, type OwnKindsHost } from "./ownKinds";
import { __resetCatalogueCache } from "./contactKindCatalogue";

const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const realList = fake.listVaultRecordsPage.getMockImplementation()!;

beforeEach(() => {
  fake.resetStore();
  fake.listVaultRecordsPage.mockImplementation(realList);
  resetTermOrigin();
  setTermOrigin("https://ontology.example.test");
  __resetCatalogueCache();
  __resetOwnKindType();
  fake.typeSpelling.mockImplementation(async (name: string) => `t:${name}`);
  fake.attributeSpelling.mockImplementation(async (name: string) => name);
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});

/** A host that records its calls and answers from the in-memory vault. */
function spyHost() {
  const calls: { member: string; args: unknown[] }[] = [];
  const host: OwnKindsHost = {
    createResource: (...args) => {
      calls.push({ member: "createResource", args });
      return fake.host.createResource(...args);
    },
    getResource: (...args) => {
      calls.push({ member: "getResource", args });
      return fake.host.getResource(...args);
    },
  };
  return { host, calls };
}

describe("addOwnKind: the write", () => {
  it("asks the host to create the record with the type, the label key and the playable key the ontology spelled", async () => {
    fake.typeSpelling.mockImplementation(async () => "t:KindSpelled");
    fake.attributeSpelling.mockImplementation(async (name: string) => `${name}Spelled`);
    const { host, calls } = spyHost();
    const made = await addOwnKind(host, { vaultId: VAULT, label: "  Godparent ", typeIri: `${M}/t/Person` });
    expect(calls).toEqual([
      {
        member: "createResource",
        args: [VAULT, { type: "t:KindSpelled", facts: { "a:labelSpelled": "Godparent", "a:playableBySpelled": { "@id": `${M}/t/Person` } } }],
      },
    ]);
    expect(fake.typeSpelling).toHaveBeenCalledWith("RelationshipKind");
    expect(fake.attributeSpelling.mock.calls.map((c) => c[0]).sort()).toEqual(["label", "playableBy"]);
    expect(made).toEqual({
      id: `${VAULT}/e/${[...store.keys()][0]}`,
      label: "Godparent",
      order: null,
      playableBy: [`${M}/t/Person`],
      axis: "relationshipKind",
      own: true,
    });
  });
  it("with no type it writes no playable fact and the entry is applicable to none named", async () => {
    const { host, calls } = spyHost();
    const made = await addOwnKind(host, { vaultId: VAULT, label: "Friend" });
    expect(calls[0]!.args[1]).toEqual({ type: "t:RelationshipKind", facts: { "a:label": "Friend" } });
    expect(made.playableBy).toEqual([]);
    expect(made.id).toBe(`${VAULT}/e/${[...store.keys()][0]}`);
  });
  it("refuses before any host call: no vault, a blank name", async () => {
    const { host, calls } = spyHost();
    await expect(addOwnKind(host, { vaultId: "", label: "x" })).rejects.toThrow(new OwnKindError("Refusing to write a kind with no vault named."));
    await expect(addOwnKind(host, { vaultId: VAULT, label: "   " })).rejects.toThrow("A kind needs a name.");
    expect(calls).toEqual([]);
    expect(store.size).toBe(0);
  });
  it("refuses when the ontology names neither the type nor a field, and writes nothing", async () => {
    const { host, calls } = spyHost();
    fake.typeSpelling.mockImplementation(async () => null as never);
    await expect(addOwnKind(host, { vaultId: VAULT, label: "x" })).rejects.toThrow(/The ontology did not name a relationship kind or its fields/);
    __resetOwnKindType();
    fake.typeSpelling.mockImplementation(async (name: string) => `t:${name}`);
    fake.attributeSpelling.mockImplementation(async (name: string) => (name === "playableBy" ? (null as never) : name));
    await expect(addOwnKind(host, { vaultId: VAULT, label: "x" })).rejects.toBeInstanceOf(OwnKindError);
    expect(calls).toEqual([]);
  });
  it("falls back to the type's own address, read once from the master, and keeps the answer", async () => {
    fake.typeSpelling.mockImplementation(async () => null as never);
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      seen.push(u);
      return Response.json({ "a:typeUri": `${M}/t/RelationshipKind` });
    });
    const { host, calls } = spyHost();
    await addOwnKind(host, { vaultId: VAULT, label: "a" });
    await addOwnKind(host, { vaultId: VAULT, label: "b" });
    expect(seen).toEqual([`${M}/t/RelationshipKind`]);
    expect((calls[0]!.args[1] as { type: string }).type).toBe("t:RelationshipKind");
  });
  it("a master that answers nothing usable is not kept as an answer: the next write asks again", async () => {
    fake.typeSpelling.mockImplementation(async () => null as never);
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return n === 1 ? new Response("{}", { status: 500 }) : Response.json({ "@id": `${M}/t/RelationshipKind` });
    });
    const { host } = spyHost();
    await expect(addOwnKind(host, { vaultId: VAULT, label: "a" })).rejects.toThrow(/ontology did not name/);
    await expect(addOwnKind(host, { vaultId: VAULT, label: "a" })).resolves.toMatchObject({ label: "a" });
    expect(n).toBe(2);
  });
  it("a master document whose type address is not under /t/ gives no type", async () => {
    fake.typeSpelling.mockImplementation(async () => null as never);
    vi.stubGlobal("fetch", async () => Response.json({ "@id": `${M}/e/odd` }));
    await expect(addOwnKind(spyHost().host, { vaultId: VAULT, label: "a" })).rejects.toThrow(/ontology did not name/);
  });
  it("a master that cannot be reached gives no type", async () => {
    fake.typeSpelling.mockImplementation(async () => null as never);
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await expect(addOwnKind(spyHost().host, { vaultId: VAULT, label: "a" })).rejects.toThrow(/ontology did not name/);
  });
});

describe("readOwnKinds: the read", () => {
  it("with no vault named it answers an empty whole read and asks nothing", async () => {
    const { host, calls } = spyHost();
    expect(await readOwnKinds(host, "")).toEqual({ entries: [], total: 0, totalIsFloor: false, complete: true });
    expect(fake.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
  it("asks the vault's typed list for RelationshipKind from offset 0, and each document of the list from the host with its address", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "Cousin", "a:labelOrder": 7, "a:playableBy": { "@id": `${M}/t/Person` } });
    const { host, calls } = spyHost();
    const r = await readOwnKinds(host, VAULT);
    expect(fake.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["RelationshipKind"], 0);
    const id = [...store.keys()][0]!;
    expect(calls).toEqual([{ member: "getResource", args: [id, VAULT, `${VAULT}/e/${id}`] }]);
    expect(r.entries).toEqual([{ id: `${VAULT}/e/${id}`, label: "Cousin", order: 7, playableBy: [`${M}/t/Person`], axis: "relationshipKind", own: true }]);
    expect(r).toMatchObject({ total: 1, totalIsFloor: false, complete: true });
  });
  it("a document the store says is gone is left out without making the read incomplete", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "Cousin" });
    const gone: OwnKindsHost = { ...fake.host, getResource: async () => ({ doc: {}, etag: null, gone: true }) };
    const r = await readOwnKinds(gone, VAULT);
    expect(r).toEqual({ entries: [], total: 1, totalIsFloor: false, complete: true });
  });
  it("a kind the host marks gone is left out whatever document it carries", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "Cousin" });
    const odd: OwnKindsHost = { ...fake.host, getResource: async () => ({ doc: { "a:label": "Still here" }, etag: null, gone: true }) };
    expect((await readOwnKinds(odd, VAULT)).entries).toEqual([]);
  });
  it("a document with no label is left out", async () => {
    fake.seed("t:RelationshipKind", { "a:note": "no label" });
    expect((await readOwnKinds(fake.host, VAULT)).entries).toEqual([]);
  });
  it("a host member that throws makes the answer incomplete and the others still count", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "One" });
    fake.seed("t:RelationshipKind", { "a:label": "Two" });
    let n = 0;
    const flaky: OwnKindsHost = {
      ...fake.host,
      getResource: (...a) => {
        if (++n === 1) throw new Error("boom");
        return fake.host.getResource(...a);
      },
    };
    const r = await readOwnKinds(flaky, VAULT);
    expect(r.entries.length).toBe(1);
    expect(r).toMatchObject({ total: 2, complete: false, totalIsFloor: false });
  });
  /** The platform's typed list as it answers: a page of 20, `complete: false` until the last page. */
  function paged(pageSize = 20): number[] {
    const offsets: number[] = [];
    fake.listVaultRecordsPage.mockImplementation(async (vault: string, types: readonly string[] = [], offset = 0) => {
      offsets.push(offset);
      const rows = [...store.entries()]
        .filter(([, e]) => e.type.replace(/^t:/, "") === (types[0] ?? ""))
        .map(([id, e]) => ({ id, entityUri: `${vault}/e/${id}`, typeUri: e.type, updatedAt: e.seq, label: null }));
      const page = rows.slice(offset, offset + pageSize);
      return { records: page, total: offset + page.length, complete: offset + page.length >= rows.length, pageSize, offset, served: page.length };
    });
    return offsets;
  }
  it("walks the pages after the first in waves of six, from the first page's own size", async () => {
    const offsets = paged();
    for (let i = 0; i < 200; i++) fake.seed("t:RelationshipKind", { "a:label": `K${i}` });
    const r = await readOwnKinds(fake.host, VAULT);
    expect(r).toMatchObject({ total: 200, complete: true, totalIsFloor: false });
    expect(offsets).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240]);
  });
  it("exactly the ceiling is a whole read; one more is a floor", async () => {
    paged();
    for (let i = 0; i < 500; i++) fake.seed("t:RelationshipKind", { "a:label": `K${i}` });
    expect(await readOwnKinds(fake.host, VAULT)).toMatchObject({ total: 500, complete: true });
    fake.seed("t:RelationshipKind", { "a:label": "one more" });
    const r = await readOwnKinds(fake.host, VAULT);
    expect(r.entries.length).toBe(500);
    expect(r).toMatchObject({ total: 501, complete: false });
  });
  it("when the list says it is complete on the first page, no second page is asked", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "One" });
    await readOwnKinds(fake.host, VAULT);
    expect(fake.listVaultRecordsPage).toHaveBeenCalledTimes(1);
  });
});

describe("readOwnEntryName", () => {
  it("reads the document by the tail of the address, at the address itself, and names it", async () => {
    const id = fake.seed("t:RelationshipKind", { "a:label": "Cousin", "a:labelOrder": 3 });
    const { host, calls } = spyHost();
    const uri = `${VAULT}/e/${id}`;
    expect(await readOwnEntryName(host, uri, VAULT)).toEqual({ label: "Cousin", order: 3, predicate: null });
    expect(calls).toEqual([{ member: "getResource", args: [id, VAULT, uri] }]);
  });
  it("a record the store says is gone is null", async () => {
    const gone: OwnKindsHost = { ...fake.host, getResource: async () => ({ doc: {}, etag: null, gone: true }) };
    expect(await readOwnEntryName(gone, `${VAULT}/e/x`, VAULT)).toBeNull();
  });
});
