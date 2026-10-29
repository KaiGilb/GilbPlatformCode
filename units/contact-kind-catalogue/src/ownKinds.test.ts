// The holder's OWN relationship kinds are read whole (or SAY they are not), side by side, and a kind is named by
// its address on demand. The host's two vault-record calls are the fake host over the in-memory vault of `test/fakeVault.ts`; the vault list
// and the term spellings of the two peers are the same fakes, put in place of the peers.
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

import { addOwnKind, MAX_OWN_KINDS, OWN_KIND_PARALLEL, readOwnEntryName, readOwnKinds, __resetOwnKindType } from "./ownKinds";
import { __resetCatalogueCache } from "./contactKindCatalogue";

const { VAULT, store, host } = fake;
const M = "https://ontology.example.test/base";

/** The platform's typed list as it really answers: a page of 20, `complete: false` until the last, `total` the whole. */
function paged(pageSize = 20) {
  const calls: number[] = [];
  fake.listVaultRecordsPage.mockImplementation(async (vault: string, types: readonly string[] = [], offset = 0) => {
    calls.push(offset);
    const want = types[0] ?? "";
    const rows = [...store.entries()]
      .filter(([, e]) => e.type.replace(/^t:/, "") === want)
      .sort(([, a], [, b]) => b.seq - a.seq)
      .map(([id, e]) => ({ id, entityUri: `${vault}/e/${id}`, typeUri: e.type, updatedAt: e.seq, label: null }));
    const page = rows.slice(offset, offset + pageSize);
    // as the platform really answers (MEASURED, 200 kinds): `total` is only the rows up to this page, `complete` is false until the last one
    return { records: page, total: offset + page.length, complete: offset + page.length >= rows.length, pageSize, offset, served: page.length };
  });
  return calls;
}
const seedKinds = (n: number) => {
  for (let i = 1; i <= n; i++) fake.seed("t:RelationshipKind", { "a:label": `Own kind ${String(i).padStart(3, "0")}`, "a:playableBy": { "@id": `${M}/t/Person` } });
};

beforeEach(() => {
  fake.resetStore();
  resetTermOrigin();
  setTermOrigin("https://ontology.example.test");
  __resetCatalogueCache();
  __resetOwnKindType();
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});

describe("the holder's own kinds are read whole", () => {
  it("51 own kinds: all 51 are named, not 50", async () => {
    paged();
    seedKinds(51);
    const r = await readOwnKinds(host, VAULT);
    expect(r.entries.length).toBe(51);
    expect(r).toMatchObject({ total: 51, totalIsFloor: false, complete: true });
    expect(r.entries.map((e) => e.label)).toContain("Own kind 001");
  });

  it("200 own kinds (the pages of 20 and the documents are read, none lost)", async () => {
    const offsets = paged();
    seedKinds(200);
    const r = await readOwnKinds(host, VAULT);
    expect(r.entries.length).toBe(200);
    expect(new Set(r.entries.map((e) => e.id)).size).toBe(200);
    expect(r).toMatchObject({ total: 200, totalIsFloor: false, complete: true });
    // every page the list has is asked; the walk goes in waves, so at most one wave of empty pages is asked past the end (the total is unknown until the last page)
    expect(offsets).toEqual(expect.arrayContaining(Array.from({ length: 10 }, (_, i) => i * 20)));
    expect(offsets.length).toBeLessThanOrEqual(10 + 6);
  });

  it("past the ceiling the answer SAYS so: the floor is returned with the true total and complete is false", async () => {
    paged(20);
    seedKinds(MAX_OWN_KINDS + 20);
    const r = await readOwnKinds(host, VAULT);
    expect(r.entries.length).toBe(MAX_OWN_KINDS);
    expect(r.total).toBe(MAX_OWN_KINDS + 20);
    expect(r.complete).toBe(false);
  });

  it("a list longer than the app will walk says 'more than': the total is a floor, never a made-up exact number", async () => {
    paged(20);
    seedKinds(2100);
    const r = await readOwnKinds(host, VAULT);
    expect(r.entries.length).toBe(MAX_OWN_KINDS);
    expect(r.totalIsFloor).toBe(true);
    expect(r.complete).toBe(false);
    expect(r.total).toBeGreaterThanOrEqual(MAX_OWN_KINDS);
  });

  it("the documents are read SIDE BY SIDE and bounded, never one after another", async () => {
    paged();
    seedKinds(120);
    let inFlight = 0;
    let peak = 0;
    const real = fake.readRecord.getMockImplementation()!;
    fake.readRecord.mockImplementation(async (id: string, at: string | null) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      try {
        return await real(id, at);
      } finally {
        inFlight--;
      }
    });
    const r = await readOwnKinds(host, VAULT);
    expect(r.entries.length).toBe(120);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(OWN_KIND_PARALLEL);
    fake.readRecord.mockImplementation(real);
  });

  it("a kind that did not read makes the answer incomplete, not silently shorter", async () => {
    paged();
    seedKinds(5);
    const real = fake.readRecord.getMockImplementation()!;
    let n = 0;
    fake.readRecord.mockImplementation(async (id: string, at: string | null) => {
      if (++n === 2) throw new Error("boom");
      return real(id, at);
    });
    const r = await readOwnKinds(host, VAULT);
    expect(r.entries.length).toBe(4);
    expect(r).toMatchObject({ total: 5, complete: false });
    fake.readRecord.mockImplementation(real);
  });

  it("no own kind: one list request, nothing else", async () => {
    paged();
    const r = await readOwnKinds(host, VAULT);
    expect(r).toEqual({ entries: [], total: 0, totalIsFloor: false, complete: true });
    expect(fake.listVaultRecordsPage).toHaveBeenCalledTimes(1);
    expect(fake.readRecord).not.toHaveBeenCalled();
  });
});

describe("one own kind is named by its address", () => {
  it("a kind far down the list is named by one read, without the list", async () => {
    paged();
    seedKinds(120);
    const id = [...store.keys()][100]!;
    const uri = `${VAULT}/e/${id}`;
    fake.listVaultRecordsPage.mockClear();
    fake.readRecord.mockClear();
    const n = await readOwnEntryName(host, uri, VAULT);
    expect(n?.label).toBe("Own kind 101");
    expect(fake.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(fake.readRecord).toHaveBeenCalledTimes(1);
    await readOwnEntryName(host, uri, VAULT); // kept
    expect(fake.readRecord).toHaveBeenCalledTimes(1);
  });
  it("a kind that is gone is `null`, never a made-up name", async () => {
    expect(await readOwnEntryName(host, `${VAULT}/e/06gk000000000000000000nope`, VAULT)).toBeNull();
  });
});

describe("a kind of their own can be WRITTEN", () => {
  it("falls back to the type's own address when the master names no a:typeAttribute", async () => {
    fake.typeSpelling.mockImplementation((async () => null) as unknown as (name: string) => Promise<string>);
    vi.stubGlobal("fetch", async () => Response.json({ "@id": `${M}/t/RelationshipKind`, "a:typeUri": `${M}/t/RelationshipKind`, "a:label": "Relationship Kind" }));
    const made = await addOwnKind(host, { vaultId: VAULT, label: "Godparent", typeIri: `${M}/t/Person` });
    const written = [...store.values()].filter((e) => e.type === "t:RelationshipKind");
    expect(written.length).toBe(1);
    expect(made.label).toBe("Godparent");
    fake.typeSpelling.mockImplementation(async (name: string) => `t:${name}`);
  });
  it("a master that did not answer writes nothing, and says so", async () => {
    fake.typeSpelling.mockImplementation((async () => null) as unknown as (name: string) => Promise<string>);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await expect(addOwnKind(host, { vaultId: VAULT, label: "Godparent" })).rejects.toThrow(/ontology did not name/);
    expect(store.size).toBe(0);
    fake.typeSpelling.mockImplementation(async (name: string) => `t:${name}`);
  });
});
