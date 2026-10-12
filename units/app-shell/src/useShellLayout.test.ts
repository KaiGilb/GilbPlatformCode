import { afterEach, describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readStoredLayout, useShellLayout, SHELL_LAYOUT_DEFAULTS, LEFT_MIN, LEFT_MAX, RIGHT_MIN, RIGHT_MAX } from "./useShellLayout";

afterEach(() => localStorage.clear());

describe("layout", () => {
  test("no stored value gives the defaults", () => {
    expect(readStoredLayout({ storageKey: "k" })).toEqual(SHELL_LAYOUT_DEFAULTS);
  });
  test("the defaults and limits are the ones the README states", () => {
    expect(SHELL_LAYOUT_DEFAULTS).toEqual({ leftW: 300, rightW: 376, leftCollapsed: true, rightCollapsed: false });
    expect([LEFT_MIN, LEFT_MAX, RIGHT_MIN, RIGHT_MAX]).toEqual([180, 440, 280, 520]);
  });
  test("a stored value is clamped and a missing boolean keeps the default", () => {
    localStorage.setItem("k", JSON.stringify({ leftW: 9999, rightW: 1 }));
    expect(readStoredLayout({ storageKey: "k" })).toEqual({ leftW: LEFT_MAX, rightW: RIGHT_MIN, leftCollapsed: true, rightCollapsed: false });
  });
  test("broken JSON gives the defaults", () => {
    localStorage.setItem("k", "{nope");
    expect(readStoredLayout({ storageKey: "k" })).toEqual(SHELL_LAYOUT_DEFAULTS);
  });
  test("two apps with two keys do not share a layout", () => {
    const a = renderHook(() => useShellLayout({ storageKey: "app-a" }));
    act(() => a.result.current.toggleRight());
    const b = renderHook(() => useShellLayout({ storageKey: "app-b" }));
    expect(a.result.current.rightCollapsed).toBe(true);
    expect(b.result.current.rightCollapsed).toBe(false);
    expect(JSON.parse(localStorage.getItem("app-a")!).rightCollapsed).toBe(true);
  });
  test("expand and collapse are not toggles", () => {
    const h = renderHook(() => useShellLayout({ storageKey: "k" }));
    act(() => h.result.current.expandRight());
    expect(h.result.current.rightCollapsed).toBe(false);
    act(() => h.result.current.collapseRight());
    act(() => h.result.current.collapseRight());
    expect(h.result.current.rightCollapsed).toBe(true);
    act(() => h.result.current.expandLeft());
    act(() => h.result.current.expandLeft());
    expect(h.result.current.leftCollapsed).toBe(false);
  });
  test("widths are clamped to the host's limits", () => {
    const h = renderHook(() => useShellLayout({ storageKey: "k", leftMin: 200, leftMax: 250 }));
    act(() => h.result.current.setLeftW(10));
    expect(h.result.current.leftW).toBe(200);
    act(() => h.result.current.setLeftW(900));
    expect(h.result.current.leftW).toBe(250);
  });
  test("host defaults are clamped to the limits, like stored widths", () => {
    expect(readStoredLayout({ storageKey: "k", defaults: { leftW: 9999, rightW: 1 } })).toMatchObject({ leftW: LEFT_MAX, rightW: RIGHT_MIN });
    expect(readStoredLayout({ storageKey: "k", defaults: { leftW: 100 }, leftMin: 150 }).leftW).toBe(150);
  });
  test("the returned object keeps its identity across renders until something changes", () => {
    const h = renderHook(() => useShellLayout({ storageKey: "k" }));
    const first = h.result.current;
    h.rerender();
    expect(h.result.current).toBe(first);
    act(() => h.result.current.toggleLeft());
    expect(h.result.current).not.toBe(first);
  });
  test("a new storage key reads that key's layout and does not write the old one over it", () => {
    localStorage.setItem("a", JSON.stringify({ leftW: 250, rightW: 300, leftCollapsed: false, rightCollapsed: true }));
    localStorage.setItem("b", JSON.stringify({ leftW: 200, rightW: 400, leftCollapsed: true, rightCollapsed: false }));
    const h = renderHook(({ key }) => useShellLayout({ storageKey: key }), { initialProps: { key: "a" } });
    expect(h.result.current.leftW).toBe(250);
    h.rerender({ key: "b" });
    expect(h.result.current.leftW).toBe(200);
    expect(h.result.current.rightCollapsed).toBe(false);
    expect(JSON.parse(localStorage.getItem("b")!).leftW).toBe(200);
    expect(JSON.parse(localStorage.getItem("a")!).leftW).toBe(250);
  });
  test("the hook returns the limits in force: the host's, else the defaults", () => {
    const a = renderHook(() => useShellLayout({ storageKey: "lim-a" }));
    expect([a.result.current.leftMin, a.result.current.leftMax, a.result.current.rightMin, a.result.current.rightMax]).toEqual([LEFT_MIN, LEFT_MAX, RIGHT_MIN, RIGHT_MAX]);
    const b = renderHook(() => useShellLayout({ storageKey: "lim-b", leftMin: 200, leftMax: 400, rightMin: 300, rightMax: 500 }));
    expect([b.result.current.leftMin, b.result.current.leftMax, b.result.current.rightMin, b.result.current.rightMax]).toEqual([200, 400, 300, 500]);
  });
});
