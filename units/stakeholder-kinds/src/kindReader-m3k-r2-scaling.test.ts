// Ported from `gilb-stakeholders` `test/kindReader-m3k-r2-scaling.test.ts` at 27fe0cef: 3 of its 8 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, forgetStakeholderKindReaders, type StakeholderKindSet } from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG } from "../test/support";


function memoryStore(): VocabularyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function harness() {
  let now = 9_000_000;
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

const src = (m: ReturnType<typeof fixtureMaster>) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });

beforeEach(() => forgetStakeholderKindReaders());

describe("Scaling F1 the field sets read from the cached kind set: one kind read in the package", () => {

  it("the set carries the role's own word, read in the same named read (a card needs no extra role read)", async () => {
    const m = fixtureMaster();
    const set = await createStakeholderKindReader({ source: src(m), origin: RIG, store: null }).get();
    expect(set.roleLabel).toBe("Stakeholder");
    expect(m.requested.length).toBe(15);
  });
});

describe("Scaling F4 a throwing subscriber", () => {
  it("does not stop the subscribers after it, and its error is reported, not swallowed", async () => {
    const store = memoryStore();
    const h = harness();
    await createStakeholderKindReader({ source: src(fixtureMaster()), origin: RIG, store, now: h.now, defer: h.defer }).get();
    h.advance(11 * 60_000);
    const m = fixtureMaster();
    m.children("Person", [
      { name: "Passenger", label: "Passenger" },
      { name: "Visitor", label: "Visitor" },
    ]);
    m.children("Visitor", []);
    const reported: unknown[] = [];
    const r = createStakeholderKindReader({
      source: src(m),
      origin: RIG,
      store,
      now: h.now,
      defer: h.defer,
      onSubscriberError: (err) => reported.push(err),
    });
    const told: string[] = [];
    r.subscribe(() => void told.push("a"));
    r.subscribe(() => {
      told.push("b");
      throw new Error("subscriber b broke");
    });
    r.subscribe((s: StakeholderKindSet) => void told.push(`c:${s.names.length}`));
    await r.get();
    await h.flush();
    expect(told).toEqual(["a", "b", "c:11"]);
    expect(reported.length).toBe(1);
    expect(String(reported[0])).toContain("subscriber b broke");
    // The new set is kept all the same.
    expect(r.peek()!.names).toContain("Visitor");
    expect(JSON.parse(store.data.get(`gilb-stakeholders.kind-set.v1:${RIG}`)!).set.names.length).toBe(11);
  });

  it("with no handler given, the error goes to the host's reportError", async () => {
    const h = harness();
    const m = fixtureMaster();
    const r = createStakeholderKindReader({ source: src(m), origin: RIG, store: null, now: h.now, defer: h.defer });
    await r.get();
    m.children("Person", [
      { name: "Passenger", label: "Passenger" },
      { name: "Visitor", label: "Visitor" },
    ]);
    m.children("Visitor", []);
    const g = globalThis as { reportError?: (e: unknown) => void };
    const had = g.reportError;
    const seen: unknown[] = [];
    g.reportError = (e) => void seen.push(e);
    try {
      r.subscribe(() => {
        throw new Error("no handler");
      });
      await r.check();
    } finally {
      if (had) g.reportError = had;
      else delete g.reportError;
    }
    expect(seen.length).toBe(1);
  });
});
