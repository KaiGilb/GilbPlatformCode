import { describe, expect, it } from "vitest";
import { MAX_PARALLEL_DEREFERENCES, mapWithConcurrency } from "./mapWithConcurrency";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

describe("mapWithConcurrency", () => {
  it("returns the results in input order", async () => {
    const out = await mapWithConcurrency([30, 1, 10], 3, async (n, i) => {
      await new Promise((r) => setTimeout(r, n));
      return `${i}:${n}`;
    });
    expect(out).toEqual(["0:30", "1:1", "2:10"]);
  });

  it("an empty list is an empty answer and runs nothing", async () => {
    let calls = 0;
    expect(await mapWithConcurrency([], 4, async () => (calls += 1))).toEqual([]);
    expect(calls).toBe(0);
  });

  it("never has more than `limit` calls in flight", async () => {
    let live = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await tick();
      live -= 1;
    });
    expect(peak).toBe(4);
  });

  it("a limit below 1 still runs one at a time", async () => {
    let live = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await tick();
      live -= 1;
    });
    expect(peak).toBe(1);
  });

  it("when a call throws, no further item is started and the first error is thrown", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 1, async (n) => {
        started.push(n);
        if (n === 1) throw new Error("first");
        return n;
      }),
    ).rejects.toThrow("first");
    expect(started).toEqual([0, 1]);
  });

  it("a second worker stops taking items once another call has thrown", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (n) => {
        started.push(n);
        if (n === 0) throw new Error("zero");
        await new Promise((r) => setTimeout(r, 5));
        return n;
      }),
    ).rejects.toThrow("zero");
    expect(started).toEqual([0, 1]);
  });

  it("calls already running are allowed to finish before it rejects, and the first error wins", async () => {
    const finished: number[] = [];
    await expect(
      mapWithConcurrency([0, 1], 2, async (n) => {
        if (n === 0) throw new Error("zero");
        await new Promise((r) => setTimeout(r, 5));
        finished.push(n);
        throw new Error("one");
      }),
    ).rejects.toThrow("zero");
    expect(finished).toEqual([1]);
  });

  it("the cap for a census is 6", () => {
    expect(MAX_PARALLEL_DEREFERENCES).toBe(6);
  });
});
