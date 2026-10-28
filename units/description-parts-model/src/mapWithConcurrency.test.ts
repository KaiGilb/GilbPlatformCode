// The bounded fan-out. On a throw it starts nothing new, awaits the calls already running, and rethrows the first error
// (the `map-limit` unit behaves differently on a throw, which is why this copy is here).
import { describe, expect, it } from "vitest";
import { MAX_PARALLEL_DEREFERENCES, mapWithConcurrency } from "./mapWithConcurrency";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("allows 6 in flight", () => {
    expect(MAX_PARALLEL_DEREFERENCES).toBe(6);
  });

  it("is [] for no items, without calling the function", async () => {
    let calls = 0;
    expect(await mapWithConcurrency([], 3, async () => (calls += 1))).toEqual([]);
    expect(calls).toBe(0);
  });

  it("returns the results in the order of the items, whichever finishes first", async () => {
    const out = await mapWithConcurrency([30, 1, 15, 2], 4, async (ms, i) => {
      await wait(ms);
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:1", "2:15", "3:2"]);
  });

  it("gives the function the item and its index", async () => {
    const seen: [string, number][] = [];
    await mapWithConcurrency(["a", "b", "c"], 2, async (item, i) => void seen.push([item, i]));
    expect(seen.sort()).toEqual([["a", 0], ["b", 1], ["c", 2]]);
  });

  it("never has more than 'limit' in flight, and uses all of them", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await wait(2);
      inFlight -= 1;
    });
    expect(peak).toBe(4);
  });

  it("runs one at a time for a limit below 1, and starts no more workers than items", async () => {
    for (const limit of [0, -3]) {
      let inFlight = 0;
      let peak = 0;
      await mapWithConcurrency([1, 2, 3], limit, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await wait(1);
        inFlight -= 1;
      });
      expect(peak, String(limit)).toBe(1);
    }
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2], 100, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await wait(1);
      inFlight -= 1;
    });
    expect(peak).toBe(2);
  });

  it("starts no worker at all for a limit of NaN: nothing is called and the result is an array of holes", async () => {
    let calls = 0;
    const out = await mapWithConcurrency([1, 2, 3], Number.NaN, async () => (calls += 1));
    expect(calls).toBe(0);
    expect(out).toHaveLength(3);
    expect(0 in out).toBe(false);
  });

  it("on a throw: starts nothing new, lets the running calls finish, then rejects with the first error", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    let rejectedAfter: number[] | null = null;
    const run = mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async (i) => {
      started.push(i);
      await wait(i === 0 ? 20 : i === 1 ? 2 : 8);
      if (i === 1) throw new Error("first");
      if (i === 2) throw new Error("second");
      finished.push(i);
    });
    await expect(run).rejects.toThrow("first");
    rejectedAfter = [...finished];
    expect(started).toEqual([0, 1, 2]);
    // The call still running when the first error came (item 0) was awaited before the rejection.
    expect(rejectedAfter).toEqual([0]);
  });

  it("rethrows the very value that was thrown", async () => {
    await expect(mapWithConcurrency([1, 2], 1, async () => Promise.reject("plain string"))).rejects.toBe("plain string");
    const error = new Error("x");
    await expect(
      mapWithConcurrency([1], 1, () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it("starts the next item only after a worker is free, in item order", async () => {
    const started: number[] = [];
    await mapWithConcurrency([0, 1, 2, 3, 4], 2, async (i) => {
      started.push(i);
      await wait(2);
    });
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });
});
