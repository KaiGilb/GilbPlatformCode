import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useAutosaveRecord } from "./useAutosaveRecord";

type F = { name: string; place: string };
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
function deferred() { let resolve!: () => void; let reject!: (e: unknown) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const S0: F = { name: "Fig", place: "Rome" };

describe("qa306b", () => {
  test("N1 stored goes null after typing, timer fires: pending forever, even after stored returns", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: { s: F | null }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 as F | null } });
    act(() => result.current.set("name", "Plum"));
    rerender({ s: null });
    await tick(5000);
    rerender({ s: { ...S0 } });
    await tick(5000);
    console.log('N1 state', result.current.state, 'writes', write.mock.calls.length);
    expect(result.current.state).not.toBe("pending");
  });

  test("N2 error then re-read shows the typed value: error stuck, Try again does nothing", async () => {
    let n = 0;
    const write = vi.fn(async () => { if (n++ === 0) throw new Error("timeout"); });
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 } });
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    expect(result.current.state).toBe("error");
    rerender({ s: { name: "Plum", place: "Rome" } });
    await act(async () => void (await result.current.retry()));
    expect(result.current.state).not.toBe("error");
  });

  test("N3 invalid, then re-read settles the edit: stays invalid with nothing unsaved", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write, check: (n, v) => (v === "" ? "needed" : null) }), { initialProps: { s: S0 } });
    act(() => result.current.set("name", ""));
    expect(result.current.state).toBe("invalid");
    rerender({ s: { name: "", place: "Rome" } });
    expect(result.current.problems).toEqual({});
    expect(result.current.state).not.toBe("invalid");
  });

  test("N4 write lands while stored is null: known becomes partial; can a write go out while stored null?", async () => {
    const d = deferred(); const calls: unknown[] = [];
    const write = vi.fn((c: Partial<F>) => { calls.push(c); return d.promise; });
    const { result, rerender } = renderHook((p: { s: F | null }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 as F | null } });
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    rerender({ s: null });
    await act(async () => { d.resolve(); await Promise.resolve(); });
    act(() => result.current.set("place", "Oslo"));
    await tick(1000);
    expect(calls).toEqual([{ name: "Plum" }]);
  });

  test("N5 leaving write lands before the older in-flight write: known ends with the OLD value", async () => {
    const d1 = deferred(), d2 = deferred(); let n = 0; const calls: any[] = [];
    const write = vi.fn((c: Partial<F>, h: any) => { calls.push([c, h.keepalive]); return n++ === 0 ? d1.promise : d2.promise; });
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("name", "Plum pie"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await tick(0);
    expect(calls).toEqual([[{ name: "Plum" }, false], [{ name: "Plum pie" }, true]]);
    await act(async () => { d2.resolve(); await Promise.resolve(); });
    await act(async () => { d1.resolve(); await Promise.resolve(); });
    expect(result.current.values.name).toBe("Plum pie");
  });

  test("N6 leaving write fails while first in flight: state, then first lands", async () => {
    const d1 = deferred(), d2 = deferred(); let n = 0;
    const write = vi.fn(() => (n++ === 0 ? d1.promise : d2.promise));
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("name", "Plum pie"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await tick(0);
    await act(async () => { d2.reject(new Error("x")); await Promise.resolve(); });
    await act(async () => { d1.resolve(); await Promise.resolve(); });
    await tick(1000);
    expect(write).toHaveBeenCalledTimes(3);
    expect(write.mock.calls[2]).toEqual([{ name: "Plum pie" }, { keepalive: false }]);
  });

  test("N7 two pagehides with different text while first leave write in flight: two leaving writes outstanding, then a third same-bytes", async () => {
    const d1 = deferred(); const ds: any[] = []; let n = 0; const calls: any[] = [];
    const write = vi.fn((c: any, h: any) => { calls.push([c, h.keepalive]); if (n++ === 0) return d1.promise; const d = deferred(); ds.push(d); return d.promise; });
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write }));
    act(() => result.current.set("name", "A"));
    await tick(400);
    act(() => result.current.set("name", "AB"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await tick(0);
    act(() => result.current.set("name", "ABC"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await tick(0);
    await act(async () => { ds[0].resolve(); await Promise.resolve(); });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await tick(0);
    // bytes sent: report
    console.log("N7 calls", JSON.stringify(calls));
    expect(calls.filter((c) => JSON.stringify(c[0]) === '{"name":"ABC"}').length).toBe(1);
  });

  test("N8 readOnly true then false again while a write is in flight and typing continues", async () => {
    const d = deferred(); const calls: any[] = [];
    const write = vi.fn((c: any) => { calls.push(c); return d.promise; });
    const { result, rerender } = renderHook((p: { ro: boolean }) => useAutosaveRecord<F>({ stored: S0, write, readOnly: p.ro }), { initialProps: { ro: false } });
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("place", "Oslo"));
    rerender({ ro: true });
    rerender({ ro: false });
    await act(async () => { d.resolve(); await Promise.resolve(); });
    await tick(2000);
    expect(calls).toEqual([{ name: "Plum" }]);
    expect(result.current.values.place).toBe("Rome");
    expect(result.current.state).toBe("saved");
  });

  test("N9 StrictMode inline stored: type, in-flight, re-read same values, unmount", async () => {
    const calls: any[] = [];
    const write = vi.fn(async (c: any) => { calls.push(c); });
    const { result, unmount } = renderHook(() => useAutosaveRecord<F>({ stored: { name: "Fig", place: "Rome" }, write }), { wrapper: StrictMode });
    act(() => result.current.set("name", "P"));
    unmount();
    await tick(10);
    expect(calls).toEqual([{ name: "P" }]);
  });

  test("N10 another writer changes other field in re-read, ours landed: both kept; another writer changes same field: theirs wins", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 } });
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    rerender({ s: { name: "Fig", place: "Paris" } }); // stale for name, other writer for place
    expect(result.current.values).toEqual({ name: "Plum", place: "Paris" });
    rerender({ s: { name: "Kiwi", place: "Paris" } });
    expect(result.current.values.name).toBe("Kiwi");
    rerender({ s: { name: "Fig", place: "Paris" } }); // other writer sets back to original
    expect(result.current.values.name).toBe("Fig");
  });

  test("N11 field written twice before any re-read; stale read of first value", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 } });
    act(() => result.current.set("name", "A")); await tick(400);
    act(() => result.current.set("name", "B")); await tick(400);
    rerender({ s: { name: "A", place: "Rome" } }); // read between writes: shows A (older than B)
    expect(result.current.values.name).toBe("B");
    rerender({ s: { name: "B", place: "Rome" } });
    expect(result.current.values.name).toBe("B");
    expect(write).toHaveBeenCalledTimes(2);
  });

  test("N12 re-read during in-flight write that has caught up: no duplicate, no stuck state", async () => {
    const d = deferred(); const write = vi.fn(() => d.promise);
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 } });
    act(() => result.current.set("name", "Plum")); await tick(400);
    rerender({ s: { name: "Plum", place: "Rome" } });
    await act(async () => { d.resolve(); await Promise.resolve(); });
    await tick(2000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });

  test("N13 typed same text as in-flight, then lands", async () => {
    const d = deferred(); const write = vi.fn(() => d.promise);
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write }));
    act(() => result.current.set("name", "Plum")); await tick(400);
    act(() => result.current.set("name", "Plumx"));
    act(() => result.current.set("name", "Plum"));
    await tick(1000);
    await act(async () => { d.resolve(); await Promise.resolve(); });
    await tick(1000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });

  test("N14 re-read changes a field so a cross-field check would pass now; problem stays", async () => {
    const write = vi.fn(async () => {});
    const check = (n: string, v: string, all: F) => (n === "name" && v === all.place ? "same as place" : null);
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write, check: check as any }), { initialProps: { s: S0 } });
    act(() => result.current.set("name", "Paris"));
    rerender({ s: { name: "Fig", place: "Rome" } });
    act(() => result.current.set("place", "Paris"));
    expect(result.current.problems.name).toBeDefined();
    rerender({ s: { name: "Fig", place: "Oslo" } });
    expect(result.current.state).toBeDefined();
  });
});
