// Ported whole from the source's `countryFlags.defaultTimeout.test.ts` (1 case); the imports are the unit's entry and the pool unit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geoFlagSource } from "./index";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";

describe("geoFlagSource default timeout", () => {
  beforeEach(() => { vi.useFakeTimers(); __resetFetchPool(); });
  afterEach(() => { vi.useRealTimers(); });
  it("a flag read that never answers is given up at the default timeout, not before and not never", async () => {
    const hang = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => { init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }));
    const src = geoFlagSource({ fetchFn: hang as unknown as typeof fetch });
    let settled: "pending" | "rejected" | "resolved" = "pending";
    const p = src.read("https://geo.example.test/base/e/osm-r-2978650").then(() => { settled = "resolved"; }, () => { settled = "rejected"; });
    await vi.advanceTimersByTimeAsync(7900);
    expect(settled).toBe("pending");
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(settled).toBe("rejected");
  });
});
