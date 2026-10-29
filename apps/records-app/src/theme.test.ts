import { beforeEach, expect, test, vi } from "vitest";
import { loadPreference, nextPreference, setPreference, THEME_KEY } from "./theme";

// Node 25 ships its own half-working localStorage that hides jsdom's; use a plain in-memory one.
const mem = new Map<string, string>();
const memory = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

beforeEach(() => { mem.clear(); vi.stubGlobal("localStorage", memory); delete document.documentElement.dataset.theme; });

test("light and dark are applied to the page and kept", () => {
  expect(setPreference("dark")).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  expect(loadPreference()).toBe("dark");
  expect(setPreference("light")).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});

test("the toggle cycles light, dark, system", () => {
  expect(nextPreference("light")).toBe("dark");
  expect(nextPreference("dark")).toBe("system");
  expect(nextPreference("system")).toBe("light");
});

test("system follows the machine and defaults to light when it cannot tell", () => {
  expect(loadPreference()).toBe("system");
  expect(setPreference("system")).toBe("light");
});
