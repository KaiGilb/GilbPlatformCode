import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_BUSY_FAILS, MAX_OTHER_FAILS, RETRY_DELAYS_MS, dropOp, listOps, memoryStore, saveOp, setQueueStore, type PendingOp, type QueueStore } from "./index";

const op = (o: Partial<PendingOp>): PendingOp => ({ id: "op1", kind: "create", change: { name: "Fern", count: 2 }, createdAt: "2026-11-07T09:00:00.000Z", tries: 0, principal: "ann", ...o });

beforeEach(() => {
  setQueueStore(memoryStore());
});
afterEach(() => {
  setQueueStore(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Ported from TestFlowerPower test/batch5.test.ts:152, ids changed.
test("the queue stores, lists oldest first, and drops", async () => {
  await saveOp(op({ id: "b", createdAt: "2026-11-07T10:00:00.000Z" }));
  await saveOp(op({ id: "a", createdAt: "2026-11-07T09:00:00.000Z", pictureBlob: new Blob(["x"], { type: "image/jpeg" }) }));
  expect((await listOps()).map((o) => o.id)).toEqual(["a", "b"]);
  expect((await listOps())[0]!.pictureBlob).toBeInstanceOf(Blob);
  await dropOp("a");
  expect((await listOps()).map((o) => o.id)).toEqual(["b"]);
});

test("the bounds are 5 other failures, 8 busy answers, and delays of 2 s, 5 s, 15 s, 30 s", () => {
  expect(MAX_OTHER_FAILS).toBe(5);
  expect(MAX_BUSY_FAILS).toBe(8);
  expect(RETRY_DELAYS_MS).toEqual([2000, 5000, 15000, 30000]);
});

describe("a store that never answers", () => {
  const hung: QueueStore = {
    getAll: () => new Promise(() => {}),
    put: () => new Promise(() => {}),
    remove: () => new Promise(() => {}),
  };
  const settled = async (p: Promise<unknown>, ms: number) => {
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(ms);
    return done;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setQueueStore(hung);
  });

  test("listOps answers an empty queue after 1500 ms, not before", async () => {
    const p = listOps();
    expect(await settled(p, 1499)).toBe(false);
    expect(await settled(p, 1)).toBe(true);
    expect(await p).toEqual([]);
  });
  test("saveOp resolves after 1500 ms and does not throw", async () => {
    const p = saveOp(op({}));
    expect(await settled(p, 1499)).toBe(false);
    expect(await settled(p, 1)).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });
  test("dropOp resolves after 1500 ms and does not throw", async () => {
    const p = dropOp("op1");
    expect(await settled(p, 1499)).toBe(false);
    expect(await settled(p, 1)).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });
});

test("a record of the host's own type round-trips through the memory store unchanged", async () => {
  const stored: PendingOp<{ title: string }> = { ...op({ id: "r1", kind: "update", recordId: "rec-1" }), record: { title: "Fern" } };
  const store = memoryStore();
  await store.put(stored);
  const [back] = await store.getAll();
  expect(back).toEqual(stored);
  expect((back as PendingOp<{ title: string }>).record?.title).toBe("Fern");
});
