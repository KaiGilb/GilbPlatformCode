// Ported from `gilb-stakeholders` `test/kindReader-m3k-r2.test.ts` at 27fe0cef: 10 of its 10 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, forgetStakeholderKindReaders, kindLabelOf, stakeholderKindReader, type StakeholderKindSet } from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG, t } from "../test/support";


const KEY = `gilb-stakeholders.kind-set.v1:${RIG}`;

function memoryStore(): VocabularyStore & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>();
  const s = {
    data,
    writes: 0,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      s.writes += 1;
      data.set(k, v);
    },
  };
  return s;
}

function harness() {
  let now = 7_000_000;
  const queued: { fn: () => void; ms: number }[] = [];
  return {
    now: () => now,
    advance: (ms: number) => void (now += ms),
    defer: (fn: () => void, ms: number) => void queued.push({ fn, ms }),
    queued,
    async flush() {
      while (queued.length) queued.shift()!.fn();
      for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
    },
  };
}

type Master = ReturnType<typeof fixtureMaster>;
const readerOn = (m: Master, store: VocabularyStore | null, h = harness()) =>
  createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG, store, now: h.now, defer: h.defer });

/** The words fail on this master: the named read answers 503 and so does each given term's own address. */
function wordsFail(m: Master, names: string[]) {
  const real = m.fetch;
  m.fetch = async (url, init) => {
    if (url.includes("/base/vocab?status=all&type=")) {
      m.requested.push(url);
      return new Response("{}", { status: 503 });
    }
    return real(url, init);
  };
  for (const n of names) m.status.set(`${RIG}/base/t/${n}`, 503);
}

beforeEach(() => forgetStakeholderKindReaders());

describe("F1 a check never loses a word it holds", () => {
  it("a check that finds a NEW kind while one held player's word fails: the new kind is adopted, the held word kept, one call", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    h.advance(11 * 60_000);
    const m = fixtureMaster();
    m.children("Person", [
      { name: "Passenger", label: "Passenger" },
      { name: "Visitor", label: "Visitor" },
    ]);
    m.children("Visitor", []);
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await h.flush();
    expect(seen.length).toBe(1);
    expect(r.peek()!.names.length).toBe(11);
    expect(kindLabelOf(r.peek(), "t:Visitor")).toBe("Visitor");
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect(Object.keys(r.peek()!.labels).length).toBe(11);
    const stored = JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet };
    expect(stored.set.labels[t("Organization")]).toBe("Organization");
    expect(stored.set.names.length).toBe(11);
  });

  it("a cold read with an unread word is answered, but not kept in the store (it is not complete)", async () => {
    const store = memoryStore();
    const h = harness();
    const m0 = fixtureMaster();
    m0.status.set(`${RIG}/base/t/Organization`, 503);
    // Cold, with Organization's word unread: answered, but not kept (it is not complete).
    const cold = await readerOn(m0, store, h).get();
    expect(kindLabelOf(cold, "t:Organization")).toBeNull();
    expect(cold.names.length).toBe(10);
    expect(store.data.has(KEY)).toBe(false);
    expect(store.writes).toBe(0);
  });

  it("a cold read with an unread word is checked again once in the background, and the complete answer is kept and told", async () => {
    const store = memoryStore();
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    expect(kindLabelOf(await r.get(), "t:Organization")).toBeNull();
    for (let i = 0; i < 50; i++) await r.get();
    expect(h.queued.length).toBe(1);
    m.status.delete(`${RIG}/base/t/Organization`);
    await h.flush();
    expect(seen.length).toBe(1);
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect(store.writes).toBe(1);
    // Fresh now: no further check in the session.
    for (let i = 0; i < 50; i++) await r.get();
    expect(h.queued.length).toBe(0);
  });

  it("the cold read's second try fails too: the set in hand stays, no call, no write, and no retry until another max age", async () => {
    const store = memoryStore();
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await r.get();
    await h.flush();
    expect(seen.length).toBe(0);
    expect(store.writes).toBe(0);
    expect(r.peek()!.names.length).toBe(10);
    const after = m.requested.length;
    for (let i = 0; i < 100; i++) await r.get();
    expect(h.queued.length).toBe(0);
    expect(m.requested.length).toBe(after);
    h.advance(10 * 60_000);
    await r.get();
    expect(h.queued.length).toBe(1);
  });

  it("every word fails during a check and the master is otherwise unchanged: 10 words kept, 0 calls, the stored set unchanged", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    const before = store.data.get(KEY);
    const writes = store.writes;
    h.advance(11 * 60_000);
    const m = fixtureMaster();
    wordsFail(m, ["Person", "Organization", "PartyGroup", "PartyMemberOf", "SoftwareSystem", "SoftwareSystemGroup", "SoftwareSystemMemberOf"]);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await h.flush();
    expect(seen.length).toBe(0);
    expect(Object.keys(r.peek()!.labels).length).toBe(10);
    // Every held word could be kept, so the check is complete and unchanged: re-dated, the set itself the same.
    const after = JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet };
    expect(after.set).toEqual((JSON.parse(before!) as { set: StakeholderKindSet }).set);
    expect(store.writes).toBe(writes + 1);
  });

  it("an explicit check() whose word fails with no word in hand rejects and leaves the held set", async () => {
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, null, h);
    const first = await r.get();
    await expect(r.check()).rejects.toThrow(/Organization/);
    expect(r.peek()).toBe(first);
  });
});

describe("F2 a kept entry of the wrong shape is ignored, and kindLabelOf never throws", () => {
  const goodEntry = async () => {
    const s = memoryStore();
    await readerOn(fixtureMaster(), s).get();
    return JSON.parse(s.data.get(KEY)!) as { v: number; origin: string; checkedAt: number; set: StakeholderKindSet };
  };

  it("each broken shape makes a cold read (15 requests)", async () => {
    const e = await goodEntry();
    const ty = e.set.types[0]!;
    const bads: unknown[] = [
      { ...e.set, types: [null] },
      { ...e.set, types: ["t:Person"] },
      { ...e.set, types: [{ ...ty, term: "" }] },
      { ...e.set, types: [{ ...ty, name: 7 }] },
      { ...e.set, types: [{ ...ty, label: 7 }] },
      { ...e.set, names: [""] },
      { ...e.set, names: [null] },
      { ...e.set, labels: { [t("Person")]: 7 } },
      { ...e.set, labels: [] },
      { ...e.set, labels: null },
      { ...e.set, createShortcuts: [null] },
      { ...e.set, members: "Person" },
    ];
    for (const set of bads) {
      const s = memoryStore();
      s.data.set(KEY, JSON.stringify({ ...e, set }));
      const m = fixtureMaster();
      const r = readerOn(m, s);
      expect(r.peek()).toBeNull();
      expect((await r.get()).names.length).toBe(10);
      expect(m.requested.length).toBe(15);
    }
  });

  it("kindLabelOf on junk answers null, never throws", () => {
    const junk = [{ types: [null] }, { types: "x" }, { types: [{ name: 1 }] }, {}, { types: [7, "a"] }] as unknown as StakeholderKindSet[];
    for (const set of junk) {
      expect(() => kindLabelOf(set, "t:Person")).not.toThrow();
      expect(kindLabelOf(set, "t:Person")).toBeNull();
    }
    expect(kindLabelOf({ types: [{ name: "Person", label: 7 }] } as unknown as StakeholderKindSet, "t:Person")).toBeNull();
    expect(kindLabelOf({ types: [] }, 42 as unknown as string)).toBeNull();
  });
});

describe("F3 only an http(s) origin is a master origin", () => {
  for (const bad of ["file:///", "file:///etc", "data:text/plain,x", "javascript:alert(1)", "blob:https://ontology.platform.example.test/x", "ftp://ontology.platform.example.test", "null"])
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(() => stakeholderKindReader({ vedaOrigin: bad, store: null })).toThrow(/master's origin/);
    });
  it("accepts http and https", () => {
    expect(() => stakeholderKindReader({ vedaOrigin: "http://localhost:5301", store: null })).not.toThrow();
    expect(() => stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test", store: null })).not.toThrow();
  });
});

describe("F4 a trailing slash on a type address", () => {
  it("finds the word for /base/t/X/, /base/t/X//, t:X/ and X/", async () => {
    const set = await readerOn(fixtureMaster(), null).get();
    expect(kindLabelOf(set, "https://alice.platform.example.test/base/t/PartyGroup/")).toBe("Party Group");
    expect(kindLabelOf(set, "https://alice.platform.example.test/base/t/PartyGroup//")).toBe("Party Group");
    expect(kindLabelOf(set, "t:PartyGroup/")).toBe("Party Group");
    expect(kindLabelOf(set, "PartyGroup/")).toBe("Party Group");
    expect(kindLabelOf(set, "/")).toBeNull();
  });
});
