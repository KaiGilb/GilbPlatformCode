// Ported from `gilb-stakeholders` `test/kindReader-m3k.test.ts` at 27fe0cef: 16 of its 23 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { KIND_SET_MAX_AGE_MS, createStakeholderKindReader, forgetStakeholderKindReaders, stakeholderKindReader, type StakeholderKindSet } from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG, t, SERVED_PLAYERS } from "../test/support";


/** A store like localStorage, in memory. */
function memoryStore(): VocabularyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** A clock and a deferral queue the test drives by hand. */
function harness() {
  let now = 1_000_000;
  const queued: { fn: () => void; ms: number }[] = [];
  return {
    now: () => now,
    advance: (ms: number) => void (now += ms),
    defer: (fn: () => void, ms: number) => void queued.push({ fn, ms }),
    queued,
    /** Run every deferred check and wait for it to settle. */
    async flush() {
      while (queued.length) queued.shift()!.fn();
      for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const PLAYERS_AND_BELOW = [
  "Person",
  "Organization",
  "PartyGroup",
  "PartyMemberOf",
  "SoftwareSystem",
  "SoftwareSystemGroup",
  "SoftwareSystemMemberOf",
  "Passenger",
  "AiAgent",
  "DataStore",
];

function readerOn(m: ReturnType<typeof fixtureMaster>, store: VocabularyStore | null, h = harness()) {
  return createStakeholderKindReader({
    source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }),
    origin: RIG,
    store,
    now: h.now,
    defer: h.defer,
  });
}

beforeEach(() => forgetStakeholderKindReaders());

describe("createStakeholderKindReader: one set per master origin, kept across sessions", () => {
  it("cold: one read; a second get in the same session costs 0 requests", async () => {
    const m = fixtureMaster();
    const r = readerOn(m, memoryStore());
    const a = await r.get();
    expect(m.requested.length).toBe(15);
    const b = await r.get();
    expect(b).toBe(a);
    expect(m.requested.length).toBe(15);
  });

  it("two gets at once share one read", async () => {
    const m = fixtureMaster();
    const r = readerOn(m, memoryStore());
    const [a, b] = await Promise.all([r.get(), r.get()]);
    expect(a).toBe(b);
    expect(m.requested.length).toBe(15);
  });

  it("warm: a new session with the set kept costs 0 requests, and no check while the set is younger than its max age", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    const m = fixtureMaster();
    h.advance(60_000);
    const r = readerOn(m, store, h);
    const set = await r.get();
    expect(set.names).toEqual(PLAYERS_AND_BELOW);
    expect(set.labels[t("Person")]).toBe("Person");
    expect(r.peek()).toEqual(set);
    expect(m.requested.length).toBe(0);
    expect(h.queued.length).toBe(0);
  });

  it("the max age is 10 minutes", () => {
    expect(KIND_SET_MAX_AGE_MS).toBe(600_000);
  });

  it("warm and older than its max age: answered at once from the store (0 requests), checked later in the background", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    h.advance(600_000);
    const m = fixtureMaster();
    const r = readerOn(m, store, h);
    await r.get();
    expect(m.requested.length).toBe(0);
    expect(h.queued.length).toBe(1);
    expect(h.queued[0]!.ms).toBe(3000);
    await h.flush();
    expect(m.requested.length).toBe(15);
    // A second get in the same session, after the check: no new check, 0 requests.
    await r.get();
    expect(h.queued.length).toBe(0);
    expect(m.requested.length).toBe(15);
  });

  it("a new kind on the master appears within the session: the background check hands it to every subscriber and keeps it", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    h.advance(600_000);
    const m = fixtureMaster();
    m.children("Organization", [{ name: "Charity", label: "Charity" }]);
    m.children("Charity", []);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    const first = await r.get();
    expect(first.names).not.toContain("Charity");
    await h.flush();
    expect(seen.length).toBe(1);
    expect(seen[0]!.names).toContain("Charity");
    expect(seen[0]!.labels[t("Charity")]).toBe("Charity");
    expect(r.peek()!.names).toContain("Charity");
    // The next session starts with the new kind, at 0 requests.
    const next = fixtureMaster();
    h.advance(1000);
    const again = await readerOn(next, store, h).get();
    expect(again.names).toContain("Charity");
    expect(next.requested.length).toBe(0);
  });

  it("an unchanged master: the check notifies no one and dates the kept set again", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    h.advance(700_000);
    const r = readerOn(fixtureMaster(), store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    await r.get();
    await h.flush();
    expect(seen.length).toBe(0);
    // Dated again: a new session 1 minute later needs no check.
    h.advance(60_000);
    const h2q = h.queued.length;
    await readerOn(fixtureMaster(), store, h).get();
    expect(h.queued.length).toBe(h2q);
  });

  it("a failed background check keeps the set in hand and notifies no one", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    h.advance(600_000);
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/a/playableBy`, 503);
    const r = readerOn(m, store, h);
    const seen: StakeholderKindSet[] = [];
    r.subscribe((s) => seen.push(s));
    const set = await r.get();
    await h.flush();
    expect(seen.length).toBe(0);
    expect(r.peek()).toEqual(set);
    // Not retried again in this session before another max age has passed.
    await r.get();
    expect(h.queued.length).toBe(0);
  });

  it("cold and the master down: the read's own error, ⛔ never an empty set", async () => {
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/a/playableBy`, 503);
    const r = readerOn(m, memoryStore());
    await expect(r.get()).rejects.toBeInstanceOf(VocabularyUnavailableError);
    expect(r.peek()).toBeNull();
    // The next get tries again.
    m.status.delete(`${RIG}/base/a/playableBy`);
    expect((await r.get()).names).toEqual(PLAYERS_AND_BELOW);
  });

  it("no store: works, memory only", async () => {
    const m = fixtureMaster();
    const r = readerOn(m, null);
    expect((await r.get()).names).toEqual(PLAYERS_AND_BELOW);
    await r.get();
    expect(m.requested.length).toBe(15);
  });

  it("a store that throws on every call: works, memory only, ⛔ never an error to the caller", async () => {
    const m = fixtureMaster();
    const broken: VocabularyStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const r = readerOn(m, broken);
    expect((await r.get()).names).toEqual(PLAYERS_AND_BELOW);
  });

  it("a stored set that is not readable, of another version, or of another origin is not used", async () => {
    const store = memoryStore();
    const h = harness();
    await readerOn(fixtureMaster(), store, h).get();
    const [key] = [...store.data.keys()];
    expect(key).toBe(`gilb-stakeholders.kind-set.v1:${RIG}`);
    const kept = JSON.parse(store.data.get(key!)!);
    for (const bad of ["{not json", JSON.stringify({ ...kept, v: 0 }), JSON.stringify({ ...kept, origin: "https://other.test" }), JSON.stringify({ ...kept, set: { ...kept.set, names: [] } })]) {
      store.data.set(key!, bad);
      const m = fixtureMaster();
      expect((await readerOn(m, store, h).get()).names).toEqual(PLAYERS_AND_BELOW);
      expect(m.requested.length).toBe(15);
    }
  });

  it("each master origin keeps its own set", async () => {
    const store = memoryStore();
    await readerOn(fixtureMaster(), store).get();
    const other = createStakeholderKindReader({
      source: masterSource({ vedaOrigin: RIG, fetchImpl: fixtureMaster().fetch }),
      origin: "https://veda.other.test",
      store,
    });
    expect(other.peek()).toBeNull();
    expect([...store.data.keys()]).toEqual([`gilb-stakeholders.kind-set.v1:${RIG}`]);
  });
});

describe("stakeholderKindReader: one reader per master origin in a page", () => {
  it("both apps' doors get the same reader for the same origin, so the set is read once", async () => {
    const m = fixtureMaster();
    const a = stakeholderKindReader({ vedaOrigin: `${RIG}/`, fetchImpl: m.fetch, store: null });
    const b = stakeholderKindReader({ vedaOrigin: RIG, fetchImpl: m.fetch, store: null });
    expect(a).toBe(b);
    await Promise.all([a.get(), b.get()]);
    expect(m.requested.length).toBe(15);
  });

  it("refuses an address that is not an origin, so `/veda` cannot become `/veda/veda/base/…`", () => {
    expect(() => stakeholderKindReader({ vedaOrigin: "/veda", store: null })).toThrow(VocabularyUnavailableError);
  });
});

// The players as served, so a change to the fixture that drops one shows here by name.
it("fixture sanity: seven players", () => expect(SERVED_PLAYERS.length).toBe(7));
