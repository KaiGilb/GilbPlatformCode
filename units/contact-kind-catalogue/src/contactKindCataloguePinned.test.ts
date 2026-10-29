// The unit's exports pinned, beside the ported tests: the constants, the origin read at call time, the session caches (time and failure),
// the paging ceiling, each branch of an entry's reading, the ancestry walk, and the user-plane vocabulary read. The master is a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setCatalogForTest } from "@kaigilb/gilbplatformcode-lws-relations";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as unit from "./index";
import {
  CATALOGUE_TTL_MS,
  CATALOGUE_TYPE,
  CatalogueUnavailableError,
  __resetCatalogueCache,
  entryFromDoc,
  getJson,
  readEntryName,
  readMasterCatalogue,
  readMasterEntryName,
  readPredicateCurie,
  typeAncestry,
} from "./contactKindCatalogue";
import { MAX_OWN_KINDS, OWN_KIND_PARALLEL } from "./ownKinds";
import { USER_VOCAB_KEY, VocabUnreadableError, readHeaderVocab } from "./userVocab";

const ID = "https://ontology.example.test";
const M = `${ID}/base`;

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin(ID);
  __resetCatalogueCache();
});
afterEach(() => {
  vi.useRealTimers();
  __setCatalogForTest(null);
});

/** A fake fetch over a table of documents (any other url is a 404), recording every url. */
function table(docs: Record<string, unknown>) {
  const log: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    return url in docs ? Response.json(docs[url]) : new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, log };
}

describe("the export list and the constants", () => {
  it("the unit exports exactly the source's names", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CATALOGUE_TTL_MS", "CATALOGUE_TYPE", "CatalogueUnavailableError", "MAX_OWN_KINDS", "OWN_KIND_PARALLEL", "OwnKindError", "USER_VOCAB_KEY",
        "VocabUnreadableError", "__resetCatalogueCache", "__resetOwnKindType", "addOwnKind", "entryFromDoc", "getJson", "readEntryName",
        "readHeaderVocab", "readMasterCatalogue", "readMasterEntryName", "readOwnEntryName", "readOwnKinds", "readPredicateCurie", "typeAncestry",
      ].sort(),
    );
  });
  it("the constants are the app's", () => {
    expect(CATALOGUE_TYPE).toEqual({ circleLabel: "CircleLabel", relationshipKind: "RelationshipKind" });
    expect(CATALOGUE_TTL_MS).toBe(1_800_000);
    expect(MAX_OWN_KINDS).toBe(500);
    expect(OWN_KIND_PARALLEL).toBe(32);
    expect(USER_VOCAB_KEY).toEqual(["s5c-user-link-plane"]);
  });
  it("CatalogueUnavailableError names the axis in words and the reason", () => {
    const a = new CatalogueUnavailableError("circleLabel", "boom");
    expect(a.name).toBe("CatalogueUnavailableError");
    expect(a.message).toBe("The circle label list could not be read from the master (boom), so none is offered.");
    expect(new CatalogueUnavailableError("relationshipKind", "x").message).toMatch(/^The relationship kind list could not be read/);
  });
});

describe("the origin is read when a call is made, never when the module loads", () => {
  it("a catalogue read asks the origin that is set now", async () => {
    setTermOrigin("https://other.example.test");
    const m = table({ "https://other.example.test/base/search?type=CircleLabel&q=circle&vault=https%3A%2F%2Fother.example.test%2Fbase": { ids: [], complete: true } });
    const cat = await readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl });
    expect(cat).toEqual({ entries: [], complete: true });
    expect(m.log).toEqual(["https://other.example.test/base/search?type=CircleLabel&q=circle&vault=https%3A%2F%2Fother.example.test%2Fbase"]);
  });
  it("with no origin set the read fails with the setting's error, and the failure is not kept", async () => {
    resetTermOrigin();
    const m = table({});
    await expect(readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl })).rejects.toThrow(/setTermOrigin/);
    expect(m.log).toEqual([]);
    setTermOrigin(ID);
    const ok = table({ [`${M}/search?type=CircleLabel&q=circle&vault=${encodeURIComponent(M)}`]: { ids: [], complete: true } });
    await expect(readMasterCatalogue("circleLabel", { fetchImpl: ok.fetchImpl })).resolves.toEqual({ entries: [], complete: true });
  });
  it("a `base:e/<id>` reference is read at the origin that is set now", async () => {
    const m = table({ [`${M}/e/term1`]: { "a:typeAttribute": "t:CustomerOf" } });
    expect(await readPredicateCurie("base:e/term1", m.fetchImpl)).toBe("t:CustomerOf");
    expect(m.log).toEqual([`${M}/e/term1`]);
  });
});

describe("the catalogue is kept for the session, and only a good read is kept", () => {
  const searchUrl = `${M}/search?type=RelationshipKind&q=relationship&vault=${encodeURIComponent(M)}`;
  const docs = { [searchUrl]: { ids: [`${M}/e/k1`], complete: true }, [`${M}/e/k1`]: { "a:label": "Friend", "a:labelOrder": 2 } };

  it("is kept for 30 minutes and read again at 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const m = table(docs);
    await readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl });
    expect(m.log.length).toBe(2);
    vi.setSystemTime(Date.now() + CATALOGUE_TTL_MS - 1);
    await readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl });
    expect(m.log.length).toBe(2);
    vi.setSystemTime(Date.now() + 1);
    await readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl });
    expect(m.log.length).toBe(4);
  });

  it("a failed list read is not kept: the next call asks again", async () => {
    const bad = table({});
    await expect(readMasterCatalogue("relationshipKind", { fetchImpl: bad.fetchImpl })).rejects.toBeInstanceOf(CatalogueUnavailableError);
    const good = table(docs);
    const cat = await readMasterCatalogue("relationshipKind", { fetchImpl: good.fetchImpl });
    expect(cat.entries.map((e) => e.label)).toEqual(["Friend"]);
    expect(good.log.length).toBe(2);
  });

  it("the error says the status the master answered", async () => {
    const bad = table({});
    await expect(readMasterCatalogue("relationshipKind", { fetchImpl: bad.fetchImpl })).rejects.toThrow(`${searchUrl} answered 404`);
  });

  it("an entry read is made once per id even when the list repeats it", async () => {
    const m = table({ [searchUrl]: { ids: [`${M}/e/k1`, `${M}/e/k1`, 7], complete: true }, [`${M}/e/k1`]: docs[`${M}/e/k1`] });
    const cat = await readMasterCatalogue("relationshipKind", { fetchImpl: m.fetchImpl });
    expect(cat.entries.length).toBe(1);
    expect(m.log.filter((u) => u.endsWith("/e/k1")).length).toBe(1);
  });
});

describe("the list is walked at most five pages", () => {
  const base = `${M}/search?type=CircleLabel&q=circle&vault=${encodeURIComponent(M)}`;
  const page = (n: number) => (n === 0 ? base : `${base}&cursor=c${n}`);
  const pages = (count: number, last: Record<string, unknown> = {}) => {
    const docs: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) docs[page(i)] = { ids: [`${M}/e/p${i}`], next: i === count - 1 ? null : `c${i + 1}`, ...(i === count - 1 ? last : {}) };
    for (let i = 0; i < 9; i++) docs[`${M}/e/p${i}`] = { "a:label": `P${i}`, "a:labelOrder": i };
    return table(docs);
  };

  it("five pages that end are complete, and the cursor is passed on", async () => {
    const m = pages(5);
    const cat = await readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl });
    expect(cat.complete).toBe(true);
    expect(cat.entries.map((e) => e.label)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    expect(m.log.filter((u) => u.includes("/search?"))).toEqual([page(0), page(1), page(2), page(3), page(4)]);
  });
  it("a sixth page is not asked: the answer is a floor", async () => {
    const m = pages(7);
    const cat = await readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl });
    expect(cat.complete).toBe(false);
    expect(cat.entries.length).toBe(5);
    expect(m.log.filter((u) => u.includes("/search?")).length).toBe(5);
  });
  it("a last page that says `complete: false` makes a floor", async () => {
    const m = pages(2, { complete: false });
    expect((await readMasterCatalogue("circleLabel", { fetchImpl: m.fetchImpl })).complete).toBe(false);
  });
});

describe("entryFromDoc, branch by branch", () => {
  const read = (doc: Record<string, unknown>, docs: Record<string, unknown> = {}, own = false) => {
    const m = table(docs);
    return entryFromDoc(m.fetchImpl, "relationshipKind", `${M}/e/x`, doc, own).then((e) => ({ e, log: m.log }));
  };

  it("an entry with no label is null, and a blank label is null", async () => {
    expect((await read({})).e).toBeNull();
    expect((await read({ "a:label": "  " })).e).toBeNull();
  });
  it("reads the label trimmed, from the `a:` key or the bare key, from a value object or a list", async () => {
    expect((await read({ "a:label": "  Friend " })).e?.label).toBe("Friend");
    expect((await read({ label: "Friend" })).e?.label).toBe("Friend");
    expect((await read({ "a:label": { "@value": "Friend" } })).e?.label).toBe("Friend");
    expect((await read({ "a:label": ["First", "Second"] })).e?.label).toBe("First");
  });
  it("the order is a number, a numeric string, or null", async () => {
    expect((await read({ "a:label": "L", "a:labelOrder": 3 })).e?.order).toBe(3);
    expect((await read({ "a:label": "L", "a:labelOrder": "4" })).e?.order).toBe(4);
    expect((await read({ "a:label": "L", "a:labelOrder": "" })).e?.order).toBeNull();
    expect((await read({ "a:label": "L", "a:labelOrder": "x" })).e?.order).toBeNull();
    expect((await read({ "a:label": "L" })).e?.order).toBeNull();
  });
  it("carries the id, the axis and the own flag", async () => {
    expect((await read({ "a:label": "L" }, {}, true)).e).toMatchObject({ id: `${M}/e/x`, axis: "relationshipKind", own: true, playableBy: [] });
    expect((await read({ "a:label": "L" })).e?.own).toBe(false);
  });
  it("an applicability that is a type address is kept as it is; an entity reference is resolved to its type; an unresolved one stays the reference", async () => {
    const { e, log } = await read(
      { "a:label": "L", "a:playableBy": [{ "@id": `${M}/t/Person` }, { "@id": `${M}/e/ent1` }, { "@id": `${M}/e/ent2` }, `${M}/t/Org`] },
      { [`${M}/e/ent1`]: { typeUri: `${M}/t/Resolved` } },
    );
    expect(e?.playableBy).toEqual([`${M}/t/Person`, `${M}/t/Resolved`, `${M}/e/ent2`, `${M}/t/Org`]);
    expect(log).toEqual([`${M}/e/ent1`, `${M}/e/ent2`]);
  });
  it("a reference to an entity is read at its `base:e/` address on the master", async () => {
    const { e, log } = await read({ "a:label": "L", "a:playableBy": "base:e/ent9" }, { [`${M}/e/ent9`]: { "a:typeUri": `${M}/t/Nine` } });
    expect(e?.playableBy).toEqual([`${M}/t/Nine`]);
    expect(log).toEqual([`${M}/e/ent9`]);
  });
  it("the predicate is the CURIE read from its term, or null when the term does not read; none named is absent", async () => {
    const ok = await read({ "a:label": "L", "a:kindPredicate": { "@id": "base:e/p1" } }, { [`${M}/e/p1`]: { "a:typeAttribute": "t:FriendOf" } });
    expect(ok.e?.kindPredicate).toEqual({ curie: "t:FriendOf" });
    const bad = await read({ "a:label": "L", "a:kindPredicate": { "@id": "base:e/p2" } });
    expect(bad.e?.kindPredicate).toBeNull();
    expect("kindPredicate" in (await read({ "a:label": "L" })).e!).toBe(false);
  });
  it("the kinds of vault are resolved like the applicability, and absent when none is named", async () => {
    const { e } = await read({ "a:label": "L", "a:kindForVault": [{ "@id": `${M}/t/Org` }, { "@id": `${M}/e/v1` }] }, {});
    expect(e?.kindForVault).toEqual([`${M}/t/Org`, `${M}/e/v1`]);
    expect("kindForVault" in (await read({ "a:label": "L" })).e!).toBe(false);
  });
  it("an entity reference that did not resolve is asked again on the next entry, one that resolved is not", async () => {
    const m = table({ [`${M}/e/good`]: { typeUri: `${M}/t/Good` } });
    const one = (ref: string) => entryFromDoc(m.fetchImpl, "relationshipKind", "id", { "a:label": "L", "a:playableBy": { "@id": ref } }, false);
    await one(`${M}/e/bad`);
    await one(`${M}/e/bad`);
    await one(`${M}/e/good`);
    await one(`${M}/e/good`);
    expect(m.log).toEqual([`${M}/e/bad`, `${M}/e/bad`, `${M}/e/good`]);
  });
  it("a reference given twice is read once", async () => {
    const { e } = await read({ "a:label": "L", "a:playableBy": [{ "@id": `${M}/t/Person` }, { "@id": `${M}/t/Person` }] });
    expect(e?.playableBy).toEqual([`${M}/t/Person`]);
  });
});

describe("a single entry's name and a predicate's CURIE", () => {
  it("readEntryName gives the label, the order and the predicate, and keeps a good read for 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const read = vi.fn(async () => ({ "a:label": " Friend ", "a:labelOrder": "2", "a:kindPredicate": { "@id": "base:e/p1" } }));
    expect(await readEntryName("id1", read)).toEqual({ label: "Friend", order: 2, predicate: "base:e/p1" });
    await readEntryName("id1", read);
    expect(read).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + CATALOGUE_TTL_MS);
    await readEntryName("id1", read);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("no label, a failed read: null, and neither is kept", async () => {
    const noLabel = vi.fn(async () => ({}));
    expect(await readEntryName("id2", noLabel)).toBeNull();
    expect(await readEntryName("id2", noLabel)).toBeNull();
    expect(noLabel).toHaveBeenCalledTimes(2);
    const boom = vi.fn(async () => {
      throw new Error("x");
    });
    expect(await readEntryName("id3", boom)).toBeNull();
    await readEntryName("id3", boom);
    expect(boom).toHaveBeenCalledTimes(2);
  });
  it("an order that is not a number is null; a missing predicate is null", async () => {
    expect(await readEntryName("id4", async () => ({ "a:label": "L", "a:labelOrder": "z" }))).toEqual({ label: "L", order: null, predicate: null });
  });
  it("readMasterEntryName reads the address it is given", async () => {
    const m = table({ [`${M}/e/k9`]: { "a:label": "Nine" } });
    expect(await readMasterEntryName(`${M}/e/k9`, m.fetchImpl)).toEqual({ label: "Nine", order: null, predicate: null });
    expect(m.log).toEqual([`${M}/e/k9`]);
  });
  it("readPredicateCurie takes a single `t:` CURIE of letters and digits only", async () => {
    for (const [value, want] of [["t:Foo9", "t:Foo9"], ["t:9Foo", null], ["t:Foo Bar", null], ["Foo", null], ["t:Foo.Bar", null]] as const) {
      __resetCatalogueCache();
      const m = table({ [`${M}/e/t1`]: { "a:typeAttribute": value } });
      expect(await readPredicateCurie("base:e/t1", m.fetchImpl)).toBe(want);
    }
  });
  it("a good CURIE is kept; a failed read is asked again", async () => {
    const m = table({ [`${M}/e/ok`]: { typeAttribute: "t:Kept" } });
    await readPredicateCurie("base:e/ok", m.fetchImpl);
    await readPredicateCurie("base:e/ok", m.fetchImpl);
    await readPredicateCurie("base:e/no", m.fetchImpl);
    await readPredicateCurie("base:e/no", m.fetchImpl);
    expect(m.log).toEqual([`${M}/e/ok`, `${M}/e/no`, `${M}/e/no`]);
  });
  it("an absolute reference is read where it points", async () => {
    const m = table({ "https://elsewhere.example.test/e/t": { "a:typeAttribute": "t:There" } });
    expect(await readPredicateCurie("https://elsewhere.example.test/e/t", m.fetchImpl)).toBe("t:There");
  });
});

describe("getJson", () => {
  it("asks with `no-cache` and the JSON accept header, and throws the url and the status", async () => {
    const seen: RequestInit[] = [];
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init!);
      return new Response("{}", { status: 503 });
    }) as typeof fetch;
    await expect(getJson(f, "https://x.example.test/a")).rejects.toThrow("https://x.example.test/a answered 503");
    expect(seen[0]).toEqual({ cache: "no-cache", headers: { accept: "application/ld+json, application/json" } });
  });
});

describe("typeAncestry", () => {
  it("is cached per type, and a type with no parent is itself only", async () => {
    const m = table({ [`${M}/t/A`]: {} });
    expect([...(await typeAncestry(`${M}/t/A`, { fetchImpl: m.fetchImpl }))]).toEqual([`${M}/t/A`]);
    await typeAncestry(`${M}/t/A`, { fetchImpl: m.fetchImpl });
    expect(m.log.length).toBe(1);
  });
  it("a failed read is asked again next time", async () => {
    const m = table({});
    await typeAncestry(`${M}/t/Z`, { fetchImpl: m.fetchImpl });
    await typeAncestry(`${M}/t/Z`, { fetchImpl: m.fetchImpl });
    expect(m.log.length).toBe(2);
  });
  it("stops on a type it has seen, after reading each type once", async () => {
    const m = table({ [`${M}/t/A`]: { "a:subTypeOf": { "@id": `${M}/t/B` } }, [`${M}/t/B`]: { "a:subTypeOf": { "@id": `${M}/t/A` } } });
    expect([...(await typeAncestry(`${M}/t/A`, { fetchImpl: m.fetchImpl }))]).toEqual([`${M}/t/A`, `${M}/t/B`]);
    expect(m.log).toEqual([`${M}/t/A`, `${M}/t/B`]);
  });
  it("climbs at most twelve steps", async () => {
    const docs: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) docs[`${M}/t/T${i}`] = { "a:subTypeOf": { "@id": `${M}/t/T${i + 1}` } };
    const m = table(docs);
    const set = await typeAncestry(`${M}/t/T0`, { fetchImpl: m.fetchImpl });
    expect(set.size).toBe(13);
    expect(m.log.length).toBe(12);
  });
});

describe("readHeaderVocab", () => {
  const term = { curie: "t:FriendOf" } as never;
  it("an empty stale answer is a failure, never `no terms`", async () => {
    __setCatalogForTest({ plane: "user", terms: [], roots: [], stale: true, excludedUnwritable: [] });
    await expect(readHeaderVocab()).rejects.toBeInstanceOf(VocabUnreadableError);
    await expect(readHeaderVocab()).rejects.toThrow("The GilbVeda vocabulary could not be read.");
  });
  it("a stale answer that holds terms, and a fresh empty one, are answers", async () => {
    const stale = { plane: "user" as const, terms: [term], roots: [], stale: true, excludedUnwritable: [] };
    __setCatalogForTest(stale);
    expect(await readHeaderVocab()).toBe(stale);
    const fresh = { plane: "user" as const, terms: [], roots: [], stale: false, excludedUnwritable: [] };
    __setCatalogForTest(fresh);
    expect(await readHeaderVocab()).toBe(fresh);
  });
});
