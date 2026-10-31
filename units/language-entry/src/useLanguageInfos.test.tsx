// @vitest-environment jsdom
// Ported from the source's `useLanguageInfos.s8fix.test.tsx`: the `useLanguageInfos` block (5 cases). Its `useMarkIntent` block (3 cases) belongs to the held languages state, not to this unit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";
import { __resetLanguageEntries, useLanguageInfos } from "./index";


const u = (n: string) => `https://veda.example.test/base/e/${n}`;
const SLOW = u("slow00000001");
const FAST = u("fast00000001");
const doc = (label: string, code: string) => new Response(JSON.stringify({ label, iso6393Code: code }), { status: 200 });

beforeEach(() => {
  __resetLanguageEntries();
  __resetFetchPool();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useLanguageInfos", () => {
  it("🔴 a name appears as soon as ITS read lands, while a slower entry is still being read", async () => {
    let releaseSlow!: () => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("slow")) await new Promise<void>((r) => (releaseSlow = r));
        return String(url).includes("slow") ? doc("Slow", "nor") : doc("Fast", "eng");
      }),
    );
    const { result } = renderHook(() => useLanguageInfos([SLOW, FAST]));
    await waitFor(() => expect(result.current.infos.get(FAST)?.label).toBe("Fast"));
    // the slow one has not landed: not ready, no name for it, and it is NOT called failed
    expect(result.current.infos.has(SLOW)).toBe(false);
    expect(result.current.ready).toBe(false);
    expect(result.current.failed).toEqual([]);
    await act(async () => releaseSlow());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.infos.get(SLOW)?.label).toBe("Slow");
  });

  it("🔴 an entry that never answers is given up and NAMED failed; the others keep their names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
        String(url).includes("slow")
          ? new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError"))))
          : Promise.resolve(doc("Fast", "eng")),
      ),
    );
    // the real timeout is 8 s: shorten it through the fake clock
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useLanguageInfos([SLOW, FAST]));
    await waitFor(() => expect(result.current.infos.get(FAST)?.label).toBe("Fast"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(8100)));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.failed).toEqual([SLOW]);
    expect(result.current.infos.get(FAST)?.label).toBe("Fast");
  });

  it("a failed catalogue read: every entry is failed, ready is true (the card can say so), and 'Try again' reads them again", async () => {
    let up = false;
    const f = vi.fn(async () => (up ? doc("English", "eng") : new Response("x", { status: 503 })));
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useLanguageInfos([FAST, SLOW]));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect([...result.current.failed].sort()).toEqual([FAST, SLOW].sort());
    expect(result.current.infos.size).toBe(0);
    up = true;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.infos.size).toBe(2));
    expect(result.current.failed).toEqual([]);
    expect(result.current.ready).toBe(true);
  });

  it("no entries: ready at once, nothing failed", () => {
    const { result } = renderHook(() => useLanguageInfos([]));
    expect(result.current.ready).toBe(true);
    expect(result.current.failed).toEqual([]);
  });

  it("an entry added to the list is read; the ones already read are not asked again", async () => {
    const f = vi.fn(async () => doc("L", "eng"));
    vi.stubGlobal("fetch", f);
    const { result, rerender } = renderHook(({ uris }) => useLanguageInfos(uris), { initialProps: { uris: [FAST] } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(f).toHaveBeenCalledTimes(1);
    rerender({ uris: [FAST, SLOW] });
    await waitFor(() => expect(result.current.infos.size).toBe(2));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("new: Try again clears the failed list at once; it names an entry failed again only if the new read fails", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    let mode: "fail" | "hold" = "fail";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (mode === "fail") return new Response("x", { status: 503 });
        await held;
        return doc("English", "eng");
      }),
    );
    const { result } = renderHook(() => useLanguageInfos([FAST]));
    await waitFor(() => expect(result.current.failed).toEqual([FAST]));
    mode = "hold";
    act(() => result.current.retry());
    expect(result.current.failed).toEqual([]);
    release();
    await waitFor(() => expect(result.current.infos.get(FAST)?.label).toBe("English"));
  });

  it("new: an answer for an entry that left the list is dropped", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === SLOW) await held;
        return doc("L", "eng");
      }),
    );
    const { result, rerender } = renderHook(({ uris }) => useLanguageInfos(uris), { initialProps: { uris: [SLOW] } });
    rerender({ uris: [FAST] });
    await waitFor(() => expect(result.current.infos.has(FAST)).toBe(true));
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.infos.has(SLOW)).toBe(false);
  });
});
