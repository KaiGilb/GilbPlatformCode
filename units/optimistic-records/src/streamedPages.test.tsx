import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordList } from "./index";

interface Rec {
  id: string;
  name: string;
}
type Draft = { name: string };
const R = (id: string): Rec => ({ id, name: `name-${id}` });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A loader that reads in pages: `page(rows)` emits one, `end(rows)` answers the final list. */
function streamed() {
  let emit!: (rows: readonly Rec[]) => void;
  let finish!: (rows: Rec[]) => void;
  const calls: Array<(rows: readonly Rec[]) => void> = [];
  const list = (e?: (rows: readonly Rec[]) => void) => {
    emit = e!;
    calls.push(e!);
    return new Promise<Rec[]>((res) => (finish = res));
  };
  return { list, page: (rows: Rec[]) => act(async () => emit(rows)), end: (rows: Rec[]) => act(async () => finish(rows)), calls };
}
let n = 100;
const make = (over = {}) => {
  const s = streamed();
  const hook = renderHook(() =>
    useRecordList<Rec, Draft>({ list: s.list, create: async (d) => ({ id: `r${n++}`, name: d.name }), update: async (_i, p) => ({ id: "x", ...p }) as Rec, remove: async () => undefined, key: "id", ...over }),
  );
  return { s, ...hook };
};
const ids = (r: { current: { items: Rec[] } }) => r.current.items.map((i) => i.id);

describe("streamed pages", () => {
  it("shows the first page at once, before the last arrives", async () => {
    const { s, result } = make();
    expect(result.current.loading).toBe(true);
    await s.page([R("1"), R("2")]);
    expect(result.current.loading).toBe(false);
    expect(ids(result)).toEqual(["1", "2"]);
    await s.page([R("3")]);
    expect(ids(result)).toEqual(["1", "2", "3"]);
    await s.end([R("1"), R("2"), R("3"), R("4")]);
    expect(ids(result)).toEqual(["1", "2", "3", "4"]);
  });

  it("shows a row seen on two pages once (dedupe by id), and a cumulative page works too", async () => {
    const { s, result } = make();
    await s.page([R("1"), R("2")]);
    await s.page([R("1"), R("2"), R("3")]);
    await s.page([R("3")]);
    expect(ids(result)).toEqual(["1", "2", "3"]);
    await s.end([R("1"), R("2"), R("3")]);
    expect(ids(result)).toEqual(["1", "2", "3"]);
  });

  it("keeps an add made during streaming, before and after it is stored, and after the final answer", async () => {
    const { s, result } = make();
    await s.page([R("1")]);
    let added: Promise<Rec | null>;
    act(() => void (added = result.current.add({ name: "mine" })));
    expect(result.current.items.map((i) => i.name)).toEqual(["name-1", "mine"]);
    await s.page([R("2")]);
    expect(result.current.items.map((i) => i.name)).toEqual(["name-1", "name-2", "mine"]); // a later page goes before an unsaved add
    await act(async () => void (await added));
    expect(result.current.items).toHaveLength(3);
    await s.page([R("3")]);
    await s.end([R("1"), R("2"), R("3")]); // read before the add was stored
    expect(result.current.items.map((i) => i.name)).toEqual(["name-1", "name-2", "name-3", "mine"]);
  });

  it("keeps the order a sort gives: newest first, whatever order the pages came in", async () => {
    const { s, result } = make({ sort: (a: Rec, b: Rec) => Number(b.id) - Number(a.id) });
    await s.page([R("9"), R("8")]);
    await s.page([R("7")]);
    await s.page([R("10")]);
    expect(ids(result)).toEqual(["10", "9", "8", "7"]);
  });

  it("a waiting delete stays hidden when its row streams in; the final answer drops a row the store no longer has", async () => {
    const { s, result } = make();
    await s.page([R("1"), R("2")]);
    act(() => result.current.del("1"));
    await s.page([R("1"), R("3")]);
    expect(ids(result)).toEqual(["2", "3"]);
    await s.end([R("2")]);
    expect(ids(result)).toEqual(["2"]);
  });

  it("a page that arrives after the final answer, or from an older reload, is ignored", async () => {
    const { s, result } = make();
    await s.page([R("1")]);
    const olderEmit = s.calls[0]!;
    await s.end([R("1")]);
    act(() => olderEmit([R("late")]));
    expect(ids(result)).toEqual(["1"]);
    act(() => void result.current.reload());
    const newerEmit = s.calls[1]!;
    act(() => olderEmit([R("stale")]));
    expect(ids(result)).toEqual(["1"]);
    act(() => newerEmit([R("2")]));
    expect(ids(result)).toEqual(["1", "2"]);
  });

  it("a loader that ignores emit and only answers a promise works as before", async () => {
    const { result } = renderHook(() => useRecordList<Rec, Draft>({ list: async () => [R("1"), R("2")], create: async () => R("x"), update: async () => R("x"), remove: async () => undefined, key: "id" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current.loading).toBe(false);
    expect(ids(result)).toEqual(["1", "2"]);
  });

  it("a load that fails after pages arrived keeps the rows and reports the error", async () => {
    const problems: unknown[] = [];
    let emit!: (r: readonly Rec[]) => void;
    let fail!: (e: unknown) => void;
    const { result } = renderHook(() =>
      useRecordList<Rec, Draft>({ list: (e) => ((emit = e!), new Promise((_r, rej) => (fail = rej))), create: async () => R("x"), update: async () => R("x"), remove: async () => undefined, key: "id", onProblem: (e, w) => problems.push(w) }),
    );
    await act(async () => emit([R("1")]));
    await act(async () => fail(new Error("page 2 failed")));
    expect(ids(result)).toEqual(["1"]);
    expect((result.current.error as Error).message).toBe("page 2 failed");
    expect(problems).toEqual([{ action: "load" }]);
  });
});
