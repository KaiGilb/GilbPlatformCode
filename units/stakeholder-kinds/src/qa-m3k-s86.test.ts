// Ported from `gilb-stakeholders` `test/qa-c214-m3k-s86.test.ts` at 27fe0cef: 20 of its 23 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { isDeepStrictEqual } from "node:util";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, forgetStakeholderKindReaders, kindLabelOf, stakeholderKindReader, type StakeholderKindSet } from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG, t, CONTEXT } from "../test/support";


const KEY = `gilb-stakeholders.kind-set.v1:${RIG}`;
const PLAYERS = ["Person", "Organization", "PartyGroup", "PartyMemberOf", "SoftwareSystem", "SoftwareSystemGroup", "SoftwareSystemMemberOf"];

function memoryStore(): VocabularyStore & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>();
  const s = { data, writes: 0, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void (s.writes++, data.set(k, v)) };
  return s;
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

type M = ReturnType<typeof fixtureMaster>;
function readerOn(m: M, store: VocabularyStore | null, h = harness(), extra: { onSubscriberError?: (e: unknown) => void } = {}) {
  return createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG, store, now: h.now, defer: h.defer, ...extra });
}

async function keptStale(store: VocabularyStore, h: ReturnType<typeof harness>) {
  const good = await readerOn(fixtureMaster(), store, h).get();
  h.advance(11 * 60_000);
  return good;
}

/** Fail the named read wholesale (503) so every word falls back to its own term read. */
function failNamedRead(m: M) {
  const real = m.fetch;
  m.fetch = async (url, init) => {
    if (url.includes("/base/vocab?status=all&type=")) {
      m.requested.push(url);
      return new Response("{}", { status: 503 });
    }
    return real(url, init);
  };
}
/** Words fail by a network error (a rejected fetch), not a status. */
function rejectTerms(m: M, names: string[]) {
  const real = m.fetch;
  m.fetch = async (url, init) => {
    if (url.includes("/base/vocab?status=all&type=")) throw new TypeError("network down");
    if (names.some((n) => url === `${RIG}/base/t/${n}`)) throw new TypeError("network down");
    return real(url, init);
  };
}

async function checkWith(prep: (m: M) => void) {
  const store = memoryStore();
  const h = harness();
  const good = await keptStale(store, h);
  const before = store.data.get(KEY)!;
  const writesBefore = store.writes;
  const m = fixtureMaster();
  prep(m);
  const r = readerOn(m, store, h);
  const told: StakeholderKindSet[] = [];
  r.subscribe((s) => told.push(s));
  const first = await r.get();
  await h.flush();
  return { store, h, good, before, writesBefore, m, r, told, first };
}

beforeEach(() => forgetStakeholderKindReaders());

describe("S86-1 F1: a check never loses a held word, in every failure combination", () => {
  const combos: [string, (m: M) => void][] = [
    ["named read 503 and every player's term 503", (m) => { failNamedRead(m); for (const p of PLAYERS) m.status.set(`${RIG}/base/t/${p}`, 503); }],
    ["named read 503 only (each term's own read answers)", (m) => failNamedRead(m)],
    ["one player 503 (Organization)", (m) => m.status.set(`${RIG}/base/t/Organization`, 503)],
    ["every player 503, named read answers them absent", (m) => { for (const p of PLAYERS) m.status.set(`${RIG}/base/t/${p}`, 503); }],
    ["words fail by network error (rejected fetch), all players", (m) => rejectTerms(m, PLAYERS)],
    ["words 500 for two players, 404 for a third", (m) => { m.status.set(`${RIG}/base/t/Person`, 500); m.status.set(`${RIG}/base/t/PartyGroup`, 500); m.status.set(`${RIG}/base/t/SoftwareSystem`, 404); }],
  ];
  for (const [name, prep] of combos) {
    it(`${name}: every held word stays; 0 subscribers told; the store byte-identical`, async () => {
      const { r, told, before, store, good, first } = await checkWith(prep);
      expect(first).toBe(r.peek());
      expect(isDeepStrictEqual(r.peek()!.labels, good.labels)).toBe(true);
      expect(Object.keys(r.peek()!.labels).length).toBe(10);
      for (const p of ["Person", "Organization", "PartyGroup", "SoftwareSystem"]) expect(kindLabelOf(r.peek(), `t:${p}`)).not.toBeNull();
      expect(told.length).toBe(0);
      // A word kept from the set in hand, with no other change, is not a change: the store may be re-dated, never altered in content.
      const after = JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet };
      expect(isDeepStrictEqual(after.set, (JSON.parse(before) as { set: StakeholderKindSet }).set)).toBe(true);
    });
  }

  it("a 404 for a player's own term is a failed read, not 'no word': the word stays (404 is not the master's 'no word')", async () => {
    const { r, told } = await checkWith((m) => m.status.set(`${RIG}/base/t/Organization`, 404));
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect(told.length).toBe(0);
  });

  it("words fail AND the master gained a kind below a player: the kind is adopted, every held word kept, 1 subscriber call, stored", async () => {
    const { r, told, store } = await checkWith((m) => {
      failNamedRead(m);
      for (const p of PLAYERS) m.status.set(`${RIG}/base/t/${p}`, 503);
      m.children("Organization", [{ name: "Charity", label: "Charity" }]);
      m.children("Charity", []);
    });
    expect(told.length).toBe(1);
    expect(r.peek()!.names).toContain("Charity");
    expect(kindLabelOf(r.peek(), "t:Charity")).toBe("Charity");
    expect(Object.keys(r.peek()!.labels).length).toBe(11);
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    const kept = JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet };
    expect(Object.keys(kept.set.labels).length).toBe(11);
  });

  it("a NEW player whose word read fails: the check fails; the set in hand stays, 0 told, store content unchanged", async () => {
    const { r, told, store, before } = await checkWith((m) => {
      const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
      role["a:playableBy"] = [...(role["a:playableBy"] as unknown[]), { "@id": t("Robot") }];
      m.put("t/Robot", { "@context": CONTEXT, "@id": t("Robot"), "a:label": "Robot" });
      m.children("Robot", []);
      m.status.set(`${RIG}/base/t/Robot`, 503);
    });
    expect(r.peek()!.names).not.toContain("Robot");
    expect(told.length).toBe(0);
    expect(store.data.get(KEY)).toBe(before);
  });

  it("a word the master answered as ABSENT (term 200, no a:label) is the master's answer: adopted, 1 told", async () => {
    const { r, told } = await checkWith((m) => m.put("t/Organization", { "@context": CONTEXT, "@id": t("Organization") }));
    expect(kindLabelOf(r.peek(), "t:Organization")).toBeNull();
    expect(told.length).toBe(1);
  });

  it("a failed check, then a good one after another max age: the good one is adopted", async () => {
    const store = memoryStore();
    const h = harness();
    await keptStale(store, h);
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    m.put("t/Person", { "@context": CONTEXT, "@id": t("Person"), "a:label": "Human" });
    const r = readerOn(m, store, h);
    const told: StakeholderKindSet[] = [];
    r.subscribe((s) => told.push(s));
    await r.get();
    await h.flush();
    // Organization kept from hand, Person's changed word adopted.
    expect(kindLabelOf(r.peek(), "t:Person")).toBe("Human");
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect(told.length).toBe(1);
  });

  it("a held player with NO word whose read now fails: the check fails (conservative), set unchanged, 0 told", async () => {
    const store = memoryStore();
    const h = harness();
    const m0 = fixtureMaster();
    m0.put("t/PartyGroup", { "@context": CONTEXT, "@id": t("PartyGroup") });
    await readerOn(m0, store, h).get();
    h.advance(11 * 60_000);
    const before = store.data.get(KEY);
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/PartyGroup`, 503);
    const r = readerOn(m, store, h);
    const told: unknown[] = [];
    r.subscribe((s) => told.push(s));
    await r.get();
    await h.flush();
    expect(told.length).toBe(0);
    expect(store.data.get(KEY)).toBe(before);
    for (let i = 0; i < 100; i++) await r.get();
    expect(h.queued.length).toBe(0);
  });
});

describe("S86-2 F1: a cold read missing a word is answered, not stored, and one check follows", () => {
  it("cold with Organization's word failing: answered with Organization unworded, nothing stored, peek holds it", async () => {
    const store = memoryStore();
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    const s = await r.get();
    expect(s.names).toContain("Organization");
    expect(kindLabelOf(s, "t:Organization")).toBeNull();
    expect(Object.keys(s.labels).length).toBe(9);
    expect(store.data.has(KEY)).toBe(false);
    expect(store.writes).toBe(0);
    expect(r.peek()).toBe(s);
  });

  it("the next gets schedule exactly ONE check; it reads the word, tells subscribers once, stores; then nothing more", async () => {
    const store = memoryStore();
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    await r.get();
    // Round 3 (s86 O1): the cold read that missed a word schedules its own check (was 0: it waited for the next get).
    expect(h.queued.length).toBe(1);
    const told: StakeholderKindSet[] = [];
    r.subscribe((s) => told.push(s));
    for (let i = 0; i < 200; i++) await r.get();
    expect(h.queued.length).toBe(1);
    m.status.delete(`${RIG}/base/t/Organization`);
    const before = m.requested.length;
    await h.flush();
    expect(m.requested.length - before).toBe(15);
    expect(told.length).toBe(1);
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect(store.data.has(KEY)).toBe(true);
    for (let i = 0; i < 200; i++) await r.get();
    expect(h.queued.length).toBe(0);
  });

  it("cold, then the one check fails again: nothing stored, 0 told, not retried in the session; once after another max age", async () => {
    const store = memoryStore();
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, store, h);
    const told: unknown[] = [];
    r.subscribe((s) => told.push(s));
    await r.get();
    await r.get();
    expect(h.queued.length).toBe(1);
    await h.flush();
    expect(told.length).toBe(0);
    expect(store.data.has(KEY)).toBe(false);
    for (let i = 0; i < 300; i++) await r.get();
    expect(h.queued.length).toBe(0);
    h.advance(10 * 60_000);
    await r.get();
    expect(h.queued.length).toBe(1);
  });

  it("200 cold gets at once with a word failing: ONE read (16 requests: 15 plus the failed word's own read), then one check on the next get", async () => {
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, memoryStore(), h);
    await Promise.all(Array.from({ length: 200 }, () => r.get()));
    expect(m.requested.length).toBe(16);
    await r.get();
    expect(h.queued.length).toBe(1);
  });

  // Round 3 (s86 O1): was an OBSERVATION asserting 0; the cold read itself now schedules the one check.
  it("with no later get, the cold read itself schedules exactly one check", async () => {
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = readerOn(m, memoryStore(), h);
    await r.get();
    await new Promise((res) => setTimeout(res, 20));
    expect(h.queued.length).toBe(1);
  });
});

describe("S86-3 F2: a kept entry is used only with its whole shape", () => {
  const mutations: [string, (s: Record<string, any>) => void][] = [
    ["types [null]", (s) => (s.types = [null])],
    ["a type's term empty", (s) => (s.types[0].term = "")],
    ["a type's name a number", (s) => (s.types[0].name = 5)],
    ["a type's label a number", (s) => (s.types[0].label = 5)],
    ["a type's isMember a string", (s) => (s.types[0].isMember = "yes")],
    ["a type's parents not an array", (s) => (s.types[0].parents = "x")],
    ["a type's members holding null", (s) => (s.types[0].members = [null])],
    ["labels holding a number", (s) => (s.labels.x = 5)],
    ["labels an array", (s) => (s.labels = [])],
    ["names holding an empty string", (s) => (s.names = [""])],
    ["roleLabel missing", (s) => delete s.roleLabel],
    ["roleLabel a number", (s) => (s.roleLabel = 1)],
    ["role empty", (s) => (s.role = "")],
    ["members holding a number", (s) => (s.members = [1])],
    ["spellings missing", (s) => delete s.spellings],
    ["spellings.label readKeys empty", (s) => (s.spellings.label.readKeys = [])],
    ["spellings.playableBy term a number", (s) => (s.spellings.playableBy.term = 7)],
    ["labelKeys missing", (s) => delete s.labelKeys],
    ["complete a string", (s) => (s.complete = "true")],
    ["incompleteAt missing", (s) => delete s.incompleteAt],
    ["createShortcuts [null]", (s) => (s.createShortcuts = [null])],
    ["createShortcuts entry label a number", (s) => (s.createShortcuts = [{ term: "x", name: "x", label: 3 }])],
  ];
  it("control: the well-formed entry is used (0 requests)", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    const m = fixtureMaster();
    await readerOn(m, store, h).get();
    expect(m.requested.length).toBe(0);
  });
  for (const [name, mutate] of mutations) {
    it(`${name}: ignored, a cold read (15 requests); kindLabelOf on the bad set does not throw`, async () => {
      const store = memoryStore();
      const h = harness();
      await readerOn(fixtureMaster(), store, h).get();
      const entry = JSON.parse(store.data.get(KEY)!);
      mutate(entry.set);
      store.data.set(KEY, JSON.stringify(entry));
      const m = fixtureMaster();
      const r = readerOn(m, store, h);
      expect(r.peek()).toBeNull();
      await r.get();
      expect(m.requested.length).toBe(15);
      expect(() => kindLabelOf(entry.set, "t:Person")).not.toThrow();
    });
  }
  it("kindLabelOf on JSON-shaped garbage never throws", () => {
    const sets: unknown[] = [null, undefined, 0, "s", [], {}, { types: null }, { types: "x" }, { types: [null, 1, "x", [], { name: "Person", label: 5 }] }, { types: [{ name: "Person", label: "P" }] }];
    const types: unknown[] = [null, undefined, 0, {}, [], "", " ", "/", "t:", "t:/", "Person", "t:Person/", "%E0%A4%A", "https://h/base/t/Person//"];
    let n = 0;
    for (const s of sets) for (const ty of types) { expect(() => kindLabelOf(s as never, ty as never)).not.toThrow(); n++; }
    expect(n).toBe(140);
  });
});

describe("S86-4 F3: only http(s) origins", () => {
  const refused = ["file:///", "file:///etc", "data:text/plain,x", "blob:https://ontology.platform.example.test/1234", "ftp://ontology.platform.example.test", "javascript:alert(1)", "null", "about:blank", "ws://ontology.platform.example.test", "wss://ontology.platform.example.test", "chrome-extension://abcdef", "mailto:a@b.c", "/veda", "ontology.platform.example.test", "", "https://ontology.platform.example.test/veda", "https://ontology.platform.example.test/base/", "https://ontology.platform.example.test/?x=1"];
  for (const o of refused) it(`refuses ${JSON.stringify(o)}`, () => expect(() => stakeholderKindReader({ vedaOrigin: o, store: null })).toThrow());
  for (const o of ["https://ontology.platform.example.test", "https://ontology.platform.example.test/", "HTTPS://ONTOLOGY.PLATFORM.EXAMPLE.TEST", "https://ontology.platform.example.test:443", "http://rig.example.test:5301"])
    it(`accepts ${o}`, () => expect(() => stakeholderKindReader({ vedaOrigin: o, store: null })).not.toThrow());
  it("the four https spellings give one reader", () => {
    const a = stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test", store: null });
    for (const o of ["https://ontology.platform.example.test/", "HTTPS://ONTOLOGY.PLATFORM.EXAMPLE.TEST", "https://ontology.platform.example.test:443"]) expect(stakeholderKindReader({ vedaOrigin: o, store: null })).toBe(a);
  });
});

describe("S86-5 F4 and kindLabelOf input cost", () => {
  const set = { types: [{ term: t("Person"), name: "Person", label: "Person", isMember: true, parents: [], members: [] }] };
  for (const ty of ["https://ontology.platform.example.test/base/t/Person/", "t:Person/", "Person/", "https://other.host/base/t/Person//", "  https://ontology.platform.example.test/base/t/Person/  "])
    it(`${JSON.stringify(ty)} -> "Person"`, () => expect(kindLabelOf(set, ty)).toBe("Person"));
  it("a 100,000-character type made of slashes then one letter answers in under 50 ms (a row's type is pod data)", () => {
    const ty = "/".repeat(100_000) + "x";
    const t0 = performance.now();
    expect(kindLabelOf(set, ty)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe("S86-7 Scaling F4: each subscriber is isolated", () => {
  async function changedCheck(extra: { onSubscriberError?: (e: unknown) => void } = {}) {
    const store = memoryStore();
    const h = harness();
    await keptStale(store, h);
    const m = fixtureMaster();
    m.children("Organization", [{ name: "Charity", label: "Charity" }]);
    m.children("Charity", []);
    const r = readerOn(m, store, h, extra);
    return { r, h, store };
  }
  it("2nd of 3 throws: 1st and 3rd told; the error goes to onSubscriberError once; the set is stored", async () => {
    const errs: unknown[] = [];
    const { r, h, store } = await changedCheck({ onSubscriberError: (e) => errs.push(e) });
    const calls: string[] = [];
    const boom = new Error("sub2");
    r.subscribe(() => calls.push("a"));
    r.subscribe(() => { calls.push("b"); throw boom; });
    r.subscribe(() => calls.push("c"));
    await r.get();
    await h.flush();
    expect(calls).toEqual(["a", "b", "c"]);
    expect(errs).toEqual([boom]);
    expect((JSON.parse(store.data.get(KEY)!) as { set: StakeholderKindSet }).set.names).toContain("Charity");
  });
  it("every subscriber throws: all told, each error reported, check() resolves", async () => {
    const errs: unknown[] = [];
    const { r } = await changedCheck({ onSubscriberError: (e) => errs.push(e) });
    let n = 0;
    for (let i = 0; i < 5; i++) r.subscribe(() => { n++; throw new Error(String(i)); });
    await expect(r.check()).resolves.toBeTruthy();
    expect(n).toBe(5);
    expect(errs.length).toBe(5);
  });
  it("no onSubscriberError: the host's reportError gets it; with none, console.error", async () => {
    const { r } = await changedCheck();
    const rep = vi.fn();
    (globalThis as { reportError?: unknown }).reportError = rep;
    r.subscribe(() => { throw new Error("x"); });
    let told = 0;
    r.subscribe(() => void told++);
    await r.check();
    expect(rep).toHaveBeenCalledTimes(1);
    expect(told).toBe(1);
    delete (globalThis as { reportError?: unknown }).reportError;
    const { r: r2 } = await changedCheck();
    const ce = vi.spyOn(console, "error").mockImplementation(() => {});
    r2.subscribe(() => { throw new Error("y"); });
    await r2.check();
    expect(ce).toHaveBeenCalledTimes(1);
    ce.mockRestore();
  });
  it("a subscriber that unsubscribes the next one during the call: the next is still told this time (snapshot), not after", async () => {
    const { r } = await changedCheck({ onSubscriberError: () => {} });
    let second = 0;
    let off2 = () => {};
    r.subscribe(() => off2());
    off2 = r.subscribe(() => void second++);
    await r.check();
    expect(second).toBe(1);
  });
  // Round 3 (s86 O2): was an OBSERVATION asserting { rejected, 0 }; a throwing handler no longer stops the later subscribers.
  it("an onSubscriberError that itself throws does not stop the later subscribers and does not reject check()", async () => {
    const { r } = await changedCheck({ onSubscriberError: () => { throw new Error("handler"); } });
    const rep = vi.fn();
    (globalThis as { reportError?: unknown }).reportError = rep;
    let third = 0;
    r.subscribe(() => { throw new Error("s"); });
    r.subscribe(() => void third++);
    const res = await r.check().then(() => "resolved", () => "rejected");
    delete (globalThis as { reportError?: unknown }).reportError;
    expect({ res, third }).toEqual({ res: "resolved", third: 1 });
    expect(rep).toHaveBeenCalledTimes(1);
  });
});
