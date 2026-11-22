import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useAutosaveRecord } from "./useAutosaveRecord";

type F = { name: string; place: string };
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
function deferred() {
  let resolve!: () => void; let reject!: (e: unknown) => void;
  const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("QA306", () => {
  test("A: stored rebuilt inline each render (README example), no re-read: after a save the field reverts to the old text", async () => {
    const calls: unknown[] = [];
    const write = async (c: Partial<F>) => { calls.push(c); };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: { name: "Fig", place: "Rome" }, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    expect(calls).toEqual([{ name: "Plum" }]);
    expect(result.current.state).toBe("saved");
    expect(result.current.values.name).toBe("Plum");
  });

  test("A2: same with memoised stored: fine (control)", async () => {
    const calls: unknown[] = [];
    const write = async (c: Partial<F>) => { calls.push(c); };
    const S = { name: "Fig", place: "Rome" };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    expect(result.current.values.name).toBe("Plum");
  });

  test("A3: inline stored, typing during in-flight write: typed text vanishes/reverts?", async () => {
    const d = deferred(); const calls: unknown[] = [];
    const write = vi.fn((c: Partial<F>) => { calls.push(c); return d.promise; });
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: { name: "Fig", place: "Rome" }, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("place", "Oslo"));
    await act(async () => { d.resolve(); await Promise.resolve(); });
    await tick(1000);
    expect(calls).toEqual([{ name: "Plum" }, { place: "Oslo" }]);
    expect(result.current.values).toEqual({ name: "Plum", place: "Oslo" });
  });

  test("B: keystrokes typed while a write is in flight are lost on pagehide (no keepalive write)", async () => {
    const d = deferred(); const calls: { c: Partial<F>; k: boolean }[] = [];
    const write = vi.fn((c: Partial<F>, h: { keepalive: boolean }) => { calls.push({ c, k: h.keepalive }); return d.promise; });
    const S = { name: "Fig", place: "Rome" };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("name", "Plum pie"));
    await tick(10);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await tick(0);
    expect(calls.some((x) => x.c.name === "Plum pie" && x.k)).toBe(true);
  });

  test("C: state says Saved while an invalid field is unsaved", async () => {
    const write = vi.fn(async () => {});
    const S = { name: "Fig", place: "Rome" };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S, write, check: (n, v) => (n === "place" && v === "" ? "needed" : null) }));
    act(() => result.current.set("place", ""));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    expect(Object.keys(result.current.problems)).toEqual(["place"]);
    expect(result.current.state).not.toBe("saved");
  });

  test("D: readOnly flips true while edits pending: still writes", async () => {
    const write = vi.fn(async () => {});
    const S = { name: "Fig", place: "Rome" };
    const { result, rerender } = renderHook((p: { ro: boolean }) => useAutosaveRecord<F>({ stored: S, write, readOnly: p.ro }), { initialProps: { ro: false } });
    act(() => result.current.set("name", "Plum"));
    rerender({ ro: true });
    await tick(400);
    expect(write).not.toHaveBeenCalled();
  });

  test("E: StrictMode: type, save, unmount flush ok, mounted true", async () => {
    const calls: unknown[] = [];
    const write = async (c: Partial<F>) => { calls.push(c); };
    const S = { name: "Fig", place: "Rome" };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S, write }), { wrapper: StrictMode });
    act(() => result.current.set("name", "Plum"));
    expect(result.current.state).toBe("pending");
    await tick(400);
    expect(calls).toEqual([{ name: "Plum" }]);
    expect(result.current.state).toBe("saved");
  });

  test("F: failure while a follow-up edit waits (again), then success: spurious / stuck?", async () => {
    const d1 = deferred(); let n = 0; const calls: Partial<F>[] = [];
    const write = vi.fn((c: Partial<F>) => { calls.push(c); return n++ === 0 ? d1.promise : Promise.resolve(); });
    const S = { name: "Fig", place: "Rome" };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S, write }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("place", "Oslo"));
    await tick(400); // again set
    await act(async () => { d1.reject(new Error("offline")); await Promise.resolve(); });
    await tick(2000);
    // Person typed place; both edits should still be retried automatically or show error
    expect(result.current.state).toBe("error");
    await act(async () => void (await result.current.retry()));
    expect(calls[calls.length - 1]).toEqual({ name: "Plum", place: "Oslo" });
    expect(result.current.state).toBe("saved");
  });

  test("G: stale re-read (old value) arrives while write in flight, then lands", async () => {
    const d = deferred();
    const write = vi.fn(() => d.promise);
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: { name: "Fig", place: "Rome" } } });
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    rerender({ s: { name: "Fig", place: "Rome" } });
    await act(async () => { d.resolve(); await Promise.resolve(); });
    expect(result.current.values.name).toBe("Plum");
    expect(write).toHaveBeenCalledTimes(1);
  });

  test("H: check valid->invalid->valid", async () => {
    const calls: unknown[] = [];
    const write = async (c: Partial<F>) => { calls.push(c); };
    const S = { name: "Fig", place: "Rome" };
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S, write, check: (n, v) => (v === "" ? "needed" : null) }));
    act(() => result.current.set("name", ""));
    expect(result.current.state).toBe("invalid");
    await tick(1000);
    expect(calls).toEqual([]);
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    expect(calls).toEqual([{ name: "Plum" }]);
    expect(result.current.problems).toEqual({});
  });
});
