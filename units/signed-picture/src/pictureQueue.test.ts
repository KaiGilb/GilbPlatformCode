import { describe, expect, test } from "vitest";
import { queuePicture } from "./index";

type Job = { started: boolean; resolve: (v: string) => void; reject: (e: Error) => void; promise: Promise<string> };

function ten(n: number): { jobs: Job[]; results: Promise<string>[]; order: number[]; inFlight: () => number; peak: () => number } {
  const jobs: Job[] = [];
  const order: number[] = [];
  let running = 0;
  let max = 0;
  const results = Array.from({ length: n }, (_v, i) => {
    let resolve!: (v: string) => void;
    let reject!: (e: Error) => void;
    const inner = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job = { started: false, resolve, reject, promise: inner };
    jobs.push(job);
    return queuePicture(async () => {
      job.started = true;
      order.push(i);
      running++;
      max = Math.max(max, running);
      try {
        return await inner;
      } finally {
        running--;
      }
    });
  });
  return { jobs, results, order, inFlight: () => running, peak: () => max };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("queuePicture", () => {
  test("never runs more than 4 at once, and runs the rest in order as slots free", async () => {
    const q = ten(10);
    await tick();
    expect(q.order).toEqual([0, 1, 2, 3]);
    expect(q.inFlight()).toBe(4);
    q.jobs[1]!.resolve("b");
    await tick();
    expect(q.order).toEqual([0, 1, 2, 3, 4]);
    expect(q.inFlight()).toBe(4);
    q.jobs[0]!.resolve("a");
    q.jobs[2]!.resolve("c");
    await tick();
    expect(q.order).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let i = 3; i < 10; i++) {
      q.jobs[i]!.resolve(String(i));
      await tick();
    }
    expect(q.order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(q.peak()).toBe(4);
    await expect(Promise.all(q.results)).resolves.toHaveLength(10);
  });
  test("each call gets its own job's answer", async () => {
    const q = ten(6);
    for (let i = 0; i < 6; i++) q.jobs[i]!.resolve(`v${i}`);
    await expect(Promise.all(q.results)).resolves.toEqual(["v0", "v1", "v2", "v3", "v4", "v5"]);
  });
  test("a rejection frees its slot and reaches only its own caller", async () => {
    const q = ten(6);
    await tick();
    expect(q.order).toEqual([0, 1, 2, 3]);
    q.jobs[0]!.reject(new Error("boom"));
    await expect(q.results[0]).rejects.toThrow("boom");
    await tick();
    expect(q.order).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < 6; i++) q.jobs[i]!.resolve(String(i));
    await expect(Promise.all(q.results.slice(1))).resolves.toEqual(["1", "2", "3", "4", "5"]);
  });
  test("four jobs run at once with nothing waiting", async () => {
    const q = ten(4);
    await tick();
    expect(q.inFlight()).toBe(4);
    q.jobs.forEach((j, i) => j.resolve(String(i)));
    await Promise.all(q.results);
  });
  test("a fifth job waits for a slot", async () => {
    const q = ten(5);
    await tick();
    expect(q.jobs[4]!.started).toBe(false);
    q.jobs[0]!.resolve("x");
    await tick();
    expect(q.jobs[4]!.started).toBe(true);
    q.jobs.slice(1).forEach((j) => j.resolve("y"));
    await Promise.all(q.results);
  });
});
