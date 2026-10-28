// New tests: every export of deadline.ts, pinned.
import { describe, expect, it, vi } from "vitest";
import { MAX_BOUND_MS, boundSource, checkedBound, withDeadline } from "./deadline";
import type { VocabularySource } from "./source";

const never = () => new Promise<never>(() => {});
const timeout = () => new Error("timeout");
const aborted = () => new Error("aborted");

describe("checkedBound", () => {
  it("MAX_BOUND_MS is the largest delay setTimeout keeps", () => {
    expect(MAX_BOUND_MS).toBe(2_147_483_647);
  });
  it("left out, the bound is the fallback", () => {
    expect(checkedBound("timeoutMs", undefined, 10_000)).toBe(10_000);
  });
  it("a finite number above 0, up to the maximum, is kept", () => {
    expect(checkedBound("timeoutMs", 1, 5)).toBe(1);
    expect(checkedBound("timeoutMs", MAX_BOUND_MS, 5)).toBe(MAX_BOUND_MS);
  });
  it.each([0, -1, NaN, Infinity, -Infinity, MAX_BOUND_MS + 1])("%s is refused with a RangeError that names the option", (bad) => {
    expect(() => checkedBound("readCapMs", bad, 5)).toThrow(RangeError);
    expect(() => checkedBound("readCapMs", bad, 5)).toThrow(/readCapMs must be a finite number of ms above 0/);
  });
  it("a value that is not a number is refused too, and the message names the fallback", () => {
    expect(() => checkedBound("x", "5" as unknown as number, 77)).toThrow(/default, 77 ms/);
  });
});

describe("withDeadline", () => {
  it("answers what the work answered, and ends the work's signal", async () => {
    let seen: AbortSignal | undefined;
    const v = await withDeadline(async (s) => { seen = s; return 7; }, { timeoutError: timeout, abortError: aborted });
    expect(v).toBe(7);
    expect(seen!.aborted).toBe(true);
  });
  it("rethrows the work's own rejection", async () => {
    await expect(withDeadline(async () => { throw new Error("boom"); }, { ms: 50, timeoutError: timeout, abortError: aborted })).rejects.toThrow("boom");
  });
  it("a work that throws at once is a rejection, not a throw", async () => {
    await expect(withDeadline(() => { throw new Error("sync"); }, { timeoutError: timeout, abortError: aborted })).rejects.toThrow("sync");
  });
  it("ends with the timeout error at the deadline, aborting the work's signal", async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      const p = withDeadline((s) => { seen = s; return never(); }, { ms: 100, timeoutError: timeout, abortError: aborted });
      const caught = p.catch((e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(99);
      expect(seen!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await caught).toBe("timeout");
      expect(seen!.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("ends with the abort error when a parent aborts", async () => {
    const parent = new AbortController();
    const p = withDeadline(() => never(), { parents: [parent.signal], timeoutError: timeout, abortError: aborted });
    parent.abort();
    await expect(p).rejects.toThrow("aborted");
  });
  it("a parent that has already aborted: the work is never started", async () => {
    const parent = new AbortController();
    parent.abort();
    const work = vi.fn(async () => 1);
    await expect(withDeadline(work, { parents: [parent.signal], timeoutError: timeout, abortError: aborted })).rejects.toThrow("aborted");
    expect(work).not.toHaveBeenCalled();
  });
  it("a bound that is not allowed is a RangeError and nothing is started", () => {
    const work = vi.fn(async () => 1);
    expect(() => withDeadline(work, { ms: 0, timeoutError: timeout, abortError: aborted })).toThrow(RangeError);
    expect(work).not.toHaveBeenCalled();
  });
  it("the work's late answer after the deadline is swallowed", async () => {
    vi.useFakeTimers();
    try {
      let late: (v: number) => void = () => {};
      const p = withDeadline(() => new Promise<number>((r) => { late = r; }), { ms: 10, timeoutError: timeout, abortError: aborted });
      const caught = p.catch((e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(11);
      expect(await caught).toBe("timeout");
      late(5);
      await vi.advanceTimersByTimeAsync(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

function stub(calls: string[]): VocabularySource {
  return {
    termIri: (p) => `https://h.example.test/base/${p}`,
    term: async (iri, signal) => { calls.push(`term ${iri} ${signal ? "signal" : "-"}`); return { "@id": iri }; },
    children: async (iri, signal) => { calls.push(`children ${iri} ${signal ? "signal" : "-"}`); return { children: [], complete: true }; },
    carriersOf: async (keys, signal) => { calls.push(`carriers ${keys.join(",")} ${signal ? "signal" : "-"}`); return { terms: [], complete: true, incompleteAt: [] }; },
  };
}

describe("boundSource", () => {
  it("passes its signal to every read and answers what the source answered", async () => {
    const calls: string[] = [];
    const ac = new AbortController();
    const b = boundSource(stub(calls), ac.signal, aborted);
    expect(b.termIri("t/X")).toBe("https://h.example.test/base/t/X");
    expect(await b.term("https://h.example.test/base/t/X")).toEqual({ "@id": "https://h.example.test/base/t/X" });
    expect((await b.children("c")).complete).toBe(true);
    expect((await b.carriersOf(["k1", "k2"])).complete).toBe(true);
    expect(calls).toEqual(["term https://h.example.test/base/t/X signal", "children c signal", "carriers k1,k2 signal"]);
  });
  it("has no terms() when the source has none, and has one when it has", () => {
    const calls: string[] = [];
    expect(boundSource(stub(calls), new AbortController().signal, aborted).terms).toBeUndefined();
    const withTerms = { ...stub(calls), terms: (iris: readonly string[]) => iris.map(async (i) => ({ "@id": i })) };
    expect(typeof boundSource(withTerms, new AbortController().signal, aborted).terms).toBe("function");
  });
  it("a read asked for after the signal aborted is refused with the stopped error and never sent", async () => {
    const calls: string[] = [];
    const ac = new AbortController();
    ac.abort();
    const b = boundSource({ ...stub(calls), terms: (iris) => { calls.push("terms"); return iris.map(async (i) => ({ "@id": i })); } }, ac.signal, aborted);
    await expect(b.term("x")).rejects.toThrow("aborted");
    await expect(b.children("x")).rejects.toThrow("aborted");
    await expect(b.carriersOf(["k"])).rejects.toThrow("aborted");
    const many = b.terms!(["a", "b"]);
    expect(many).toHaveLength(2);
    await expect(many[0]).rejects.toThrow("aborted");
    await expect(many[1]).rejects.toThrow("aborted");
    expect(calls).toEqual([]);
  });
  it("a read in flight ends with the stopped error when the signal aborts, though the source ignores the signal", async () => {
    const ac = new AbortController();
    const hang: VocabularySource = { ...stub([]), term: () => never() };
    const b = boundSource(hang, ac.signal, aborted);
    const p = b.term("x");
    ac.abort();
    await expect(p).rejects.toThrow("aborted");
  });
  it("terms() calls the source's own terms with the signal, one bounded promise per IRI, in order", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const ac = new AbortController();
    const src: VocabularySource = { ...stub([]), terms: function (iris, signal) { seen.push(signal); return iris.map(async (i) => ({ "@id": i })); } };
    const out = await Promise.all(boundSource(src, ac.signal, aborted).terms!(["a", "b"]));
    expect(out.map((d) => d["@id"])).toEqual(["a", "b"]);
    expect(seen[0]).toBe(ac.signal);
  });
  it("a terms() that throws becomes one rejection per IRI, not a throw", async () => {
    const src: VocabularySource = { ...stub([]), terms: () => { throw new Error("nope"); } };
    const out = boundSource(src, new AbortController().signal, aborted).terms!(["a", "b"]);
    await expect(out[0]).rejects.toThrow("nope");
    await expect(out[1]).rejects.toThrow("nope");
  });
});
