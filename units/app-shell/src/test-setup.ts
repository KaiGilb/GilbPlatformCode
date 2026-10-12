// Test-infra only. jsdom's Web Storage is partial under Node 25 (`localStorage.clear is not a
// function`), so install a Map-backed Storage.
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  } as Storage;
}
if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
  const storage = makeStorage();
  if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}
