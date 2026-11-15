import type { FakePlatform } from "./types";

/** The IndexedDB database the signin unit keeps a sign-in in (`SESSION_DB_NAME`, units/signin/src/sessionStore.ts). A test pins it to that constant. */
export const SIGNIN_SESSION_DB = "gilb-signin-session";

export interface InstallFakePlatformOptions {
  /** True for a host (with its port, as `URL.host`) that belongs to the fake. Default: the fake origin's host and every subdomain of it. */
  hosts?: (host: string) => boolean;
  /** The fetch every other address goes to. Default: the `fetch` the target had when this ran. */
  fallback?: typeof fetch;
  /**
   * IndexedDB databases to delete first. The fake starts empty on every load, so a sign-in an earlier load
   * kept would name a token this fake never issued. Default: the signin unit's session database. `[]` or `false`: none.
   */
  resetDatabases?: readonly string[] | false;
  /** Where to install. Default: `globalThis` (`window` in a browser). For tests. */
  target?: { fetch: typeof fetch; indexedDB?: Pick<IDBFactory, "deleteDatabase"> | undefined; location?: { href: string } | undefined };
}

/**
 * Browser dev mode (`dev:fake`): sends every request to a fake host to the fake and everything else to the real fetch,
 * and drops a sign-in kept by an earlier load. Call it before the app makes its credential, once per page load.
 * It replaces the hand-written fetch router and `indexedDB.deleteDatabase(...)` an app's `main.fake.tsx` had.
 *
 * @param fake the fake platform that answers
 * @param opts which hosts are the fake's, where the rest goes, what to reset
 * @returns a function that puts the previous `fetch` back
 */
export function installFakePlatform(fake: FakePlatform, opts: InstallFakePlatformOptions = {}): () => void {
  const target = opts.target ?? (globalThis as unknown as NonNullable<InstallFakePlatformOptions["target"]>);
  const previous = target.fetch;
  const fallback = opts.fallback ?? previous.bind(globalThis);
  const apex = new URL(fake.origin).host;
  const isFake = opts.hosts ?? ((h: string) => h === apex || h.endsWith(`.${apex}`));
  const base = target.location?.href;
  const routed = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let host: string;
    try {
      host = (base ? new URL(url, base) : new URL(url)).host;
    } catch {
      return fallback(input, init); // a relative address with no page: not the fake's
    }
    return isFake(host) ? fake.fetch(input, init) : fallback(input, init);
  }) as typeof fetch;
  if (opts.resetDatabases !== false && target.indexedDB) {
    for (const name of opts.resetDatabases ?? [SIGNIN_SESSION_DB]) target.indexedDB.deleteDatabase(name);
  }
  target.fetch = routed;
  return () => {
    if (target.fetch === routed) target.fetch = previous;
  };
}
