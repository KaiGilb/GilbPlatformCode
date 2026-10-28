// Ported from `gilb-stakeholders` `test/kindReader-m3k-r3.test.ts` at 27fe0cef: 10 of its 28 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { type VocabularyStore } from "./vocabularyStore";
import { KIND_TYPE_MAX_LENGTH, createStakeholderKindReader, forgetStakeholderKindReaders, kindLabelOf, stakeholderKindReader } from "./kindReader";
import { fixtureMaster, RIG, t } from "../test/support";


type M = ReturnType<typeof fixtureMaster>;

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

beforeEach(() => forgetStakeholderKindReaders());

describe("N1 kindLabelOf costs time linear in its input, and a type longer than the cap is no type", () => {
  const set = { types: [{ term: t("Person"), name: "Person", label: "Person", isMember: true, parents: [], members: [] }] };
  it("the cap is 2048 characters", () => expect(KIND_TYPE_MAX_LENGTH).toBe(2048));
  it("100,000 slashes then a letter: null in under 50 ms", () => {
    const t0 = performance.now();
    expect(kindLabelOf(set, "/".repeat(100_000) + "x")).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it("a name then 100,000 slashes: null (over the cap) in under 50 ms", () => {
    const t0 = performance.now();
    expect(kindLabelOf(set, "t:Person" + "/".repeat(100_000))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it("within the cap, any number of trailing slashes still finds the word, and a long slash run inside costs under 50 ms", () => {
    expect(kindLabelOf(set, "t:Person" + "/".repeat(2000))).toBe("Person");
    const inside = "/".repeat(KIND_TYPE_MAX_LENGTH - 2) + "x";
    expect(inside.length).toBe(KIND_TYPE_MAX_LENGTH - 1);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) kindLabelOf(set, inside);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it("the edge: exactly the cap is read; one character more is not", () => {
    const at = `https://ontology.platform.example.test/base/t/Person${" ".repeat(KIND_TYPE_MAX_LENGTH - "https://ontology.platform.example.test/base/t/Person".length)}`;
    expect(at.length).toBe(KIND_TYPE_MAX_LENGTH);
    expect(kindLabelOf(set, at)).toBe("Person");
    expect(kindLabelOf(set, at + " ")).toBeNull();
  });
  it("an origin of 100,000 slashes is refused by stakeholderKindReader in under 50 ms", () => {
    const t0 = performance.now();
    expect(() => stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test" + "/".repeat(100_000) + "x", store: null })).toThrow();
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe("O1 a cold read that missed a word schedules its own check", () => {
  it("right after the cold get, one check is queued with the check delay; it reads the word and stores the set", async () => {
    const store = memoryStore();
    const h = harness();
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organization`, 503);
    const r = createStakeholderKindReader({ source: src(m), origin: RIG, store, now: h.now, defer: h.defer });
    await r.get();
    expect(h.queued.map((q) => q.ms)).toEqual([3000]);
    m.status.delete(`${RIG}/base/t/Organization`);
    await h.flush();
    expect(kindLabelOf(r.peek(), "t:Organization")).toBe("Organization");
    expect(store.writes).toBe(1);
    for (let i = 0; i < 50; i++) await r.get();
    expect(h.queued.length).toBe(0);
  });
  it("a cold read that missed nothing schedules no check", async () => {
    const h = harness();
    const r = createStakeholderKindReader({ source: src(fixtureMaster()), origin: RIG, store: memoryStore(), now: h.now, defer: h.defer });
    await r.get();
    expect(h.queued.length).toBe(0);
  });
});

describe("O2 a throwing onSubscriberError stops nothing", () => {
  it("every later subscriber is told, check() resolves, and the handler's own error goes to the host", async () => {
    const store = memoryStore();
    const h = harness();
    await createStakeholderKindReader({ source: src(fixtureMaster()), origin: RIG, store, now: h.now, defer: h.defer }).get();
    h.advance(11 * 60_000);
    const m = fixtureMaster();
    m.children("Organization", [{ name: "Charity", label: "Charity" }]);
    m.children("Charity", []);
    const handlerErr = new Error("handler");
    const r = createStakeholderKindReader({
      source: src(m),
      origin: RIG,
      store,
      now: h.now,
      defer: h.defer,
      onSubscriberError: () => {
        throw handlerErr;
      },
    });
    const rep = vi.fn();
    (globalThis as { reportError?: unknown }).reportError = rep;
    try {
      const told: string[] = [];
      r.subscribe(() => {
        told.push("1");
        throw new Error("s1");
      });
      r.subscribe(() => {
        told.push("2");
        throw new Error("s2");
      });
      r.subscribe(() => void told.push("3"));
      await expect(r.check()).resolves.toBeTruthy();
      expect(told).toEqual(["1", "2", "3"]);
      expect(rep.mock.calls.map((c) => c[0])).toEqual([handlerErr, handlerErr]);
    } finally {
      delete (globalThis as { reportError?: unknown }).reportError;
    }
  });
});

describe("F1b stakeholderKindReader takes a role", () => {
  it("one reader per origin AND role; t/Stakeholder (spelled any way) is the default reader", () => {
    const a = stakeholderKindReader({ vedaOrigin: RIG, store: null });
    expect(stakeholderKindReader({ vedaOrigin: RIG, roleTerm: "t/Stakeholder", store: null })).toBe(a);
    expect(stakeholderKindReader({ vedaOrigin: RIG, roleTerm: "/t/Stakeholder", store: null })).toBe(a);
    const p = stakeholderKindReader({ vedaOrigin: RIG, roleTerm: "t/PartyMemberOf", store: null });
    expect(p).not.toBe(a);
    expect(stakeholderKindReader({ vedaOrigin: `${RIG}/`, roleTerm: "/t/PartyMemberOf", store: null })).toBe(p);
  });
});
