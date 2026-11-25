// Spec: RuleUiSaveAsYouType, and Kai-Zen's decision 2 of 2026-11-25 for the table view's cell editing: "extend the record-autosave unit
// with a 'save only on commit' option. It raises Library.Reuse and keeps one save logic." The table view step 2 brief, "How a cell edit
// works": "Enter, Tab or leaving the cell commits the edit. Hiding or closing the page sends what is pending, with keepalive ... Send one
// write per record at a time. Never send the same value twice ... Retry sends the same value again ... Esc cancels and restores the
// stored value."
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

describe("useAutosaveRecord", () => {
  describe('saveOn: "commit"', () => {
    test("the quiet-typing delay never writes, however long the person waits", async () => {
      const write = vi.fn(async () => {});
      const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "commit" }));
      act(() => result.current.set("name", "Plum"));
      await tick(400);
      await tick(60_000);
      expect(write).not.toHaveBeenCalled();
      // The edit is on screen and is said to be not saved yet.
      expect(result.current.values.name).toBe("Plum");
      expect(result.current.state).toBe("pending");
    });

    test("flush() writes the one changed field, once, and the state goes saving then saved", async () => {
      const d = deferred();
      const write = vi.fn(() => d.promise);
      const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "commit" }));
      act(() => result.current.set("name", "Plum"));
      act(() => void result.current.flush());
      expect(write.mock.calls).toEqual([[{ name: "Plum" }, { keepalive: false }]]);
      expect(result.current.state).toBe("saving");
      // A second finish of the same edit sends nothing more: the same value is never sent twice.
      act(() => void result.current.flush());
      await act(async () => {
        d.resolve();
        await Promise.resolve();
      });
      expect(result.current.state).toBe("saved");
      await tick(60_000);
      expect(write).toHaveBeenCalledTimes(1);
    });

    test("a value set back to the stored one before the finish is never written (Esc takes the edit back)", async () => {
      const write = vi.fn(async () => {});
      const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "commit" }));
      act(() => result.current.set("name", "Plum"));
      act(() => result.current.set("name", "Fig"));
      await act(async () => void (await result.current.flush()));
      await tick(60_000);
      expect(write).not.toHaveBeenCalled();
      expect(result.current.state).toBe("idle");
    });

    test("a page that is hidden writes what is pending, with keepalive", async () => {
      const write = vi.fn(async () => {});
      const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "commit" }));
      act(() => result.current.set("place", "Oslo"));
      act(() => void window.dispatchEvent(new Event("pagehide")));
      await tick(0);
      expect(write.mock.calls).toEqual([[{ place: "Oslo" }, { keepalive: true }]]);
    });

    test("a refused write keeps the edit on screen with the failure's own words, and retry() sends the same value again", async () => {
      let fail = true;
      const write = vi.fn(async () => {
        if (fail) throw new Error("no connection");
      });
      const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "commit" }));
      act(() => result.current.set("name", "Plum"));
      await act(async () => void (await result.current.flush()));
      expect(result.current.state).toBe("error");
      expect(result.current.error).toBe("no connection");
      expect(result.current.values.name).toBe("Plum");
      // Nothing is sent again by time alone.
      await tick(60_000);
      expect(write).toHaveBeenCalledTimes(1);
      fail = false;
      await act(async () => void (await result.current.retry()));
      expect(write.mock.calls[1]).toEqual([{ name: "Plum" }, { keepalive: false }]);
      expect(result.current.state).toBe("saved");
      // Taking the edit back after a failure (Esc on a failed cell) ends the error with nothing sent.
      fail = true;
      act(() => result.current.set("name", "Pear"));
      await act(async () => void (await result.current.flush()));
      expect(result.current.state).toBe("error");
      act(() => result.current.set("name", "Plum"));
      expect(result.current.state).toBe("idle");
      expect(write).toHaveBeenCalledTimes(3);
    });

    test("a change finished while a write is in flight goes out after it answers: one write at a time", async () => {
      const d1 = deferred();
      const calls: unknown[] = [];
      const write = vi.fn((changed: Partial<F>) => {
        calls.push(changed);
        return calls.length === 1 ? d1.promise : Promise.resolve();
      });
      const { result } = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "commit" }));
      act(() => result.current.set("name", "Plum"));
      act(() => void result.current.flush());
      act(() => result.current.set("name", "Pear"));
      act(() => void result.current.flush());
      expect(calls).toEqual([{ name: "Plum" }]);
      await act(async () => {
        d1.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      await tick(0);
      expect(calls).toEqual([{ name: "Plum" }, { name: "Pear" }]);
    });

    test('the default is unchanged: with no saveOn, and with saveOn "typing", the delay writes', async () => {
      const write = vi.fn(async () => {});
      const a = renderHook(() => useAutosaveRecord<F>({ stored: S0, write }));
      act(() => a.result.current.set("name", "Plum"));
      await tick(400);
      expect(write).toHaveBeenCalledTimes(1);
      const b = renderHook(() => useAutosaveRecord<F>({ stored: S0, write, saveOn: "typing" }));
      act(() => b.result.current.set("name", "Pear"));
      await tick(400);
      expect(write).toHaveBeenCalledTimes(2);
    });
  });
});
