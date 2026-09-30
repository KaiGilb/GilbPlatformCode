import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./mapLimit";

describe("mapWithConcurrency", () => {
  it("returns an empty list without calling fn", async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async () => {
      calls += 1;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("keeps input order when a later item finishes first", async () => {
    const out = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it("never has more than limit calls in flight, and a non-positive limit means one", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);

    let peakOne = 0;
    let now = 0;
    await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      now += 1;
      peakOne = Math.max(peakOne, now);
      await new Promise((resolve) => setTimeout(resolve, 5));
      now -= 1;
      return n;
    });
    expect(peakOne).toBe(1);
  });

  it("rejects when fn throws, rather than returning a short list", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("stop");
        return n;
      }),
    ).rejects.toThrow("stop");
  });

  it("passes the original index", async () => {
    const out = await mapWithConcurrency(["a", "b"], 2, async (item, index) => `${index}:${item}`);
    expect(out).toEqual(["0:a", "1:b"]);
  });
});
