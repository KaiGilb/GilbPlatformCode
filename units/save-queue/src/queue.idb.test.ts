import "fake-indexeddb/auto";
import { describe, expect, test, vi } from "vitest";
import { idbStore, listOps, setQueueStore, setQueueDbName, type PendingOp } from "./index";

const op = (id: string, createdAt: string): PendingOp => ({ id, kind: "create", change: { name: id }, createdAt, tries: 0, principal: "ann" });

describe("the IndexedDB store", () => {
  test("with no database name set, the first read rejects and says to call setQueueDbName", async () => {
    await expect(idbStore().getAll()).rejects.toThrow(/setQueueDbName/);
  });
  test("with no database name set, listOps answers an empty queue (a failing store reads as empty)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setQueueStore(null);
    expect(await listOps()).toEqual([]);
    setQueueStore(null);
    vi.restoreAllMocks();
  });
  test("round trip: put two ops, read both, remove one", async () => {
    setQueueDbName("example-queue");
    const store = idbStore();
    await store.put(op("a", "2026-11-07T09:00:00.000Z"));
    await store.put(op("b", "2026-11-07T10:00:00.000Z"));
    expect((await store.getAll()).map((o) => o.id).sort()).toEqual(["a", "b"]);
    await store.remove("a");
    expect((await store.getAll()).map((o) => o.id)).toEqual(["b"]);
  });
  test("the database is the one named", async () => {
    setQueueDbName("example-queue");
    await idbStore().put(op("c", "2026-11-07T11:00:00.000Z"));
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).toContain("example-queue");
  });
});
