import { afterEach, describe, expect, test, vi } from "vitest";
import { afterFailure, busyDelayMs, classifyWith, listOpsFor, memoryStore, opStatus, opsFor, progressOf, listOps, resetForRetry, saveOp, setQueueStore, stampOp, stopsFlush, type FailureTests, type PendingOp } from "./index";

const op = (o: Partial<PendingOp> = {}): PendingOp => ({ id: "op1", kind: "create", change: { name: "Fern" }, createdAt: "2026-11-07T09:00:00.000Z", tries: 0, principal: "ann", ...o });
const tests = (t: Partial<FailureTests> = {}): FailureTests => ({ refusedForGood: () => false, busy: () => false, notSignedIn: () => false, ...t });

afterEach(() => {
  setQueueStore(null);
  vi.unstubAllGlobals();
});

describe("classifyWith", () => {
  // Ported from TestFlowerPower test/batch5.test.ts:162: the two refusals are now the host's test.
  test("a refusal the host names is dropped; TypeError is network; anything else is other", () => {
    class Refused extends Error {}
    const t = tests({ refusedForGood: (e) => e instanceof Refused });
    expect(classifyWith(new Refused(), t)).toBe("drop");
    expect(classifyWith(new Refused("changed elsewhere"), t)).toBe("drop");
    expect(classifyWith(new TypeError("Failed to fetch"), t)).toBe("network");
    expect(classifyWith(new Error("something odd"), t)).toBe("other");
  });
  test("the order: drop before busy, busy before not-signed-in", () => {
    const e = new Error("x");
    expect(classifyWith(e, tests({ refusedForGood: () => true, busy: () => true }))).toBe("drop");
    expect(classifyWith(e, tests({ busy: () => true, notSignedIn: () => true }))).toBe("busy");
  });
  test("not signed in alone, a TypeError, a fetch message, and an offline browser are network", () => {
    expect(classifyWith(new Error("x"), tests({ notSignedIn: () => true }))).toBe("network");
    expect(classifyWith(new TypeError(), tests())).toBe("network");
    expect(classifyWith(new Error("Failed to fetch"), tests())).toBe("network");
    vi.stubGlobal("navigator", { onLine: false });
    expect(classifyWith(new Error("x"), tests())).toBe("network");
  });
  test("an unknown error while online is other", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(classifyWith(new Error("x"), tests())).toBe("other");
  });
  test("every word of the fetch message list is network", () => {
    for (const m of ["fetch failed", "a Network error", "you are offline", "Load failed"]) expect(classifyWith(new Error(m), tests())).toBe("network");
  });
});

test("busyDelayMs: 2 s, 5 s, 15 s, then 30 s however many answers", () => {
  expect([1, 2, 3, 4, 5, 6].map(busyDelayMs)).toEqual([2000, 5000, 15000, 30000, 30000, 30000]);
});

describe("afterFailure", () => {
  const run = (kind: "other" | "busy" | "network", times: number) => {
    let cur = op();
    const seen: PendingOp[] = [];
    for (let i = 0; i < times; i++) {
      cur = afterFailure(cur, kind, "Sentence.");
      seen.push(cur);
    }
    return seen;
  };
  test("other: stuck only on the fifth failure, with the sentence", () => {
    const seen = run("other", 5);
    for (const o of seen.slice(0, 4)) expect(o.stuckSentence).toBeUndefined();
    expect(seen[4]!.stuckSentence).toBe("Sentence.");
    expect(seen[4]!.otherFails).toBe(5);
  });
  test("busy: not stuck for seven answers, the busy sentence is kept, stuck on the eighth", () => {
    const seen = run("busy", 8);
    for (const o of seen.slice(0, 7)) {
      expect(o.stuckSentence).toBeUndefined();
      expect(o.busySentence).toBe("Sentence.");
    }
    expect(seen[7]!.stuckSentence).toBe("Sentence.");
    expect(seen[7]!.busyFails).toBe(8);
  });
  test("network: twenty failures are never stuck, tries count up, the other counts do not move", () => {
    const seen = run("network", 20);
    for (const o of seen) {
      expect(o.stuckSentence).toBeUndefined();
      expect(o.otherFails).toBe(0);
      expect(o.busyFails).toBe(0);
    }
    expect(seen[19]!.tries).toBe(20);
  });
  test("it returns a new op and leaves the one it was given", () => {
    const before = op();
    const after = afterFailure(before, "other", "s");
    expect(after).not.toBe(before);
    expect(before.tries).toBe(0);
    expect(before.otherFails).toBeUndefined();
  });
});

test("resetForRetry clears the stuck sentence and both counts, and keeps tries and the busy sentence", () => {
  const stuck = op({ tries: 9, otherFails: 5, busyFails: 8, busySentence: "Busy.", stuckSentence: "Stuck." });
  const next = resetForRetry(stuck);
  expect(next.stuckSentence).toBeUndefined();
  expect("stuckSentence" in next).toBe(false);
  expect(next.otherFails).toBe(0);
  expect(next.busyFails).toBe(0);
  expect(next.tries).toBe(9);
  expect(next.busySentence).toBe("Busy.");
  expect(stuck.stuckSentence).toBe("Stuck.");
});

describe("one queue per person", () => {
  const mixed = () => [op({ id: "a2", principal: "ann", createdAt: "2026-11-07T11:00:00.000Z" }), op({ id: "b1", principal: "ben", createdAt: "2026-11-07T10:00:00.000Z" }), op({ id: "a1", principal: "ann", createdAt: "2026-11-07T09:00:00.000Z" })];
  test("opsFor keeps one person's ops and none for nobody", () => {
    expect(opsFor(mixed(), "ann").map((o) => o.id)).toEqual(["a2", "a1"]);
    expect(opsFor(mixed(), "ben").map((o) => o.id)).toEqual(["b1"]);
    expect(opsFor(mixed(), null)).toEqual([]);
    expect(opsFor(mixed(), "nobody")).toEqual([]);
  });
  test("listOpsFor reads Ann's ops oldest first out of a store that also holds Ben's; null answers none", async () => {
    setQueueStore(memoryStore());
    for (const o of mixed()) await saveOp(o);
    expect((await listOpsFor("ann")).map((o) => o.id)).toEqual(["a1", "a2"]);
    expect((await listOpsFor("ben")).map((o) => o.id)).toEqual(["b1"]);
    expect(await listOpsFor(null)).toEqual([]);
    expect(await listOps()).toHaveLength(3);
  });
  test("an op stored with no principal at all is never given to nobody", () => {
    const strange = { ...op({ id: "x" }), principal: null } as unknown as PendingOp;
    expect(opsFor([strange], null)).toEqual([]);
  });
  test("only null is nobody: an empty-string principal matches ops stamped with it (source behaviour)", () => {
    expect(opsFor([op({ principal: "" })], "")).toHaveLength(1);
  });
});

test("stampOp: nobody signed in queues nothing; a person is stamped on", () => {
  const { principal: _p, ...input } = op();
  expect(stampOp(input, null)).toBeNull();
  expect(stampOp(input, "")).toBeNull();
  expect(stampOp(input, "ann")!.principal).toBe("ann");
  expect(stampOp(input, "ann")).toEqual({ ...input, principal: "ann" });
});

test("opStatus: stuck wins over sending; sending is saving; else failed", () => {
  expect(opStatus(op({ stuckSentence: "s" }), true)).toBe("stuck");
  expect(opStatus(op({ stuckSentence: "s" }), false)).toBe("stuck");
  expect(opStatus(op(), true)).toBe("saving");
  expect(opStatus(op(), false)).toBe("failed");
});

test("stopsFlush: only network and busy stop the loop", () => {
  expect(stopsFlush("network")).toBe(true);
  expect(stopsFlush("busy")).toBe(true);
  expect(stopsFlush("ok")).toBe(false);
  expect(stopsFlush("other")).toBe(false);
  expect(stopsFlush("drop")).toBe(false);
});

describe("progressOf", () => {
  test("onProgress writes the step onto the same op object and into the store", async () => {
    setQueueStore(memoryStore());
    const o = op({ id: "p1" });
    await progressOf(o).onProgress({ masterEntity: "m" });
    expect(o.masterEntity).toBe("m");
    expect((await listOps()).find((x) => x.id === "p1")!.masterEntity).toBe("m");
  });
  test("a second progressOf carries the finished step, so the host's send skips it", async () => {
    setQueueStore(memoryStore());
    const o = op({ id: "p2" });
    expect(progressOf(o).progress).toEqual({});
    await progressOf(o).onProgress({ masterEntity: "m" });
    expect(progressOf(o).progress).toEqual({ masterEntity: "m" });
    await progressOf(o).onProgress({ thumbEntity: "t", thumbLinked: true });
    expect(progressOf(o).progress).toEqual({ masterEntity: "m", thumbEntity: "t", thumbLinked: true });
  });
});
