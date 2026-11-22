import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutosaveRecord } from "./useAutosaveRecord";

type F = { name: string; place: string };
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const S0: F = { name: "Fig", place: "Rome" };

describe("qa306c", () => {
  test("S2 after 200 writes: a stale read within the last 20 keeps the newest value; an older one counts as another writer", async () => {
    const write = vi.fn(async () => {});
    const { result, rerender } = renderHook((p: { s: F }) => useAutosaveRecord<F>({ stored: p.s, write }), { initialProps: { s: S0 } });
    for (let i = 0; i < 200; i++) {
      act(() => result.current.set("name", "v" + i));
      await tick(400);
    }
    rerender({ s: { name: "v185", place: "Rome" } });
    expect(result.current.values.name).toBe("v199");
    rerender({ s: { name: "v0", place: "Rome" } });
    expect(result.current.values.name).toBe("v0");
  });

  test("S5 onSaved: the leave write lands before the older write; the last call is the newer fields, and the older write reports nothing", async () => {
    const d1 = deferred();
    const d2 = deferred();
    let n = 0;
    const saved: unknown[] = [];
    const write = vi.fn(() => (n++ === 0 ? d1.promise : d2.promise));
    const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, onSaved: (w) => saved.push(w) }));
    act(() => result.current.set("name", "Plum"));
    await tick(400);
    act(() => result.current.set("name", "Plum pie"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    await tick(0);
    await act(async () => {
      d2.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      d1.resolve();
      await Promise.resolve();
    });
    expect(saved).toEqual([{ name: "Plum pie" }]);
  });
});
