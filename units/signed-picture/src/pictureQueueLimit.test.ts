import { afterEach, describe, expect, test } from "vitest";
import { queuePicture, setPictureQueueLimit } from "./index";

const tick = () => new Promise((r) => setTimeout(r, 0));

function ten(n: number) {
  const started: number[] = [];
  const release: Array<() => void> = [];
  const results = Array.from({ length: n }, (_v, i) =>
    queuePicture(
      () =>
        new Promise<number>((res) => {
          started.push(i);
          release[i] = () => res(i);
        }),
    ),
  );
  return { started, release, results };
}

afterEach(() => setPictureQueueLimit(4));

describe("setPictureQueueLimit", () => {
  test("the default is 4", async () => {
    const q = ten(10);
    await tick();
    expect(q.started).toEqual([0, 1, 2, 3]);
    q.release.forEach((r) => r?.());
    for (let i = 0; i < 10; i++) {
      await tick();
      q.release.forEach((r) => r?.());
    }
    await Promise.all(q.results);
  });
  test("6 runs six of ten at once", async () => {
    setPictureQueueLimit(6);
    const q = ten(10);
    await tick();
    expect(q.started).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 0; i < 10; i++) {
      q.release.forEach((r) => r?.());
      await tick();
    }
    await Promise.all(q.results);
  });
  test("0, 1.5, negative, NaN and Infinity throw RangeError and change nothing", async () => {
    for (const bad of [0, 1.5, -1, NaN, Infinity]) expect(() => setPictureQueueLimit(bad)).toThrow(RangeError);
    const q = ten(10);
    await tick();
    expect(q.started).toEqual([0, 1, 2, 3]);
    for (let i = 0; i < 10; i++) {
      q.release.forEach((r) => r?.());
      await tick();
    }
    await Promise.all(q.results);
  });
  test("1 runs one at a time", async () => {
    setPictureQueueLimit(1);
    const q = ten(3);
    await tick();
    expect(q.started).toEqual([0]);
    q.release[0]!();
    await tick();
    expect(q.started).toEqual([0, 1]);
    q.release[1]!();
    await tick();
    q.release[2]!();
    await Promise.all(q.results);
  });
  test("raising it mid-way starts the waiting jobs at once", async () => {
    const q = ten(10);
    await tick();
    expect(q.started).toEqual([0, 1, 2, 3]);
    setPictureQueueLimit(6);
    expect(q.started).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 0; i < 10; i++) {
      q.release.forEach((r) => r?.());
      await tick();
    }
    await Promise.all(q.results);
  });
  test("lowering it mid-way lets the running ones finish and starts no new one until there is room", async () => {
    const q = ten(8);
    await tick();
    setPictureQueueLimit(2);
    q.release[0]!();
    q.release[1]!();
    await tick();
    expect(q.started).toEqual([0, 1, 2, 3]);
    q.release[2]!();
    await tick();
    expect(q.started).toEqual([0, 1, 2, 3, 4]);
    for (let i = 0; i < 10; i++) {
      q.release.forEach((r) => r?.());
      await tick();
    }
    await Promise.all(q.results);
  });
});
