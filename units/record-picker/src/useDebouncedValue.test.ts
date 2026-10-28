import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "./index";

afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("starts equal to the value, so a box opened with words in it filters at once", () => {
    const { result } = renderHook(() => useDebouncedValue("ann", 250));
    expect(result.current).toBe("ann");
  });

  it("follows a new value only after it has been still for ms", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: "a" } });
    rerender({ v: "ab" });
    act(() => void vi.advanceTimersByTime(99));
    expect(result.current).toBe("a");
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe("ab");
  });

  it("a newer value restarts the wait and the older one is never shown", () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const { result, rerender } = renderHook(({ v }) => { const s = useDebouncedValue(v, 100); seen.push(s); return s; }, { initialProps: { v: "a" } });
    rerender({ v: "ab" });
    act(() => void vi.advanceTimersByTime(60));
    rerender({ v: "abc" });
    act(() => void vi.advanceTimersByTime(99));
    expect(result.current).toBe("a");
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe("abc");
    expect(seen).not.toContain("ab");
  });

  it("a value that goes back to the settled one cancels the pending change", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: "a" } });
    rerender({ v: "b" });
    act(() => void vi.advanceTimersByTime(50));
    rerender({ v: "a" });
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toBe("a");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("compares with Object.is: the same object does not start a timer", () => {
    vi.useFakeTimers();
    const o = { n: 1 };
    const { rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: o } });
    rerender({ v: o });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer on unmount", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: "a" } });
    rerender({ v: "b" });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
