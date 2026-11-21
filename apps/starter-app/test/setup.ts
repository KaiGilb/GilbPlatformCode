// Every test starts with an empty device: a new in-memory IndexedDB (the sign-in is kept there) and empty storage.
// Node 25 has a half-working `localStorage` of its own, so the storage is stubbed, as the other units' tests do.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, vi } from "vitest";

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
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  if (typeof history !== "undefined") history.replaceState(null, "", "/"); // the open vault and section are kept in the address
});

afterEach(async () => {
  if (typeof window !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    document.head.querySelectorAll("style#gilb-style").forEach((el) => el.remove());
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
  }
  vi.unstubAllGlobals();
});
