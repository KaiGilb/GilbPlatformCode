// A small in-memory stand-in for Cache Storage (`caches`), for the tests only.
export interface FakeCaches {
  storage: CacheStorage;
  /** name -> (url -> stored response) */
  stores: Map<string, Map<string, Response>>;
  calls: { open: string[]; put: string[]; match: string[]; delete: string[] };
  failPut: boolean;
}

export function makeCachesFake(): FakeCaches {
  const stores = new Map<string, Map<string, Response>>();
  const fake: FakeCaches = { storage: undefined as unknown as CacheStorage, stores, calls: { open: [], put: [], match: [], delete: [] }, failPut: false };
  const storage = {
    async open(name: string) {
      fake.calls.open.push(name);
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        async match(url: string) {
          fake.calls.match.push(url);
          return m.get(url)?.clone();
        },
        async put(url: string, res: Response) {
          fake.calls.put.push(url);
          if (fake.failPut) throw new Error("QuotaExceededError");
          m.set(url, res);
        },
      } as unknown as Cache;
    },
    async delete(name: string) {
      fake.calls.delete.push(name);
      return stores.delete(name);
    },
  };
  fake.storage = storage as unknown as CacheStorage;
  return fake;
}
