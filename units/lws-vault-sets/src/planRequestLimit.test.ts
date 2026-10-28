import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { MAX_PARALLEL_DEREFERENCES } from "./mapWithConcurrency";
import { createLimiter, planReadLimit } from "./planRequestLimit";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

describe("createLimiter", () => {
  it("runs at most `limit` calls at once and answers each caller its own result", async () => {
    const limiter = createLimiter(2);
    let live = 0;
    let peak = 0;
    const out = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        limiter.run(async () => {
          live += 1;
          peak = Math.max(peak, live);
          await tick();
          live -= 1;
          return i;
        }),
      ),
    );
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(2);
  });

  it("starts the calls in the order they were asked (FIFO)", async () => {
    const limiter = createLimiter(1);
    const order: number[] = [];
    await Promise.all([0, 1, 2, 3].map((i) => limiter.run(async () => void order.push(i))));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("a call that throws or rejects still frees its slot", async () => {
    const limiter = createLimiter(1);
    const a = limiter.run(async () => {
      throw new Error("a");
    });
    const b = limiter.run(() => {
      throw new Error("b-sync");
    });
    const c = limiter.run(async () => "c");
    await expect(a).rejects.toThrow("a");
    await expect(b).rejects.toThrow("b-sync");
    await expect(c).resolves.toBe("c");
  });

  it("does not start the call on the caller's own turn", async () => {
    const limiter = createLimiter(1);
    let started = false;
    const p = limiter.run(async () => (started = true));
    expect(started).toBe(false);
    await p;
    expect(started).toBe(true);
  });
});

describe("planReadLimit", () => {
  it("is one limiter per query client, of MAX_PARALLEL_DEREFERENCES", async () => {
    const qc = new QueryClient();
    expect(planReadLimit(qc)).toBe(planReadLimit(qc));
    expect(planReadLimit(new QueryClient())).not.toBe(planReadLimit(qc));
    let live = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        planReadLimit(qc).run(async () => {
          live += 1;
          peak = Math.max(peak, live);
          await tick();
          live -= 1;
        }),
      ),
    );
    expect(peak).toBe(MAX_PARALLEL_DEREFERENCES);
  });
});
