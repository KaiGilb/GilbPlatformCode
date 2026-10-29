// The two pieces of module state: what this session has read of a record's link (`connectedRecords`) and the places the open card handed
// to the Details panel (`theirPlaces`). Each is one store for the page's life: a write is seen by a second reader, and the source's own
// reset (and no other) empties it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import * as unit from "./index";
import { __resetConnectedRecords, connectedKnown, noteConnected, useConnected } from "./connectedRecords";
import { __resetTheirPlaces, publishTheirPlaces, useTheirPlaces, type TheirPlaceGroup } from "./theirPlaces";

const A = "https://h.example.test/vault/e/a";
const B = "https://h.example.test/vault/e/b";

beforeEach(() => {
  __resetConnectedRecords();
  __resetTheirPlaces();
});
afterEach(cleanup);

describe("connectedRecords", () => {
  it("knows nothing of a record until a card notes it", () => {
    expect(connectedKnown(A)).toBeUndefined();
    expect(connectedKnown(null)).toBeUndefined();
    expect(connectedKnown(undefined)).toBeUndefined();
    expect(connectedKnown("")).toBeUndefined();
  });
  it("a write is seen by a second reader, per record", () => {
    noteConnected(A, true);
    noteConnected(B, false);
    expect(connectedKnown(A)).toBe(true);
    expect(connectedKnown(B)).toBe(false);
  });
  it("a note with no address is ignored", () => {
    noteConnected("", true);
    expect(connectedKnown("")).toBeUndefined();
  });
  it("two mounted readers both follow a write", () => {
    const one = renderHook(() => useConnected(A, false));
    const two = renderHook(() => useConnected(A, false));
    expect([one.result.current, two.result.current]).toEqual([false, false]);
    act(() => noteConnected(A, true));
    expect([one.result.current, two.result.current]).toEqual([true, true]);
    act(() => noteConnected(A, false));
    expect([one.result.current, two.result.current]).toEqual([false, false]);
  });
  it("a reader shows what the session read, else what the row's own read carries", () => {
    const { result, rerender } = renderHook((p: { uri: string | null; fromRow: boolean }) => useConnected(p.uri, p.fromRow), { initialProps: { uri: A as string | null, fromRow: true } });
    expect(result.current).toBe(true);
    noteConnected(A, false);
    rerender({ uri: A, fromRow: true });
    expect(result.current).toBe(false);
    rerender({ uri: null, fromRow: true });
    expect(result.current).toBe(true);
  });
  it("a listener hears a real change only", () => {
    let heard = 0;
    const view = renderHook(() => {
      heard += 1;
      return useConnected(A, false);
    });
    const before = heard;
    act(() => noteConnected(A, true));
    const afterFirst = heard;
    expect(afterFirst).toBeGreaterThan(before);
    act(() => noteConnected(A, true));
    expect(heard).toBe(afterFirst);
    view.unmount();
  });
  it("an unmounted reader no longer hears", () => {
    const spy = vi.fn();
    const view = renderHook(() => {
      spy();
      return useConnected(A, false);
    });
    view.unmount();
    spy.mockClear();
    noteConnected(A, true);
    expect(spy).not.toHaveBeenCalled();
  });
  it("__resetConnectedRecords forgets everything", () => {
    noteConnected(A, true);
    noteConnected(B, false);
    __resetConnectedRecords();
    expect(connectedKnown(A)).toBeUndefined();
    expect(connectedKnown(B)).toBeUndefined();
  });
});

const g = (label: string, ...places: string[]): TheirPlaceGroup => ({ label, places });

function Places({ uri, id }: { uri: string | null | undefined; id: string }) {
  return <span data-testid={id}>{JSON.stringify(useTheirPlaces(uri))}</span>;
}

describe("theirPlaces", () => {
  it("is empty for a record that published nothing, and for no record", () => {
    expect(renderHook(() => useTheirPlaces(A)).result.current).toEqual([]);
    expect(renderHook(() => useTheirPlaces(null)).result.current).toEqual([]);
    expect(renderHook(() => useTheirPlaces(undefined)).result.current).toEqual([]);
  });
  it("a publish is seen by a second reader, per record", () => {
    render(
      <>
        <Places uri={A} id="one" />
        <Places uri={A} id="two" />
        <Places uri={B} id="other" />
      </>,
    );
    act(() => publishTheirPlaces(A, [g("Claim Place", "p1", "p2")]));
    expect(screen.getByTestId("one").textContent).toBe('[{"label":"Claim Place","places":["p1","p2"]}]');
    expect(screen.getByTestId("two").textContent).toBe(screen.getByTestId("one").textContent);
    expect(screen.getByTestId("other").textContent).toBe("[]");
  });
  it("an empty list clears the record's places", () => {
    publishTheirPlaces(A, [g("x", "p1")]);
    publishTheirPlaces(A, []);
    expect(renderHook(() => useTheirPlaces(A)).result.current).toEqual([]);
  });
  it("listeners hear only a real change: an equal list (label, count and places) is not heard", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useTheirPlaces(A);
    });
    act(() => publishTheirPlaces(A, [g("x", "p1", "p2")]));
    const n = renders;
    act(() => publishTheirPlaces(A, [g("x", "p1", "p2")]));
    expect(renders).toBe(n);
    act(() => publishTheirPlaces(A, [g("x", "p1", "p3")]));
    expect(renders).toBeGreaterThan(n);
    const m = renders;
    act(() => publishTheirPlaces(A, [g("y", "p1", "p3")]));
    expect(renders).toBeGreaterThan(m);
    const k = renders;
    act(() => publishTheirPlaces(A, [g("y", "p1", "p3"), g("z")]));
    expect(renders).toBeGreaterThan(k);
  });
  it("the answer for a record with no places is one shared empty list, whether it never published or was cleared", () => {
    const never = renderHook(() => useTheirPlaces(B)).result.current;
    publishTheirPlaces(A, [g("x", "p1")]);
    publishTheirPlaces(A, []);
    expect(renderHook(() => useTheirPlaces(A)).result.current).toBe(never);
  });
  it("clearing a record that published nothing is not heard", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useTheirPlaces(A);
    });
    const n = renders;
    act(() => publishTheirPlaces(A, []));
    expect(renders).toBe(n);
  });
  it("__resetTheirPlaces forgets every record", () => {
    publishTheirPlaces(A, [g("x", "p1")]);
    publishTheirPlaces(B, [g("y", "p2")]);
    __resetTheirPlaces();
    expect(renderHook(() => useTheirPlaces(A)).result.current).toEqual([]);
    expect(renderHook(() => useTheirPlaces(B)).result.current).toEqual([]);
  });
});

describe("the entry point carries the source's two resets and no other", () => {
  it("exports exactly __resetConnectedRecords and __resetTheirPlaces among the reset names", () => {
    expect(Object.keys(unit).filter((k) => /reset/i.test(k)).sort()).toEqual(["__resetConnectedRecords", "__resetTheirPlaces"]);
  });
});
