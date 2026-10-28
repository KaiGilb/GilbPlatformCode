// Ported from `gilb-stakeholders` `test/masterTimeout-m3kt.test.ts` at 27fe0cef: 10 of its 34 tests (the others call symbols that are not in this unit, or need only `vocabulary-source` and are in its copy of this file).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { masterSource, type VocabularySource, MasterTimeoutError, VocabularyUnavailableError, type TermDoc, withDeadline } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createStakeholderKindReader, forgetStakeholderKindReaders, stakeholderKindReader, type StakeholderKindSet } from "./kindReader";
import { type VocabularyStore } from "./vocabularyStore";
import { fixtureMaster, RIG } from "../test/support";


type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function memoryStore(): VocabularyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** A master that never answers. `honour`: it ends with an AbortError when its signal aborts, as a browser fetch does; else it
 *  ignores the signal (the bound must hold anyway). Records every request and the signal it was sent with. */
function hangingMaster(honour: boolean) {
  const sent: { url: string; signal: AbortSignal | undefined }[] = [];
  const fetch: Fetch = (url, init) => {
    sent.push({ url, signal: init?.signal ?? undefined });
    return new Promise<Response>((_, reject) => {
      if (honour) init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  };
  return { fetch, sent };
}

/** The fixture master, but each answer comes `ms` after the request (on the fake clock). */
function slowMaster(ms: number, m = fixtureMaster()) {
  const sent: { url: string; at: number; signal: AbortSignal | undefined }[] = [];
  const fetch: Fetch = (url, init) => {
    sent.push({ url, at: Date.now(), signal: init?.signal ?? undefined });
    return new Promise<Response>((resolve) => setTimeout(() => resolve(m.fetch(url, init)), ms));
  };
  return { fetch, sent, m };
}

/** The state of a promise, read without awaiting it (and without leaving its rejection unhandled). */
function watch<T>(p: Promise<T>) {
  const s: { state: "pending" | "fulfilled" | "rejected"; value?: T; error?: unknown } = { state: "pending" };
  p.then(
    (value) => Object.assign(s, { state: "fulfilled", value }),
    (error) => Object.assign(s, { state: "rejected", error }),
  );
  return s;
}

const T0 = 1_000_000_000_000;

beforeEach(() => {
  forgetStakeholderKindReaders();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A kind reader over a master, with the clock of the fake timers. */
function readerOver(fetch: Fetch, store: VocabularyStore | null, bounds: { timeoutMs?: number; readCapMs?: number } = {}) {
  return createStakeholderKindReader({
    source: masterSource({ vedaOrigin: RIG, fetchImpl: fetch, ...(bounds.timeoutMs !== undefined ? { timeoutMs: bounds.timeoutMs } : {}) }),
    origin: RIG,
    store,
    ...(bounds.readCapMs !== undefined ? { readCapMs: bounds.readCapMs } : {}),
  });
}

/** A set as a warm session keeps it, read from the fixture with real timers, dated `checkedAt`. */
async function keptSetIn(store: ReturnType<typeof memoryStore>, checkedAt: number): Promise<StakeholderKindSet> {
  const m = fixtureMaster();
  const r = createStakeholderKindReader({ source: masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }), origin: RIG, store, now: () => checkedAt, defer: () => {} });
  return r.get();
}

describe("display, cold (nothing kept): a hanging master is 'not known yet' within the bounds", () => {
  it("every request hangs: get() rejects VocabularyUnavailableError at 10,000 ms (the first round's bound), peek() stays null, no timer is left", async () => {
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(false);
    const r = readerOver(h.fetch, null);
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(9_999);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(s.state).toBe("rejected");
    expect(s.error).toBeInstanceOf(VocabularyUnavailableError);
    expect(r.peek()).toBeNull();
    expect(h.sent.length).toBe(4);
    expect(h.sent.every((x) => x.signal?.aborted === true)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a slow master (each answer 9 s, inside the request bound) is stopped by the reading's cap at 20,000 ms; what is in flight is aborted and nothing new is sent after", async () => {
    vi.useFakeTimers({ now: T0 });
    const slow = slowMaster(9_000);
    const r = readerOver(slow.fetch, null);
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(19_999);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(s.state).toBe("rejected");
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    expect((s.error as MasterTimeoutError).ms).toBe(20_000);
    const atCap = slow.sent.length;
    // Round 1 at 0 s (4), round 2 at 9 s (named read + 7 player listings), round 3 at 18 s (the listings below them).
    expect(slow.sent.map((x) => x.at - T0)).toEqual([0, 0, 0, 0, 9_000, 9_000, 9_000, 9_000, 9_000, 9_000, 9_000, 9_000, 18_000, 18_000, 18_000]);
    expect(slow.sent.filter((x) => x.at - T0 === 18_000).every((x) => x.signal?.aborted === true)).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(slow.sent.length).toBe(atCap);
    expect(r.peek()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the cap is injectable: 5 s on the same slow master rejects at 5,000 ms", async () => {
    vi.useFakeTimers({ now: T0 });
    const slow = slowMaster(9_000);
    const r = readerOver(slow.fetch, null, { readCapMs: 5_000 });
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(4_999);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect((s.error as MasterTimeoutError).ms).toBe(5_000);
    expect(slow.sent.every((x) => x.signal?.aborted === true)).toBe(true);
  });

  it("no retry storm: five gets during a hang share ONE reading (4 requests); the package retries nothing by itself; the next get reads once more", async () => {
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(true);
    const r = readerOver(h.fetch, null);
    const gets = Array.from({ length: 5 }, () => watch(r.get()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(gets.map((g) => g.state)).toEqual(["rejected", "rejected", "rejected", "rejected", "rejected"]);
    expect(h.sent.length).toBe(4);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.sent.length).toBe(4);
    const again = watch(r.get());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(again.state).toBe("rejected");
    expect(h.sent.length).toBe(8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the shared reader takes the bounds too (stakeholderKindReader timeoutMs, readCapMs)", async () => {
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(false);
    const r = stakeholderKindReader({ vedaOrigin: RIG, fetchImpl: h.fetch, store: null, timeoutMs: 1_000, readCapMs: 20_000 });
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(s.state).toBe("rejected");
    expect((s.error as MasterTimeoutError).ms).toBe(1_000);
  });

  it("a source that is not masterSource and never answers is still bounded by the reading's cap (20,000 ms)", async () => {
    vi.useFakeTimers({ now: T0 });
    const never = <T,>() => new Promise<T>(() => {});
    const source: VocabularySource = {
      termIri: (p) => `${RIG}/base/${p}`,
      term: () => never<TermDoc>(),
      children: () => never(),
      carriersOf: () => never(),
    };
    const r = createStakeholderKindReader({ source, origin: RIG, store: null });
    const s = watch(r.get());
    await vi.advanceTimersByTimeAsync(19_999);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("display, a set is kept: a hanging master never wipes it", () => {
  it("a stale kept set is answered at once; its background check times out; the set, the store and the subscribers are untouched; no second check in the session", async () => {
    const store = memoryStore();
    const kept = await keptSetIn(store, T0 - 11 * 60_000);
    const stored = store.data.get(`gilb-stakeholders.kind-set.v1:${RIG}`);
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(false);
    const r = readerOver(h.fetch, store);
    const told: unknown[] = [];
    r.subscribe((v) => told.push(v));
    expect(await r.get()).toEqual(kept);
    expect(h.sent.length).toBe(0);
    await vi.advanceTimersByTimeAsync(3_000); // the check starts
    expect(h.sent.length).toBe(4);
    await vi.advanceTimersByTimeAsync(10_000); // and times out
    expect(r.peek()).toEqual(kept);
    expect(store.data.get(`gilb-stakeholders.kind-set.v1:${RIG}`)).toBe(stored);
    expect(told).toEqual([]);
    // No retry storm: every get for the next max age answers the kept set at 0 requests.
    for (let i = 0; i < 20; i++) expect(await r.get()).toEqual(kept);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    for (let i = 0; i < 20; i++) expect(await r.get()).toEqual(kept);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sent.length).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("check() on a kept set over a hanging master rejects at the bound and keeps the set", async () => {
    const store = memoryStore();
    const kept = await keptSetIn(store, T0);
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(true);
    const r = readerOver(h.fetch, store);
    const s = watch(r.check());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.state).toBe("rejected");
    expect(s.error).toBeInstanceOf(VocabularyUnavailableError);
    expect(r.peek()).toEqual(kept);
    expect(await r.get()).toEqual(kept);
  });
});

// ── Kai-Zen ruling A1 (round 2): a bound is never switched off ──────────────────────────────────────────────────────────────
//
// "A bound of 0, negative, NaN or non-finite is rejected at construction (throw a clear error) or replaced by the default —
// choose, document, test; never 'no bound'." Chosen: refused, with a RangeError, when the source, the reader or the write call
// is made. Left out, a bound takes its default. (Round 1: 0, a negative number or NaN meant no bound; Tester s92 A1.)

const BAD = [0, -1, -10_000, Number.NaN, Infinity, -Infinity] as const;

describe("A1: a bound that is not a finite number of ms above 0 is refused when it is given, never read as 'no bound'", () => {
  it.each(BAD)("masterSource({ timeoutMs: %s }) throws a RangeError naming the option", (bad) => {
    expect(() => masterSource({ vedaOrigin: RIG, timeoutMs: bad })).toThrow(RangeError);
    expect(() => masterSource({ vedaOrigin: RIG, timeoutMs: bad })).toThrow(/timeoutMs must be a finite number of ms above 0/);
  });

  it.each(BAD)("withDeadline refuses ms: %s (left out, only the parents bound the work)", (bad) => {
    expect(() => withDeadline(async () => 1, { ms: bad, timeoutError: () => new Error("t"), abortError: () => new Error("a") })).toThrow(RangeError);
  });
});
