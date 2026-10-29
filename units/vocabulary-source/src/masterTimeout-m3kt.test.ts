// Ported from `gilb-stakeholders` `test/masterTimeout-m3kt.test.ts` at 27fe0cef: 12 of its 34 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { masterSource, MASTER_READ_CAP_MS, MASTER_REQUEST_TIMEOUT_MS } from "./source";
import { MasterTimeoutError, VocabularyUnavailableError } from "./terms";
import { withDeadline } from "./deadline";
import { fixtureMaster, RIG } from "../test/support";


type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

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
afterEach(() => {
  vi.useRealTimers();
});

describe("the bounds", () => {
  it("are 10 s per master request and 20 s per reading", () => {
    expect(MASTER_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(MASTER_READ_CAP_MS).toBe(20_000);
  });
});

describe("masterSource: each request is aborted after the request bound", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });

  it("a request that never answers (its fetch ignores the signal) rejects 'not known yet' at 10,000 ms, not before, and its signal is aborted", async () => {
    const h = hangingMaster(false);
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch });
    const s = watch(src.term(src.termIri("t/Stakeholder")));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(s.state).toBe("pending");
    expect(h.sent[0]!.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.state).toBe("rejected");
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    expect(s.error).toBeInstanceOf(VocabularyUnavailableError);
    expect((s.error as MasterTimeoutError).ms).toBe(10_000);
    expect(h.sent[0]!.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a fetch that honours the signal ends at the bound too, as a timeout (not as a raw AbortError)", async () => {
    const h = hangingMaster(true);
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch, timeoutMs: 250 });
    const s = watch(src.children(src.termIri("t/Person")));
    await vi.advanceTimersByTimeAsync(250);
    expect(s.state).toBe("rejected");
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    expect((s.error as MasterTimeoutError).ms).toBe(250);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a body that never ends is inside the bound: the answer's headers came, its JSON never does", async () => {
    const fetch: Fetch = async () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "content-type": "application/json" } });
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: fetch, timeoutMs: 300 });
    const s = watch(src.term(src.termIri("t/Stakeholder")));
    await vi.advanceTimersByTimeAsync(299);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
  });

  it("an answer inside the bound is read as before, and leaves no timer", async () => {
    const m = fixtureMaster();
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
    const doc = await src.term(src.termIri("t/Stakeholder"));
    expect(doc["@id"]).toBe("https://ontology.platform.example.test/base/t/Stakeholder");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("no fan-out: a named read of three types that times out is ONE request, and each of the three is 'not known yet', never read one by one", async () => {
    const h = hangingMaster(false);
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch });
    const all = src.terms!(["t/Person", "t/Organization", "t/PartyGroup"].map((p) => src.termIri(p))).map(watch);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(all.map((s) => s.error instanceof MasterTimeoutError)).toEqual([true, true, true]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sent.length).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("control: a named read the master refuses (500) is still read term by term, as before", async () => {
    const m = fixtureMaster();
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: async (u, i) => (u.includes("/base/vocab?") ? new Response("no", { status: 500 }) : m.fetch(u, i)) });
    const docs = await Promise.all(src.terms!(["t/Person", "t/Organization"].map((p) => src.termIri(p))));
    expect(docs.map((d) => d["@id"])).toEqual(["https://ontology.platform.example.test/base/t/Person", "https://ontology.platform.example.test/base/t/Organization"]);
  });

  it("each request has its own bound: three at once all end at 10,000 ms", async () => {
    const h = hangingMaster(false);
    const src = masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch });
    const all = ["t/A", "t/B", "t/C"].map((p) => watch(src.term(src.termIri(p))));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(all.map((s) => s.state)).toEqual(["rejected", "rejected", "rejected"]);
    expect(h.sent.map((x) => x.signal?.aborted)).toEqual([true, true, true]);
  });
});

// ── A bound is never switched off ──────────────────────────────────────────────────────────────
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

  it("left out, each bound takes its default; a small finite bound is kept as given", async () => {
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(false);
    const s = watch(masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch }).term(`${RIG}/base/t/Person`));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    const q = watch(masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch, timeoutMs: 0.5 }).term(`${RIG}/base/t/Person`));
    await vi.advanceTimersByTimeAsync(1);
    expect(q.error).toBeInstanceOf(MasterTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("round 3 ruling: a bound above 2,147,483,647 ms (setTimeout's limit) is refused with the same RangeError", () => {
  const TOO_BIG = [2 ** 31, 2 ** 40, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE] as const;

  it("2,147,483,647 ms itself is kept as given: the request is still pending after a day, and ends at its bound", async () => {
    vi.useFakeTimers({ now: T0 });
    const h = hangingMaster(false);
    const s = watch(masterSource({ vedaOrigin: RIG, fetchImpl: h.fetch, timeoutMs: 2_147_483_647 }).term(`${RIG}/base/t/Person`));
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(s.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(2_147_483_647 - 86_400_000);
    expect(s.error).toBeInstanceOf(MasterTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
