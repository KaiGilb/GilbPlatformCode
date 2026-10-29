// Every export is pinned: the library entry, the default cache, the null key and the stable refresh.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cacheKey, clearSessionCache, createSessionCache, sessionCache } from "@kaigilb/gilbplatformcode-session-cache";
import * as unit from "./index";
import { useCached } from "./useCached";

afterEach(() => { cleanup(); clearSessionCache(); });

describe("useCached", () => {
  test("the library entry exports exactly useCached", () => {
    expect(Object.keys(unit)).toEqual(["useCached"]);
    expect(unit.useCached).toBe(useCached);
  });
  test("without a cache argument it reads and fills the session-cache singleton", async () => {
    const k = cacheKey("w", "default");
    const { result } = renderHook(() => useCached(k, async () => "from-loader"));
    await waitFor(() => expect(result.current.data).toBe("from-loader"));
    expect(sessionCache.peek(k).data).toBe("from-loader");
  });
  test("the result has exactly these members; updatedAt is set once loaded", async () => {
    const cache = createSessionCache();
    const { result } = renderHook(() => useCached(cacheKey("w", "shape"), async () => 1, cache));
    expect(Object.keys(result.current).sort()).toEqual(["data", "error", "refresh", "updatedAt", "updating"]);
    expect(result.current.updatedAt).toBeUndefined();
    await waitFor(() => expect(result.current.updatedAt).toBeTypeOf("number"));
  });
  test("a null key gives the idle state and a refresh that does nothing", async () => {
    const cache = createSessionCache();
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useCached(null, load, cache));
    expect(result.current).toMatchObject({ data: undefined, updating: false, error: undefined, updatedAt: undefined });
    await act(async () => { await result.current.refresh(); });
    expect(load).not.toHaveBeenCalled();
    expect(cache.size()).toBe(0);
  });
  test("refresh keeps its identity across renders with a new loader function each time, and never rejects", async () => {
    const cache = createSessionCache();
    const k = cacheKey("w", "stable");
    const { result, rerender } = renderHook(() => useCached(k, async () => { throw new Error("down"); }, cache));
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
    await expect(first()).resolves.toBeUndefined();
    await waitFor(() => expect((result.current.error as Error).message).toBe("down"));
  });
});
