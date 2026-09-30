import { expect, test } from "vitest";
import { applyColorScheme, readStoredPreference, resolveColorScheme, writeStoredPreference } from "./colorScheme";

test("system follows the machine; an explicit choice does not", () => {
  expect(resolveColorScheme("system", true)).toBe("dark");
  expect(resolveColorScheme("system", false)).toBe("light");
  expect(resolveColorScheme("light", true)).toBe("light");
});

test("an unknown stored value is system, and the host's key is what is written", () => {
  const bag = new Map<string, string>();
  const store = {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
  expect(readStoredPreference(store, "theme")).toBe("system");
  writeStoredPreference(store, "theme", "dark");
  expect(readStoredPreference(store, "theme")).toBe("dark");
  expect(readStoredPreference(store, "other")).toBe("system");
});

test("apply paints the theme on the root it is given", () => {
  const root = { dataset: {} as { theme?: string }, style: { colorScheme: "" } };
  applyColorScheme("dark", root);
  expect(root.dataset.theme).toBe("dark");
  expect(root.style.colorScheme).toBe("dark");
});
