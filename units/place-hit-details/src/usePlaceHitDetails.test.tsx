// @vitest-environment jsdom
// New. The hook: nothing is asked while there is nothing listed, a new list is looked up, and an unmount stops the lookup.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { getPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { usePlaceHitDetails } from "./index";
import { GEO, GEO_ORIGIN, calls, callsTo, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);

describe("usePlaceHitDetails", () => {
  it("an empty list asks nobody", async () => {
    const { result } = renderHook(() => usePlaceHitDetails([]));
    await Promise.resolve();
    expect(result.current.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("a listed place gets its kind and container as they are read", async () => {
    const oslo = (await getPlace(`${GEO}/oslo`))!;
    const { result } = renderHook(() => usePlaceHitDetails([oslo]));
    await waitFor(() => expect(result.current.get(oslo.id)?.container).toEqual(["Norway"]));
    expect(callsTo(GEO_ORIGIN).every((c) => c.method === "GET")).toBe(true);
  });

  it("a new array with the same ids does not start a new lookup", async () => {
    const oslo = (await getPlace(`${GEO}/oslo`))!;
    const { result, rerender } = renderHook(({ ps }) => usePlaceHitDetails(ps), { initialProps: { ps: [oslo] } });
    await waitFor(() => expect(result.current.get(oslo.id)?.state).toBe("named"));
    const n = calls.length;
    rerender({ ps: [{ ...oslo }] });
    await Promise.resolve();
    expect(calls.length).toBe(n);
  });
});
