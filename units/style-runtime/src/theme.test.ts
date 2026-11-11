import { beforeEach, describe, expect, it } from "vitest";
import { THEME_KEY, currentTheme, initTheme, toggleTheme } from "./theme";

const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = "";
});

describe("theme", () => {
  it("initTheme applies the stored choice", () => {
    expect(initTheme(document, memStore({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("initTheme follows the sheet's fixed mode when nothing is stored", () => {
    document.head.innerHTML = `<style id="gilb-style">:root{--gs-mode: dark}</style>`;
    expect(initTheme(document, memStore())).toBe("dark");
  });
  it("toggleTheme flips and stores", () => {
    const st = memStore();
    document.documentElement.setAttribute("data-theme", "light");
    expect(toggleTheme(document, st)).toBe("dark");
    expect(st.m.get(THEME_KEY)).toBe("dark");
    expect(currentTheme(document)).toBe("dark");
  });
  it("a failing store does not stop the flip", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    document.documentElement.setAttribute("data-theme", "dark");
    expect(toggleTheme(document, broken)).toBe("light");
  });
});
