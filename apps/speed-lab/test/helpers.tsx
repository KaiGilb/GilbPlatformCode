// Test helpers. `boot()` loads the app on a fresh module registry: the hub, the cache, the job store and the stand-in start as they do on a new page load,
// while the device (the fake IndexedDB, made in setup.ts) and React stay. Calling `boot()` again after `cleanup()` is a reload.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

export const ANN = "https://ann.example.test/vault";
export const BEN = "https://ben.example.test/vault";

export async function boot() {
  vi.resetModules();
  const { App } = await import("../src/App");
  const { speed } = await import("../src/speed");
  const standin = await import("../src/standin");
  const platform = testPlatform(standin.fake);
  const { proof } = await import("../src/proof");
  const { provenance, session } = await import("../src/session");
  const { cache, hub } = await import("@kaigilb/gilbplatformcode-speed-kit");
  return { App, speed, platform, proof, provenance, session, cache, hub, show: () => render(<App />) };
}
/** What the tests do to the platform, written on the shared fake: every record list of one vault, by its path. */
const records = (vault: string) => `GET /lws/vault/${encodeURIComponent(vault)}/records` as const;
function testPlatform(fake: (typeof import("../src/standin"))["fake"]) {
  return {
    fake,
    /** Holds every records request for that vault until the returned function is called. */
    hold: (vault: string) => fake.hold(records(vault)),
    /** The first `n` records requests for that vault answer; the ones after wait until the returned function is called. */
    holdAfter: (vault: string, n: number) => fake.hold(records(vault), { skip: n }),
    /** The first `n` records requests for that vault answer; the ones after fail with `status`. */
    failAfter: (vault: string, n: number, status = 500) => void fake.failNext(records(vault), { status, times: Number.MAX_SAFE_INTEGER, skip: n, message: "the platform cannot answer more of the list" }),
    /** The count of records requests the platform has ANSWERED (the window counter counts those it RECEIVED); a held request has not. */
    answered: () => fake.calls.of("GET /lws/vault/:vault/records").filter((c) => typeof c.status === "number").length,
    nameOf: (_vault: string, id: string): string | undefined => (fake.state.records.get(id)?.facts.name as string | undefined),
    /** Another device renamed the entry (what a rename elsewhere looks like to this app). */
    renameBehindBack: (_vault: string, id: string, name: string) => fake.edit(id, { name }),
  };
}
export type Booted = Awaited<ReturnType<typeof boot>>;

/** A page reload: the screens go, the module state goes, the device stays. */
export async function reload(): Promise<Booted> {
  cleanup();
  return boot();
}

export const click = (testid: string) => fireEvent.click(screen.getByTestId(testid));
export const panel = () => screen.getByTestId("speed-panel");
/** The list is whole: the "Updated hh:mm" line shows, so the full copy (head, walk, changes since) has come and is the one the disk saves. The platform answers a page later than a hand-made stand-in did, so a test that saves to the disk waits for this first. */
export const settled = () => waitFor(() => expect(screen.getByTestId("updated-line").textContent).toMatch(/^Updated \d\d:\d\d$/));
export const sleep = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

/** Everything on the fake device, as one text (keys and values of every object store). "" when there is no database. */
export async function dumpDevice(name = "speedkittaking-cache"): Promise<string> {
  const known = await indexedDB.databases();
  if (!known.some((d) => d.name === name)) return "";
  const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  try {
    const out: unknown[] = [];
    for (const store of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(store, "readonly");
      const os = tx.objectStore(store);
      const get = <T,>(req: IDBRequest<T>) => new Promise<T>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      out.push({ store, keys: await get(os.getAllKeys()), values: await get(os.getAll()) });
    }
    return JSON.stringify(out);
  } finally { db.close(); }
}

/** Collects every moment the page shows `needle`: what is in the page now, and anything added to it (a render that came and went within one task). */
export function watchForText(needle: string): { seen: string[]; stop: () => void } {
  const seen: string[] = [];
  const look = () => { if (document.body.textContent?.includes(needle)) seen.push(document.body.textContent); };
  const mo = new MutationObserver((records) => {
    look();
    for (const r of records) for (const n of Array.from(r.addedNodes)) if (n.textContent?.includes(needle)) seen.push(n.textContent);
  });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  look();
  return { seen, stop: () => { for (const r of mo.takeRecords()) for (const n of Array.from(r.addedNodes)) if (n.textContent?.includes(needle)) seen.push(n.textContent); mo.disconnect(); } };
}

export { waitFor };
