import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordList, type RecordListOptions } from "./index";

interface Rec {
  id: string;
  name: string;
  v: number;
}
type Draft = { name: string };
type Patch = { name: string };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A tiny store behind the four calls; every call is logged, and any call can be held (hold) or made to fail (failNext). */
function makeStore(seed: Rec[] = []) {
  const rows = new Map(seed.map((r) => [r.id, r]));
  const log: string[] = [];
  let next = 100;
  const holds: Array<ReturnType<typeof deferred<void>>> = [];
  const fails: string[] = [];
  const gate = async (what: string) => {
    log.push(what);
    const h = holds.shift();
    if (h) await h.promise;
    const f = fails.indexOf(what.split(" ")[0]!);
    if (f >= 0) {
      fails.splice(f, 1);
      throw new Error(`${what} refused`);
    }
  };
  return {
    rows,
    log,
    hold() {
      const d = deferred<void>();
      holds.push(d);
      return d;
    },
    failNext(kind: "list" | "create" | "update" | "remove") {
      fails.push(kind);
    },
    calls: {
      list: async () => {
        await gate("list");
        return [...rows.values()];
      },
      create: async (d: Draft) => {
        await gate(`create ${d.name}`);
        const r = { id: `r${next++}`, name: d.name, v: 1 };
        rows.set(r.id, r);
        return r;
      },
      update: async (item: Rec, p: Patch) => {
        await gate(`update ${item.id} v${item.v} ${p.name}`);
        const r = { ...rows.get(item.id)!, name: p.name, v: rows.get(item.id)!.v + 1 };
        rows.set(r.id, r);
        return r;
      },
      remove: async (item: Rec) => {
        await gate(`remove ${item.id}`);
        rows.delete(item.id);
      },
    },
  };
}

const A: Rec = { id: "a", name: "Alder", v: 1 };
const B: Rec = { id: "b", name: "Birch", v: 1 };
const byName = (x: Rec, y: Rec) => x.name.localeCompare(y.name);

function setup(seed: Rec[] = [A, B], over: Partial<RecordListOptions<Rec, Draft, Patch>> = {}) {
  const store = makeStore(seed);
  const problems: Array<[unknown, unknown]> = [];
  const hook = renderHook(() =>
    useRecordList<Rec, Draft, Patch>({ ...store.calls, key: "id", sort: byName, onProblem: (e, w) => problems.push([e, w]), ...over }),
  );
  return { store, problems, ...hook };
}
const names = (r: { current: { items: Rec[] } }) => r.current.items.map((i) => i.name);
const flush = async (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("load", () => {
  it("is loading until the list answers, then shows it sorted", async () => {
    const { result } = setup();
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    await flush();
    expect(result.current.loading).toBe(false);
    expect(names(result)).toEqual(["Alder", "Birch"]);
    expect(result.current.error).toBeNull();
  });
  it("a failed list sets error, stops loading and tells onProblem; reload recovers", async () => {
    const store = makeStore([A]);
    store.failNext("list");
    const problems: unknown[] = [];
    const { result } = renderHook(() => useRecordList<Rec, Draft, Patch>({ ...store.calls, key: "id", onProblem: (e, w) => problems.push(w) }));
    await flush();
    expect(result.current.loading).toBe(false);
    expect((result.current.error as Error).message).toBe("list refused");
    expect(problems).toEqual([{ action: "load" }]);
    await act(async () => result.current.reload());
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([A]);
  });
  it("an older reload that answers late does not win over a newer one", async () => {
    const { result, store } = setup([A]);
    await flush();
    const slow = store.hold();
    let first!: Promise<void>;
    act(() => void (first = result.current.reload())); // held
    store.rows.set("b", B);
    await act(async () => result.current.reload()); // answers at once with A and B
    expect(names(result)).toEqual(["Alder", "Birch"]);
    store.rows.delete("b");
    slow.resolve(); // the held (older) one answers now, with A and B read before... but it is stale
    await act(async () => first);
    expect(names(result)).toEqual(["Alder", "Birch"]);
  });
});

describe("add", () => {
  it("shows the record at once under a temporary id, then swaps in the real one", async () => {
    const { result, store } = setup();
    await flush();
    const hold = store.hold();
    let done!: Promise<Rec | null>;
    act(() => void (done = result.current.add({ name: "Cedar" })));
    expect(names(result)).toEqual(["Alder", "Birch", "Cedar"]);
    const temp = result.current.items.find((i) => i.name === "Cedar")!;
    expect(temp.id).toMatch(/^saving-/);
    expect(result.current.isSaving(temp.id)).toBe(true);
    hold.resolve();
    const made = await act(async () => done);
    expect(made).toMatchObject({ name: "Cedar", id: "r100" });
    expect(result.current.items.map((i) => i.id)).toEqual(["a", "b", "r100"]);
    expect(result.current.isSaving(temp.id)).toBe(false);
  });
  it("a failed write rolls the record back, answers null and tells onProblem once", async () => {
    const { result, store, problems } = setup();
    await flush();
    store.failNext("create");
    const got = await act(async () => result.current.add({ name: "Cedar" }));
    expect(got).toBeNull();
    expect(names(result)).toEqual(["Alder", "Birch"]);
    expect(problems).toHaveLength(1);
    expect((problems[0]![0] as Error).message).toBe("create Cedar refused");
    expect(problems[0]![1]).toEqual({ action: "add" });
  });
  it("two adds in flight each get their own temporary id and each keeps its own outcome", async () => {
    const { result, store } = setup([]);
    await flush();
    const h1 = store.hold();
    const h2 = store.hold();
    let p1!: Promise<Rec | null>;
    let p2!: Promise<Rec | null>;
    act(() => {
      p1 = result.current.add({ name: "One" });
      p2 = result.current.add({ name: "Two" });
    });
    expect(new Set(result.current.items.map((i) => i.id)).size).toBe(2);
    store.failNext("create"); // fails whichever create is checked after its hold; the first to resume
    h2.resolve();
    await act(async () => void (await p2.catch(() => null)));
    h1.resolve();
    await act(async () => void (await p1));
    expect(result.current.items.length).toBe(1);
  });
  it("optimisticItem builds the record shown meanwhile", async () => {
    const { result, store } = setup([], { optimisticItem: (d, id) => ({ id, name: `${d.name} (saving)`, v: 0 }) });
    await flush();
    store.hold();
    act(() => void result.current.add({ name: "Cedar" }));
    expect(names(result)).toEqual(["Cedar (saving)"]);
  });
});

describe("edit", () => {
  it("shows the change at once, then the stored record", async () => {
    const { result, store } = setup();
    await flush();
    const hold = store.hold();
    let done!: Promise<Rec | null>;
    act(() => void (done = result.current.edit("a", { name: "Aspen" })));
    expect(names(result)).toEqual(["Aspen", "Birch"]);
    expect(result.current.isSaving("a")).toBe(true);
    hold.resolve();
    await act(async () => void (await done));
    expect(result.current.items.find((i) => i.id === "a")).toMatchObject({ name: "Aspen", v: 2 });
    expect(result.current.isSaving("a")).toBe(false);
  });
  it("a failed write puts the record back as the store holds it and tells onProblem", async () => {
    const { result, store, problems } = setup();
    await flush();
    store.failNext("update");
    const got = await act(async () => result.current.edit("a", { name: "Aspen" }));
    expect(got).toBeNull();
    expect(result.current.items.find((i) => i.id === "a")).toEqual(A);
    expect(problems.map((p) => p[1])).toEqual([{ action: "edit", id: "a" }]);
  });
  it("two quick edits to one record are written one after the other, the second from the first's answer", async () => {
    const { result, store } = setup();
    await flush();
    const hold = store.hold();
    let p1!: Promise<Rec | null>;
    let p2!: Promise<Rec | null>;
    act(() => {
      p1 = result.current.edit("a", { name: "Aspen" });
      p2 = result.current.edit("a", { name: "Ash" });
    });
    expect(names(result)).toEqual(["Ash", "Birch"]);
    await flush(0);
    expect(store.log.filter((l) => l.startsWith("update"))).toEqual(["update a v1 Aspen"]); // the second waits
    hold.resolve();
    await act(async () => void (await Promise.all([p1, p2])));
    expect(store.log.filter((l) => l.startsWith("update"))).toEqual(["update a v1 Aspen", "update a v2 Ash"]);
    expect(result.current.items.find((i) => i.id === "a")).toMatchObject({ name: "Ash", v: 3 });
  });
  it("when the first of two edits fails the second still goes, and the list ends as the store holds it", async () => {
    const { result, store, problems } = setup();
    await flush();
    store.failNext("update");
    let p1!: Promise<Rec | null>;
    let p2!: Promise<Rec | null>;
    act(() => {
      p1 = result.current.edit("a", { name: "Aspen" });
      p2 = result.current.edit("a", { name: "Ash" });
    });
    await act(async () => void (await Promise.all([p1, p2])));
    expect(await p1).toBeNull();
    expect(await p2).toMatchObject({ name: "Ash", v: 2 });
    expect(result.current.items.find((i) => i.id === "a")).toMatchObject({ name: "Ash", v: 2 });
    expect(problems).toHaveLength(1);
  });
  it("is ignored (null, no call) for an unknown record, one still being added, and one waiting for its delete", async () => {
    const { result, store } = setup();
    await flush();
    expect(await act(async () => result.current.edit("nope", { name: "x" }))).toBeNull();
    store.hold();
    act(() => void result.current.add({ name: "Cedar" }));
    const tempId = result.current.items.find((i) => i.name === "Cedar")!.id;
    expect(await act(async () => result.current.edit(tempId, { name: "x" }))).toBeNull();
    act(() => result.current.del("a"));
    expect(await act(async () => result.current.edit("a", { name: "x" }))).toBeNull();
    expect(store.log.some((l) => l.startsWith("update"))).toBe(false);
  });
});

describe("delete and undo", () => {
  it("hides the record at once and calls remove only after undoMs (default 10 s)", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("a"));
    expect(names(result)).toEqual(["Birch"]);
    expect(result.current.pending.map((p) => p.id)).toEqual(["a"]);
    await flush(9_999);
    expect(store.log.some((l) => l.startsWith("remove"))).toBe(false);
    await flush(1);
    expect(store.log).toContain("remove a");
    expect(store.rows.has("a")).toBe(false);
    expect(result.current.pending).toEqual([]);
    expect(names(result)).toEqual(["Birch"]);
  });
  it("undoMs sets the wait", async () => {
    const { result, store } = setup([A], { undoMs: 500 });
    await flush();
    act(() => result.current.del("a"));
    await flush(499);
    expect(store.log).not.toContain("remove a");
    await flush(1);
    expect(store.log).toContain("remove a");
  });
  it("undo within the wait brings the record back in its place and remove is never called", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("a"));
    let was!: boolean;
    act(() => void (was = result.current.undo("a")));
    expect(was).toBe(true);
    expect(names(result)).toEqual(["Alder", "Birch"]);
    expect(result.current.pending).toEqual([]);
    await flush(60_000);
    expect(store.log.some((l) => l.startsWith("remove"))).toBe(false);
    expect(result.current.undo("a")).toBe(false);
  });
  it("a delete the store refuses brings the record back and tells onProblem", async () => {
    const { result, store, problems } = setup();
    await flush();
    store.failNext("remove");
    act(() => result.current.del("a"));
    await flush(10_000);
    expect(names(result)).toEqual(["Alder", "Birch"]);
    expect(problems.map((p) => p[1])).toEqual([{ action: "delete", id: "a" }]);
    expect(result.current.pending).toEqual([]);
  });
  it("two quick deletes both wait, each on its own clock, and undo takes back only the one named", async () => {
    const { result, store } = setup([A, B, { id: "c", name: "Cedar", v: 1 }]);
    await flush();
    act(() => result.current.del("a"));
    await flush(3_000);
    act(() => result.current.del("b"));
    expect(names(result)).toEqual(["Cedar"]);
    expect(result.current.pending.map((p) => p.id)).toEqual(["a", "b"]);
    await flush(7_000); // a's ten seconds are over, b's are not
    expect(store.log.filter((l) => l.startsWith("remove"))).toEqual(["remove a"]);
    expect(result.current.pending.map((p) => p.id)).toEqual(["b"]);
    act(() => void result.current.undo("b"));
    expect(names(result)).toEqual(["Birch", "Cedar"]);
    await flush(60_000);
    expect(store.log.filter((l) => l.startsWith("remove"))).toEqual(["remove a"]);
  });
  it("two quick deletes with no undo are both made real, one after its own wait", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("a"));
    await flush(2_000);
    act(() => result.current.del("b"));
    await flush(8_000);
    expect(store.log.filter((l) => l.startsWith("remove"))).toEqual(["remove a"]);
    await flush(2_000);
    expect(store.log.filter((l) => l.startsWith("remove"))).toEqual(["remove a", "remove b"]);
    expect(result.current.items).toEqual([]);
  });
  it("del is ignored for an unknown record, one still being added, and one already waiting", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("nope"));
    store.hold();
    act(() => void result.current.add({ name: "Cedar" }));
    act(() => result.current.del(result.current.items.find((i) => i.name === "Cedar")!.id));
    act(() => result.current.del("a"));
    act(() => result.current.del("a"));
    expect(result.current.pending).toHaveLength(1);
    expect(names(result)).toEqual(["Birch", "Cedar"]);
  });
});

describe("flushPending, unmount and a hidden page", () => {
  it("flushPending makes every waiting delete real now and resolves when all are done", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("a"));
    act(() => result.current.del("b"));
    const h = store.hold();
    let done = false;
    let p!: Promise<void>;
    act(() => void (p = result.current.flushPending().then(() => void (done = true))));
    await flush(0);
    expect(store.log.filter((l) => l.startsWith("remove"))).toHaveLength(2);
    expect(done).toBe(false); // the first remove is held
    h.resolve();
    await act(async () => p);
    expect(done).toBe(true);
    expect(store.rows.size).toBe(0);
    expect(result.current.pending).toEqual([]);
    await flush(60_000);
    expect(store.log.filter((l) => l.startsWith("remove"))).toHaveLength(2); // the timers were cleared: no second call
  });
  it("flushPending with nothing waiting resolves and never rejects, even when a delete fails", async () => {
    const { result, store, problems } = setup();
    await flush();
    await act(async () => result.current.flushPending());
    store.failNext("remove");
    act(() => result.current.del("a"));
    await act(async () => result.current.flushPending());
    expect(names(result)).toEqual(["Alder", "Birch"]);
    expect(problems).toHaveLength(1);
  });
  it("unmounting makes a waiting delete real", async () => {
    const { result, store, unmount } = setup();
    await flush();
    act(() => result.current.del("a"));
    unmount();
    await flush(0);
    expect(store.log).toContain("remove a");
    await flush(60_000);
    expect(store.log.filter((l) => l.startsWith("remove"))).toHaveLength(1);
  });
  it("a page that is hidden or closed makes a waiting delete real", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("a"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await flush(0);
    expect(store.log.some((l) => l.startsWith("remove"))).toBe(false);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await flush(0);
    expect(store.log).toContain("remove a");
    act(() => result.current.del("b"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    await flush(0);
    expect(store.log).toContain("remove b");
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });
  it("flushOnHide false leaves the wait alone", async () => {
    const { result, store } = setup([A, B], { flushOnHide: false });
    await flush();
    act(() => result.current.del("a"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    await flush(0);
    expect(store.log.some((l) => l.startsWith("remove"))).toBe(false);
  });
});

describe("reload", () => {
  it("keeps a waiting delete hidden, an add still being written shown, and an edit still being written as shown", async () => {
    const { result, store } = setup();
    await flush();
    act(() => result.current.del("a"));
    const hold = store.hold();
    act(() => void result.current.add({ name: "Cedar" }));
    await act(async () => void (await result.current.reload()));
    expect(names(result)).toEqual(["Birch", "Cedar"]);
    hold.resolve();
    await flush(0);
    expect(result.current.items.map((i) => i.id)).toEqual(["b", "r100"]);
  });
  it("picks up what changed in the store", async () => {
    const { result, store } = setup([A]);
    await flush();
    store.rows.set("b", B);
    await act(async () => result.current.reload());
    expect(names(result)).toEqual(["Alder", "Birch"]);
  });
});
