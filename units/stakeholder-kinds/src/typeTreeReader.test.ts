// The type-tree reader. Ported from `gilb-stakeholders` `test/kindReader-m3k-r3.test.ts` ("the type-tree reader" block and the
// shared-reader test), `test/masterTimeout-m3kt.test.ts` (the hanging listing, the refused bounds), `test/qa-c214-m3kt-s92.test.ts`
// (the reading's cap) and `test/qa-c214-m3kt-s93.test.ts` (refused bounds leave the store alone) at 0a261488, with the contact-point
// tree built on this unit's fixture master; then pins for what those leave unsaid.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterTimeoutError, VocabularyUnavailableError, masterSource, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import * as unit from "./index";
import {
  createStakeholderKindReader,
  createTypeTreeReader,
  forgetStakeholderKindReaders,
  readTypeTree,
  stakeholderKindReader,
  typeTreeReader,
  type TypeTree,
} from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG, t } from "../test/support";

type M = ReturnType<typeof fixtureMaster>;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The fixture master with the contact-point types: ContactPoint > ElectronicContactPoint (Email, Phone), PhysicalContactPoint (PostalAddress). */
function contactMaster(): M {
  const m = fixtureMaster();
  m.children("ContactPoint", [
    { name: "ElectronicContactPoint", label: "Electronic Contact Point" },
    { name: "PhysicalContactPoint", label: "Physical Contact Point" },
  ]);
  m.children("ElectronicContactPoint", [{ name: "Email", label: "Email" }, { name: "Phone", label: "Phone" }]);
  m.children("PhysicalContactPoint", [{ name: "PostalAddress", label: "Postal Address" }]);
  for (const n of ["Email", "Phone", "PostalAddress"]) m.children(n, []);
  return m;
}

const CONTACT_TERMS = ["ElectronicContactPoint", "PhysicalContactPoint", "Email", "Phone", "PostalAddress"].map(t);
/** The root as the master source spells it: the fixture serves from the rig, its children name the platform. */
const ROOT = (name: string) => `${RIG}/base/t/${name}`;
const TREE_KEY = `gilb-stakeholders.type-tree.v1:${RIG}|t/ContactPoint`;

function memoryStore(): VocabularyStore & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>();
  const s = { data, writes: 0, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void (s.writes++, data.set(k, v)) };
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

const src = (m: M) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
const children = (urls: string[]) => urls.filter((u) => u.endsWith("/children")).length;
const tree = (m: M, store: VocabularyStore | null, h = harness(), rootTerm = "t/ContactPoint") =>
  createTypeTreeReader({ source: src(m), origin: RIG, rootTerm, store, now: h.now, defer: h.defer });

function watch<T>(p: Promise<T>) {
  const s: { state: "pending" | "fulfilled" | "rejected"; value?: T; error?: unknown } = { state: "pending" };
  p.then(
    (value) => Object.assign(s, { state: "fulfilled", value }),
    (error) => Object.assign(s, { state: "rejected", error }),
  );
  return s;
}

const T0 = 1_000_000_000_000;

beforeEach(() => forgetStakeholderKindReaders());
afterEach(() => vi.useRealTimers());

describe("the type-tree reader is exported, and one shared reader per origin and root", () => {
  it("is in the export list, and typeTreeReader gives one reader per origin and root, however they are spelled", () => {
    expect(typeof unit.createTypeTreeReader).toBe("function");
    expect(typeof unit.typeTreeReader).toBe("function");
    expect(typeof unit.readTypeTree).toBe("function");
    expect(unit.KIND_TYPE_MAX_LENGTH).toBe(2048);
    const a = typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null });
    expect(typeTreeReader({ vedaOrigin: `${RIG}/`, rootTerm: "/t/ContactPoint", store: null })).toBe(a);
    expect(typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/Email", store: null })).not.toBe(a);
    expect(() => typeTreeReader({ vedaOrigin: "/veda", rootTerm: "t/ContactPoint", store: null })).toThrow();
  });
});

describe("the type-tree reader (t/ContactPoint)", () => {
  it("cold: 6 children listings and nothing else; warm: 0", async () => {
    const store = memoryStore();
    const m = contactMaster();
    const a: TypeTree = await tree(m, store).get();
    expect(m.requested.length).toBe(6);
    expect(children(m.requested)).toBe(6);
    expect(a.terms).toEqual(CONTACT_TERMS);
    expect(a.complete).toBe(true);
    expect([...store.data.keys()]).toEqual([TREE_KEY]);
    const m2 = contactMaster();
    expect((await tree(m2, store).get()).terms).toEqual(CONTACT_TERMS);
    expect(m2.requested.length).toBe(0);
  });
  it("stale: answered at once, checked later; a new type reaches the subscriber and the store", async () => {
    const store = memoryStore();
    const h = harness();
    await tree(contactMaster(), store, h).get();
    h.advance(11 * 60_000);
    const m = contactMaster();
    m.children("Phone", [{ name: "Fax", label: "Fax" }]);
    m.children("Fax", []);
    const r = tree(m, store, h);
    const told: TypeTree[] = [];
    r.subscribe((x) => told.push(x));
    expect((await r.get()).terms).toEqual(CONTACT_TERMS);
    expect(m.requested.length).toBe(0);
    await h.flush();
    expect(told.length).toBe(1);
    expect(told[0]!.terms).toContain(t("Fax"));
    expect(store.data.get(TREE_KEY)).toContain("/base/t/Fax");
  });
  it("a kept entry of the wrong shape is ignored and read cold", async () => {
    for (const bad of ['{"v":1}', '{"v":1,"origin":"x","checkedAt":1,"set":{}}', "nope", JSON.stringify({ v: 1, origin: RIG, checkedAt: 1, set: { root: "r", terms: [1], complete: true, incompleteAt: [] } })]) {
      const store = memoryStore();
      store.data.set(TREE_KEY, bad);
      const m = contactMaster();
      await tree(m, store).get();
      expect(m.requested.length).toBe(6);
    }
  });
  it("a kept entry whose complete flag is not a boolean, or whose incompleteAt or root is not text, is ignored and read cold", async () => {
    const good = { root: `${RIG}/base/t/ContactPoint`, terms: CONTACT_TERMS, complete: true, incompleteAt: [] as string[] };
    for (const set of [{ ...good, complete: "yes" }, { ...good, incompleteAt: [3] }, { ...good, root: "" }, { ...good, terms: "x" }]) {
      const store = memoryStore();
      store.data.set(TREE_KEY, JSON.stringify({ v: 1, origin: RIG, checkedAt: 7_000_000, set }));
      const m = contactMaster();
      await tree(m, store).get();
      expect(m.requested.length).toBe(6);
    }
    const store = memoryStore();
    store.data.set(TREE_KEY, JSON.stringify({ v: 1, origin: RIG, checkedAt: 7_000_000, set: good }));
    const m = contactMaster();
    expect((await tree(m, store).get()).terms).toEqual(CONTACT_TERMS);
    expect(m.requested.length).toBe(0);
  });
  it("a listing that fails rejects a cold get, and the next get reads again", async () => {
    const m = contactMaster();
    m.status.set(`${RIG}/base/t/ContactPoint/children`, 503);
    const r = tree(m, null);
    await expect(r.get()).rejects.toThrow(/503/);
    m.status.delete(`${RIG}/base/t/ContactPoint/children`);
    expect((await r.get()).terms).toEqual(CONTACT_TERMS);
  });
});

describe("the type-tree reader is bounded like the kind reader", () => {
  it("a hanging listing rejects at 10,000 ms and leaves no timer", async () => {
    vi.useFakeTimers({ now: T0 });
    const never: Fetch = () => new Promise<Response>(() => {});
    const r = createTypeTreeReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: never }), origin: RIG, rootTerm: "t/ContactPoint", store: null });
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.state).toBe("rejected");
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("the reading's cap aborts what is in flight and sends nothing after (9,900 ms per answer, cap 20,000 ms)", async () => {
    vi.useFakeTimers({ now: T0 });
    const m = contactMaster();
    const sent: { at: number; settled: boolean }[] = [];
    const slow: Fetch = (url, init) => {
      const mark = { at: Date.now(), settled: false };
      sent.push(mark);
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          mark.settled = true;
          resolve(m.fetch(url, init));
        }, 9_900);
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            mark.settled = true;
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      });
    };
    const r = createTypeTreeReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: slow }), origin: RIG, rootTerm: "t/ContactPoint", store: null, defer: () => {} });
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(s.state).toBe("rejected");
    const n = sent.length;
    expect(sent.every((x) => x.settled)).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });
});

const BAD = [0, -1, -10_000, Number.NaN, Infinity, -Infinity] as const;
const TOO_BIG = [2 ** 31, 2 ** 40, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE] as const;

describe("a bound that is not a finite number of ms above 0, at most 2,147,483,647, is refused by the type-tree readers", () => {
  it.each(BAD)("createTypeTreeReader refuses readCapMs: %s, and sends nothing, keeps nothing", (bad) => {
    const m = contactMaster();
    const store = memoryStore();
    expect(() => createTypeTreeReader({ source: src(m), origin: RIG, rootTerm: "t/ContactPoint", store, readCapMs: bad })).toThrow(RangeError);
    expect(m.requested.length).toBe(0);
    expect(store.writes).toBe(0);
  });
  it.each(BAD)("typeTreeReader refuses timeoutMs and readCapMs: %s, even when a reader for that origin already exists", (bad) => {
    typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null });
    expect(() => typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null, timeoutMs: bad })).toThrow(RangeError);
    expect(() => typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null, readCapMs: bad })).toThrow(RangeError);
  });
  it.each(TOO_BIG)("%s is refused at both entries", (big) => {
    expect(() => createTypeTreeReader({ source: src(contactMaster()), origin: RIG, rootTerm: "t/ContactPoint", store: null, readCapMs: big })).toThrow(RangeError);
    expect(() => typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null, readCapMs: big })).toThrow(RangeError);
    expect(() => typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null, timeoutMs: big })).toThrow(RangeError);
  });
  it("a refused call leaves no reader behind: the first good call makes the reader, with its own fetch", async () => {
    const m = contactMaster();
    expect(() => typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", fetchImpl: m.fetch, store: null, readCapMs: 0 })).toThrow(RangeError);
    const good = typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", fetchImpl: m.fetch, store: null });
    expect((await good.get()).terms).toEqual(CONTACT_TERMS);
    expect(m.requested.length).toBe(6);
  });
});

describe("readTypeTree", () => {
  it("reads the tree below a root, breadth first in served order, the root left out, each type once", async () => {
    const m = contactMaster();
    const r = await readTypeTree(src(m), "t/ContactPoint");
    expect(r).toEqual({ root: ROOT("ContactPoint"), terms: CONTACT_TERMS, complete: true, incompleteAt: [] });
  });
  it("a leading slash on the root is dropped; a root with no children is an empty tree", async () => {
    const m = contactMaster();
    expect((await readTypeTree(src(m), "/t/ContactPoint")).root).toBe(ROOT("ContactPoint"));
    expect(await readTypeTree(src(m), "t/Email")).toEqual({ root: ROOT("Email"), terms: [], complete: true, incompleteAt: [] });
  });
  it("a listing that says it is not complete makes the tree a floor and names the type", async () => {
    const m = contactMaster();
    m.children("ElectronicContactPoint", [{ name: "Email", label: "Email" }, { name: "Phone", label: "Phone" }], false);
    const r = await readTypeTree(src(m), "t/ContactPoint");
    expect(r.complete).toBe(false);
    expect(r.incompleteAt).toEqual([t("ElectronicContactPoint")]);
    expect(r.terms).toEqual(CONTACT_TERMS);
  });
  it("a type reached by two paths is listed once, at its first place, and a cycle ends", async () => {
    const m = contactMaster();
    m.children("PhysicalContactPoint", [{ name: "Email", label: "Email" }, { name: "PostalAddress", label: "Postal Address" }]);
    expect((await readTypeTree(src(m), "t/ContactPoint")).terms).toEqual(CONTACT_TERMS);
    m.children("Phone", [{ name: "Email", label: "Email" }]);
    const again = await readTypeTree(src(m), "t/ContactPoint");
    expect(again.terms.filter((x) => x === t("Email")).length).toBe(1);
    m.children("Email", [{ name: "ElectronicContactPoint", label: "Electronic Contact Point" }]);
    const cyc = await readTypeTree(src(m), "t/ContactPoint");
    expect(cyc.terms).toEqual(CONTACT_TERMS);
  });
  it("the root is left out by its address as the source spells it", async () => {
    const m = contactMaster();
    m.children("Email", [{ name: "ContactPoint", label: "Contact Point" }]);
    const r = await readTypeTree(src(m), "t/ContactPoint");
    expect(r.terms).toContain(t("ContactPoint"));
    expect(r.terms).not.toContain(ROOT("ContactPoint"));
  });
  it("a listing that cannot be read is a VocabularyUnavailableError", async () => {
    const m = contactMaster();
    m.status.set(`${RIG}/base/t/Phone/children`, 500);
    await expect(readTypeTree(src(m), "t/ContactPoint")).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("pins on the type-tree reader's keys, store and register", () => {
  it("the store key carries the origin and the root without a leading slash; another root has its own key and its own entry", async () => {
    const store = memoryStore();
    await tree(contactMaster(), store, harness(), "/t/ContactPoint").get();
    await tree(contactMaster(), store, harness(), "t/Email").get();
    expect([...store.data.keys()].sort()).toEqual([TREE_KEY, `gilb-stakeholders.type-tree.v1:${RIG}|t/Email`].sort());
  });
  it("a kind set and a type tree for the same origin do not meet in the store", async () => {
    const store = memoryStore();
    await createStakeholderKindReader({ source: src(fixtureMaster()), origin: RIG, store }).get();
    const m = contactMaster();
    await tree(m, store).get();
    expect(m.requested.length).toBe(6);
    expect([...store.data.keys()].filter((k) => k.startsWith("gilb-stakeholders.type-tree.v1:")).length).toBe(1);
  });
  it("an incomplete reading is answered and kept, as served (a floor), without an unread list", async () => {
    const store = memoryStore();
    const m = contactMaster();
    m.children("PhysicalContactPoint", [{ name: "PostalAddress", label: "Postal Address" }], false);
    const r = await tree(m, store).get();
    expect(r.complete).toBe(false);
    expect(r.incompleteAt).toEqual([t("PhysicalContactPoint")]);
    expect(JSON.parse(store.data.get(TREE_KEY)!).set.incompleteAt).toEqual([t("PhysicalContactPoint")]);
  });
  it("peek is null until the first answer, then the tree; a second get is answered without a request", async () => {
    const m = contactMaster();
    const r = tree(m, null);
    expect(r.peek()).toBeNull();
    const a = await r.get();
    expect(r.peek()).toEqual(a);
    const n = m.requested.length;
    await r.get();
    expect(m.requested.length).toBe(n);
  });
  it("the shared reader keeps the fetch of the first call; a second call with another fetch gets the same reader", async () => {
    const m1 = contactMaster();
    const m2 = contactMaster();
    const a = typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", fetchImpl: m1.fetch, store: null });
    const b = typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", fetchImpl: m2.fetch, store: null });
    expect(b).toBe(a);
    await a.get();
    expect(m1.requested.length).toBe(6);
    expect(m2.requested.length).toBe(0);
  });
  it("a shared type-tree reader and a shared kind reader of one origin are not one reader", () => {
    expect(typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/Stakeholder", store: null })).not.toBe(stakeholderKindReader({ vedaOrigin: RIG, store: null }));
  });
  it("an origin that is not a bare web origin is a VocabularyUnavailableError", () => {
    for (const bad of ["/veda", "file:///x", "https://ontology.example.test/veda", "https://ontology.example.test/?a=1"]) {
      expect(() => typeTreeReader({ vedaOrigin: bad, rootTerm: "t/ContactPoint", store: null })).toThrow(VocabularyUnavailableError);
    }
  });
  it("forgetStakeholderKindReaders empties the type-tree register too (and the kind register)", () => {
    const tr = typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null });
    const kr = stakeholderKindReader({ vedaOrigin: RIG, store: null });
    expect(typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null })).toBe(tr);
    forgetStakeholderKindReaders();
    expect(typeTreeReader({ vedaOrigin: RIG, rootTerm: "t/ContactPoint", store: null })).not.toBe(tr);
    expect(stakeholderKindReader({ vedaOrigin: RIG, store: null })).not.toBe(kr);
  });
  it("the module's own source type is a VocabularySource (the reader takes the same source as the kind reader)", () => {
    const s: VocabularySource = src(contactMaster());
    expect(typeof createTypeTreeReader({ source: s, origin: RIG, rootTerm: "t/ContactPoint", store: null }).get).toBe("function");
  });
});
