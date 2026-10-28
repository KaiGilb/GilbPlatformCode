// Ported from `gilb-stakeholders` `test/qa-c214-m3k-s85.test.ts` at 27fe0cef: 20 of its 20 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, forgetStakeholderKindReaders, kindLabelOf, stakeholderKindReader, type StakeholderKindSet } from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG, t } from "../test/support";


const KEY = `gilb-stakeholders.kind-set.v1:${RIG}`;

function memoryStore(): VocabularyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function harness() {
  let now = 5_000_000;
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

function readerOn(m: ReturnType<typeof fixtureMaster>, store: VocabularyStore | null, h = harness()) {
  return createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG, store, now: h.now, defer: h.defer });
}

/** A good set kept in `store`, 11 minutes old at `h`'s clock. */
async function keptStale(store: VocabularyStore, h: ReturnType<typeof harness>) {
  const good = await readerOn(fixtureMaster(), store, h).get();
  h.advance(11 * 60_000);
  return good;
}

beforeEach(() => forgetStakeholderKindReaders());

describe("S85-1 a failed background check never wipes a good set", () => {
  it("the words' reads fail during the check (named read and each player's own term 503): the kept words stay", async () => {
    const store = memoryStore();
    const h = harness();
    const good = await keptStale(store, h);
    expect(good.labels[t("Person")]).toBe("Person");
    expect(Object.keys(good.labels).length).toBe(10);
    const m = fixtureMaster();
    // Only the words fail; the role, the predicates and the listings still answer.
    const realFetch = m.fetch;
    m.fetch = async (url, init) => {
      if (url.includes("/base/vocab?status=all&type=")) {
        m.requested.push(url);
        return new Response("{}", { status: 503 });
      }
      return realFetch(url, init);
    };
    for (const p of ["Person", "Organization", "PartyGroup", "PartyMemberOf", "SoftwareSystem", "SoftwareSystemGroup", "SoftwareSystemMemberOf"])
      m.status.set(`${RIG}/base/t/${p}`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await h.flush();
    expect.soft(Object.keys(r.peek()!.labels).length).toBe(10);
    expect.soft(r.peek()!.labels[t("Person")]).toBe("Person");
    expect.soft(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect.soft(seen.length).toBe(0);
    const stored = JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet };
    expect.soft(Object.keys(stored.set.labels).length).toBe(10);
  });

  it("ONE player's own term fails during the check (named read answers it absent, its own read 503): its kept word stays", async () => {
    const store = memoryStore();
    const h = harness();
    await keptStale(store, h);
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await h.flush();
    expect.soft(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect.soft(seen.length).toBe(0);
    const stored = JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet };
    expect.soft(stored.set.labels[t("Organization")]).toBe("Organization");
  });

  it("a children listing that fails during the check: the set is kept (the walk throws)", async () => {
    const store = memoryStore();
    const h = harness();
    await keptStale(store, h);
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization/children`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await h.flush();
    expect(r.peek()!.names.length).toBe(10);
    expect(r.peek()!.complete).toBe(true);
    expect(seen.length).toBe(0);
  });
});

describe("S85-2 new and removed kinds reach subscribers within the session", () => {
  it("a removed kind (Passenger gone from its parent's listing) leaves the set and every subscriber is told once", async () => {
    const store = memoryStore();
    const h = harness();
    const good = await keptStale(store, h);
    expect(good.names).toContain("Passenger");
    const parentOf = good.types.find((k) => k.name === "Passenger")!.parents[0]!;
    const parentName = parentOf.split("/").pop()!;
    const m = fixtureMaster();
    const listing = m.docs.get(`${RIG}/base/t/${parentName}/children`) as { children: { name: string }[] };
    listing.children = listing.children.filter((c) => c.name !== "Passenger");
    const r = readerOn(m, store, h);
    const a: StakeholderKindSet[] = [];
    const b: StakeholderKindSet[] = [];
    r.subscribe((s) => a.push(s));
    const off = r.subscribe((s) => b.push(s));
    off();
    await r.get();
    await h.flush();
    expect(a.length).toBe(1);
    expect(b.length).toBe(0);
    expect(a[0]!.names).not.toContain("Passenger");
    expect(r.peek()!.names.length).toBe(9);
    expect(kindLabelOf(r.peek(), "t:Passenger")).toBeNull();
  });
});

describe("S85-3 no request storms", () => {
  it("cold: 40 doors and 200 gets at once cost one read (15 requests on the fixture)", async () => {
    const m = fixtureMaster();
    const r = readerOn(m, memoryStore());
    await Promise.all(Array.from({ length: 200 }, () => r.get()));
    expect(m.requested.length).toBe(15);
  });

  it("stale: 500 gets and 100 subscribers schedule ONE background check; after it, 0 requests", async () => {
    const store = memoryStore();
    const h = harness();
    await keptStale(store, h);
    const m = fixtureMaster();
    const r = readerOn(m, store, h);
    for (let i = 0; i < 100; i++) r.subscribe(() => {});
    for (let i = 0; i < 500; i++) await r.get();
    expect(h.queued.length).toBe(1);
    await h.flush();
    for (let i = 0; i < 500; i++) await r.get();
    expect(h.queued.length).toBe(0);
    expect(m.requested.length).toBe(15);
  });

  it("a failed check is not retried on later gets in the session, and is retried once after another max age", async () => {
    const store = memoryStore();
    const h = harness();
    await keptStale(store, h);
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/a/playableBy`, 503);
    const r = readerOn(m, store, h);
    await r.get();
    await h.flush();
    const after1 = m.requested.length;
    for (let i = 0; i < 300; i++) await r.get();
    expect(h.queued.length).toBe(0);
    expect(m.requested.length).toBe(after1);
    h.advance(10 * 60_000);
    for (let i = 0; i < 50; i++) await r.get();
    expect(h.queued.length).toBe(1);
  });

  it("two tabs: tab B opened after tab A's read is warm (0 requests); two stale tabs check once each (2 checks, not more)", async () => {
    const store = memoryStore();
    const h = harness();
    const ma = fixtureMaster();
    await readerOn(ma, store, h).get();
    const mb = fixtureMaster();
    await readerOn(mb, store, h).get();
    expect(mb.requested.length).toBe(0);
    h.advance(11 * 60_000);
    const m1 = fixtureMaster();
    const m2 = fixtureMaster();
    const tab1 = readerOn(m1, store, h);
    const tab2 = readerOn(m2, store, h);
    for (let i = 0; i < 20; i++) {
      await tab1.get();
      await tab2.get();
    }
    expect(h.queued.length).toBe(2);
    await h.flush();
    expect(m1.requested.length + m2.requested.length).toBe(30);
  });

  it("the shared reader: every spelling of one origin gives the same reader", () => {
    const a = stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test", store: null });
    expect(stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test/", store: null })).toBe(a);
    expect(stakeholderKindReader({ vedaOrigin: "HTTPS://ONTOLOGY.PLATFORM.EXAMPLE.TEST", store: null })).toBe(a);
    expect(stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test:443", store: null })).toBe(a);
    expect(stakeholderKindReader({ vedaOrigin: "https://other.platform.example.test", store: null })).not.toBe(a);
  });
});

describe("S85-4 the store: wrong origin, poisoned, corrupt, old version, absent, throwing, full", () => {
  const goodEntry = async () => {
    const s = memoryStore();
    await readerOn(fixtureMaster(), s, harness()).get();
    return JSON.parse(s.data.get(KEY)!) as { v: number; origin: string; checkedAt: number; set: StakeholderKindSet };
  };

  it("an entry under the right key naming another origin, an old version, NaN or string checkedAt, or JSON junk is not used (cold read)", async () => {
    const e = await goodEntry();
    const bads = [
      JSON.stringify({ ...e, origin: "https://evil.test" }),
      JSON.stringify({ ...e, v: 0 }),
      JSON.stringify({ ...e, v: 2 }),
      JSON.stringify({ ...e, checkedAt: "5000000" }),
      JSON.stringify({ ...e, checkedAt: null }),
      JSON.stringify({ ...e, set: { ...e.set, types: [] } }),
      JSON.stringify({ ...e, set: { ...e.set, names: "Person" } }),
      JSON.stringify(null),
      "[]",
      "{not json",
      "",
    ];
    for (const raw of bads) {
      const s = memoryStore();
      s.data.set(KEY, raw);
      const m = fixtureMaster();
      const r = readerOn(m, s);
      expect(r.peek()).toBeNull();
      expect((await r.get()).names.length).toBe(10);
      expect(m.requested.length).toBe(15);
    }
  });

  it("an entry kept under ANOTHER origin's key is never read for this origin", async () => {
    const e = await goodEntry();
    const s = memoryStore();
    s.data.set(`gilb-stakeholders.kind-set.v1:https://ontology.platform.example.test`, JSON.stringify({ ...e, origin: "https://ontology.platform.example.test" }));
    expect(readerOn(fixtureMaster(), s).peek()).toBeNull();
  });

  it("a poisoned entry with a kind the master does not have, dated in the future, is treated as stale and replaced by the check", async () => {
    const e = await goodEntry();
    const s = memoryStore();
    const h = harness();
    const poison = { ...e.set, names: [...e.set.names, "Admin"], types: [...e.set.types, { ...e.set.types[0]!, term: t("Admin"), name: "Admin", label: "Admin" }] };
    s.data.set(KEY, JSON.stringify({ ...e, checkedAt: h.now() + 365 * 86_400_000, set: poison }));
    const r = readerOn(fixtureMaster(), s, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((x) => seen.push(x));
    expect((await r.get()).names).toContain("Admin");
    expect(h.queued.length).toBe(1);
    await h.flush();
    expect(r.peek()!.names).not.toContain("Admin");
    expect(seen.length).toBe(1);
  });

  it("a structurally broken entry (types: [null]) is not used, so kindLabelOf cannot throw on it", async () => {
    const e = await goodEntry();
    const s = memoryStore();
    s.data.set(KEY, JSON.stringify({ ...e, set: { ...e.set, types: [null] } }));
    const r = readerOn(fixtureMaster(), s);
    const set = await r.get();
    expect(() => kindLabelOf(set, "t:Person")).not.toThrow();
  });

  it("storage full (setItem throws, getItem works): the read answers, no error, nothing kept", async () => {
    const data = new Map<string, string>();
    const full: VocabularyStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: () => {
        throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
      },
    };
    const m = fixtureMaster();
    const r = readerOn(m, full);
    expect((await r.get()).names.length).toBe(10);
    expect(data.size).toBe(0);
    await r.get();
    expect(m.requested.length).toBe(15);
  });

  describe("the default store (globalThis.localStorage)", () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    afterEach(() => {
      if (had) Object.defineProperty(globalThis, "localStorage", had);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it("absent: works, memory only", async () => {
      delete (globalThis as { localStorage?: unknown }).localStorage;
      const m = fixtureMaster();
      const r = createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG });
      expect((await r.get()).names.length).toBe(10);
    });

    it("its getter throws (SecurityError, as a sandboxed frame does): works, memory only, no error at creation", async () => {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          throw Object.assign(new Error("denied"), { name: "SecurityError" });
        },
      });
      const m = fixtureMaster();
      const r = createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG });
      expect((await r.get()).names.length).toBe(10);
    });

    it("present: the set is kept in it under the versioned per-origin key", async () => {
      const s = memoryStore();
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: s });
      const m = fixtureMaster();
      await createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG }).get();
      expect([...s.data.keys()]).toEqual([KEY]);
    });
  });
});

describe("S85-5 the shared reader refuses what is not a bare origin", () => {
  for (const bad of ["/veda", "veda", "", "ontology.platform.example.test", "https://ontology.platform.example.test/veda", "https://ontology.platform.example.test/base/", "https://ontology.platform.example.test/?x=1", "file:///", "file:///etc"])
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(() => stakeholderKindReader({ vedaOrigin: bad, store: null })).toThrow();
    });
  it("accepts https://ontology.platform.example.test and its trailing slash", () => {
    expect(() => stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test/", store: null })).not.toThrow();
  });
});

describe("S85-6 kind words by every spelling", () => {
  it("t:X, any host's /base/t/X, bare X, padded; unknown and empty give null", async () => {
    const set = await readerOn(fixtureMaster(), null).get();
    expect(kindLabelOf(set, "t:PartyGroup")).toBe("Party Group");
    expect(kindLabelOf(set, "https://alice.platform.example.test/base/t/AiAgent")).toBe("AI Agent");
    expect(kindLabelOf(set, "http://rig.example.test:5301/base/t/DataStore")).toBe("Data Store");
    expect(kindLabelOf(set, "SoftwareSystem")).toBe("Software System");
    expect(kindLabelOf(set, "  t:Person  ")).toBe("Person");
    expect(kindLabelOf(set, "t:Nope")).toBeNull();
    expect(kindLabelOf(set, "")).toBeNull();
    expect(kindLabelOf(set, null)).toBeNull();
    expect(kindLabelOf(null, "t:Person")).toBeNull();
  });
  it("a trailing slash on a served IRI still finds the word", async () => {
    const set = await readerOn(fixtureMaster(), null).get();
    expect(kindLabelOf(set, "https://ontology.platform.example.test/base/t/Person/")).toBe("Person");
  });
});
