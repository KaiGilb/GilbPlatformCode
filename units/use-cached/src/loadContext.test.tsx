// The context the cache hands a loader reaches the loader of useCached, on mount and on refresh (0.2.0).
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cacheKey, createSessionCache, type LoadContext } from "@kaigilb/gilbplatformcode-session-cache";
import { useCached } from "./useCached";

afterEach(cleanup);
const K = cacheKey("https://a.example/vault", "entries");

function held() {
  const ctxs: Array<LoadContext<string[]> | undefined> = [];
  const waiting: Array<(v: string[]) => void> = [];
  const fn = vi.fn((ctx?: LoadContext<string[]>) => new Promise<string[]>((resolve) => { ctxs.push(ctx); waiting.push(resolve); }));
  return { fn, ctxs, answer: (v: string[], i = waiting.length - 1) => waiting[i]!(v) };
}

describe("useCached hands the cache's LoadContext to the loader", () => {
  test("on mount the loader is called with a context that has preview", async () => {
    const cache = createSessionCache();
    const l = held();
    renderHook(() => useCached(K, l.fn, cache));
    await waitFor(() => expect(l.fn).toHaveBeenCalledTimes(1));
    expect(typeof l.ctxs[0]?.preview).toBe("function");
  });

  test("refresh passes the context too", async () => {
    const cache = createSessionCache();
    const l = held();
    const { result } = renderHook(() => useCached(K, l.fn, cache));
    await waitFor(() => expect(l.fn).toHaveBeenCalledTimes(1));
    l.answer(["a"]);
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    await act(async () => { void result.current.refresh(); });
    expect(l.fn).toHaveBeenCalledTimes(2);
    expect(typeof l.ctxs[1]?.preview).toBe("function");
  });

  test("a preview the loader makes shows as data with updating:true and no updatedAt; the answer replaces it", async () => {
    const cache = createSessionCache();
    const l = held();
    const { result } = renderHook(() => useCached(K, l.fn, cache));
    await waitFor(() => expect(l.fn).toHaveBeenCalledTimes(1));
    act(() => l.ctxs[0]!.preview(["a"]));
    expect(result.current.data).toEqual(["a"]);
    expect(result.current.updating).toBe(true);
    expect(result.current.updatedAt).toBeUndefined();
    await act(async () => { l.answer(["a", "b"]); });
    await waitFor(() => expect(result.current.data).toEqual(["a", "b"]));
    expect(result.current.updating).toBe(false);
    expect(result.current.updatedAt).toBeTypeOf("number");
  });

  test("the loader latest at the time of the load is the one handed the context (a new function each render)", async () => {
    const cache = createSessionCache();
    const seen: string[] = [];
    const { result, rerender } = renderHook(({ tag }) => useCached(K, async (ctx) => { seen.push(`${tag}:${typeof ctx?.preview}`); return [tag]; }, cache), { initialProps: { tag: "one" } });
    await waitFor(() => expect(result.current.data).toEqual(["one"]));
    rerender({ tag: "two" });
    await act(async () => { await result.current.refresh(); });
    expect(seen).toEqual(["one:function", "two:function"]);
  });
});
