// Every test starts with a fresh in-memory localStorage and sessionStorage (the settings and the sign-in's pending mailbox live there)
// and leaves the page empty. The module state of the units (origin, session, type key) is set again by each provider mount.
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => {
  cleanup();
  __startCardsInEditMode(false);
  vi.unstubAllGlobals();
});
