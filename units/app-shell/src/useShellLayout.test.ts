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
});
