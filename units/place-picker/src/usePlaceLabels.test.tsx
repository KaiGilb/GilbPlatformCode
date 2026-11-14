// @vitest-environment jsdom
// New. The hook that names saved places: what is known at once, the rest read once per address per session, the failures left absent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { getPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { usePlaceLabels, __resetPlaceLabelReads } from "./usePlaceLabels";
import { GEO, ROWS, calls, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => {
  setCatalogueMode("cities-live");
  __resetPlaceLabelReads();
});
const reads = (id: string) => calls.filter((c) => c.url === id);

describe("usePlaceLabels", () => {
  it("names the places it reads, and a place read twice by two hooks at once is read once", async () => {
    const a = renderHook(() => usePlaceLabels([`${GEO}/no`, `${GEO}/se`]));
    const b = renderHook(() => usePlaceLabels([`${GEO}/no`]));
    await waitFor(() => expect(a.result.current.get(`${GEO}/se`)).toBe("Sweden"));
    await waitFor(() => expect(b.result.current.get(`${GEO}/no`)).toBe("Norway"));
    expect(a.result.current.get(`${GEO}/no`)).toBe("Norway");
    expect(reads(`${GEO}/no`)).toHaveLength(1);
    expect(reads(`${GEO}/se`)).toHaveLength(1);
  });

  it("a name the device already knows is there on the first render and asks nothing", async () => {
    await getPlace(`${GEO}/uk`);
    calls.length = 0;
    const { result } = renderHook(() => usePlaceLabels([`${GEO}/uk`]));
    await waitFor(() => expect(result.current.get(`${GEO}/uk`)).toBe("United Kingdom"));
    expect(calls).toHaveLength(0);
  });

  it("a 404, an address outside the catalogue and a failure stay absent; a failure is asked again by the next hook", async () => {
    const bad = `${GEO}/missing-place`;
    const { result } = renderHook(() => usePlaceLabels([bad, "https://elsewhere.example.test/base/e/x", `${GEO}/de`]));
    await waitFor(() => expect(result.current.get(`${GEO}/de`)).toBe("Germany"));
    expect(result.current.has(bad)).toBe(false);
    expect(result.current.size).toBe(1);
    expect(calls.some((c) => c.url.startsWith("https://elsewhere"))).toBe(false);

    const ID = `${GEO}/flaky`;
    ROWS[ID] = { "@id": ID, "@type": "t:Country", label: "Flaky" };
    const real = globalThis.fetch;
    let down = true;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (String(input) === ID && down ? new Response("x", { status: 502 }) : real(input as string, init))));
    try {
      const first = renderHook(() => usePlaceLabels([ID]));
      await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(0));
      await new Promise((r) => setTimeout(r, 20));
      expect(first.result.current.has(ID)).toBe(false);
      down = false;
      const second = renderHook(() => usePlaceLabels([ID]));
      await waitFor(() => expect(second.result.current.get(ID)).toBe("Flaky"));
    } finally {
      delete ROWS[ID];
    }
  });
});
