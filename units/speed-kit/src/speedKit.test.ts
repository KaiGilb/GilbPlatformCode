// Every line of the glue. (The two-person test is twoPeople.test.ts.)
import { beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { indexedDbKv, memoryKv, type Kv } from "@kaigilb/gilbplatformcode-device-store";
import { __freshPageForTests, currentPrincipal, registeredCaches, setPrincipal } from "@kaigilb/gilbplatformcode-principal-hub";
import { cacheKey, createSessionCache } from "@kaigilb/gilbplatformcode-session-cache";
import { createSpeedKit } from "./speedKit";
import { ANN, BEN, jobWords, makeKit, noTimer, WS } from "../test/testKit";

let factory: IDBFactory;
beforeEach(() => { factory = new IDBFactory(); sessionStorage.clear(); __freshPageForTests(); });
const indexOf = async () => (await (await indexedDbKv(factory, "example-cache"))!.index());

describe("names made from the app name", () => {
  test("the parts register with the hub under it, and the jobs keep their records under it", async () => {
    const kit = makeKit(factory);
    expect(registeredCaches()).toEqual(expect.arrayContaining(["example.sessionCache", "example.deviceStore", "example.jobs", "example.jobIntents", "example.prefetch"]));
    expect(kit.appName).toBe("example");
    await kit.start(ANN, { persist: noTimer });
    kit.jobs.enqueue({ key: "k", kind: "save", draftId: "d", workspace: WS, label: "L", run: () => new Promise(() => undefined) });
    expect(sessionStorage.getItem("example.jobIntents")).toContain('"label":"L"');
  });
  test("by default the disk is IndexedDB under <appName>-cache, and the session cache is the unit's own", async () => {
    (globalThis as { indexedDB: IDBFactory }).indexedDB = factory;
    try {
      const kit = createSpeedKit({ appName: "example", jobs: jobWords });
      expect((await kit.start(ANN)).disk).toBe(true);
      expect((await factory.databases()).map((d) => d.name)).toEqual(["example-cache"]);
      expect(kit.cache).toBe((await import("@kaigilb/gilbplatformcode-session-cache")).sessionCache);
    } finally { delete (globalThis as { indexedDB?: IDBFactory }).indexedDB; }
  });
  test("without IndexedDB the kit runs from memory: disk off, nothing read", async () => {
    const kit = createSpeedKit({ appName: "example", jobs: jobWords });
    expect(await kit.start(ANN)).toEqual({ disk: false, hydrated: false });
    expect(currentPrincipal()).toBe(ANN);
  });
});

describe("start", () => {
  test("says whose tab it is to the hub and to the jobs, before it reads anything", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN);
    expect(currentPrincipal()).toBe(ANN);
    kit.jobs.enqueue({ key: "k", kind: "save", draftId: "d", workspace: WS, label: "L", run: () => new Promise(() => undefined) });
    expect(JSON.parse(sessionStorage.getItem("example.jobIntents")!)[0].principal).toBe(ANN);
  });
  test("the next visit of the same person reads the copy before the network, stale, and hands the rest over", async () => {
    const one = makeKit(factory);
    await one.start(ANN, { workspace: WS, persist: noTimer });
    one.cache.set(cacheKey(WS, "topics"), { n: 1 });
    one.cache.set(cacheKey(WS, "notStored"), { n: 2 });
    one.currentPersist()!.saveVaults([{ vaultId: WS } as never]);
    await one.currentPersist()!.flush();
    __freshPageForTests();
    const two = makeKit(factory);
    let handed: unknown;
    const r = await two.start(ANN, { workspace: WS, onHydrated: (h) => { handed = h.vaults; } });
    expect(r).toEqual({ disk: true, hydrated: true });
    expect(handed).toEqual([{ vaultId: WS }]);
    expect(two.cache.peek(cacheKey(WS, "topics")).data).toEqual({ n: 1 });
    expect(two.cache.peek(cacheKey(WS, "notStored")).data).toBeUndefined();      // only the named resources are kept
    expect((await indexOf()).filter((m) => m.name === "notStored")).toEqual([]);
  });
  test("a copy only of the vault list counts as hydrated; with no workspace only that is read", async () => {
    const one = makeKit(factory);
    await one.start(ANN, { persist: noTimer });
    one.currentPersist()!.saveVaults([{ vaultId: WS } as never]);
    await one.currentPersist()!.flush();
    __freshPageForTests();
    expect((await makeKit(factory).start(ANN)).hydrated).toBe(true);
  });
  test("a key made for another person is not written to this person's disk", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN, { persist: noTimer });
    kit.cache.set(`${BEN}|${WS}|topics`, { secret: "BEN" });
    kit.cache.set(`${ANN}|${WS}|topics`, { secret: "ANN" });
    await kit.currentPersist()!.flush();
    expect((await indexOf()).map((m) => m.principal)).toEqual([ANN]);
  });
  test("persistResource adds a resource to those kept", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN, { persist: noTimer });
    kit.persistResource("ideas");
    kit.cache.set(cacheKey(WS, "ideas"), 1);
    await kit.currentPersist()!.flush();
    expect((await indexOf()).map((m) => m.name)).toEqual(["ideas"]);
  });
  test("a person with the same name again: the earlier run writes no more, and nothing is wiped", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN, { persist: noTimer });
    kit.cache.set(cacheKey(WS, "topics"), 1);
    const first = kit.currentPersist()!;
    await first.flush();
    await kit.start(ANN, { workspace: WS, persist: noTimer });
    expect(kit.currentPersist()).not.toBe(first);
    first.saveEntry(WS, "late", 1, 1);
    await first.flush();
    expect((await indexOf()).map((m) => m.name)).toEqual(["topics"]);
  });
  test("a disk that hangs is 'no cache' after the wait, and the app goes on", async () => {
    const hang: Kv = { ...memoryKv(), index: () => new Promise(() => undefined) };
    const kit = makeKit(factory, { openKv: async () => hang });
    const t = Date.now();
    expect(await kit.start(ANN, { waitMs: 30 })).toEqual({ disk: true, hydrated: false });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(currentPrincipal()).toBe(ANN);
  });
  test("a disk that will not open is 'no cache', not an error", async () => {
    const kit = makeKit(factory, { openKv: async () => { throw new Error("blocked"); } });
    expect(await kit.start(ANN)).toEqual({ disk: false, hydrated: false });
  });
  test("a person who changes while the disk opens gets nothing handed over, and the first person's copy is closed", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const kit = makeKit(factory, { openKv: async () => { await gate; return indexedDbKv(factory, "example-cache"); } });
    let handed = 0;
    const slow = kit.start(ANN, { onHydrated: () => { handed++; } });
    setPrincipal(BEN);                    // the hub's clear runs while Ann's disk is still opening
    release();
    expect(await slow).toEqual({ disk: false, hydrated: false });
    expect(handed).toBe(0);
  });
  test("a person who changes while the copy is read gets nothing handed over", async () => {
    const mem = memoryKv();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const kit = makeKit(factory, { openKv: async () => ({ ...mem, read: async (p, w) => { await gate; return mem.read(p, w); } }) });
    const cache = kit.cache; void cache;
    let handed = 0;
    const slow = kit.start(ANN, { workspace: WS, onHydrated: () => { handed++; } });
    await new Promise((r) => setTimeout(r, 0));
    setPrincipal(BEN);
    release();
    expect((await slow).hydrated).toBe(false);
    expect(handed).toBe(0);
  });
});

describe("hydrateWorkspace", () => {
  test("reads the copy of a workspace the person switched to", async () => {
    const one = makeKit(factory);
    await one.start(ANN, { persist: noTimer });
    one.cache.set(cacheKey("w2", "topics"), { n: 2 });
    await one.currentPersist()!.flush();
    __freshPageForTests();
    const two = makeKit(factory);
    await two.start(ANN);
    expect(two.cache.peek(cacheKey("w2", "topics")).data).toBeUndefined();
    await two.hydrateWorkspace("w2");
    expect(two.cache.peek(cacheKey("w2", "topics")).data).toEqual({ n: 2 });
  });
  test("does nothing with no copy running or no workspace", async () => {
    const kit = makeKit(factory);
    await kit.hydrateWorkspace("w2");
    await kit.start(ANN);
    await kit.hydrateWorkspace("");
    expect(kit.cache.size()).toBe(0);
  });
  test("a person who changes while it reads gets nothing", async () => {
    const one = makeKit(factory);
    await one.start(ANN, { persist: noTimer });
    one.cache.set(cacheKey("w2", "topics"), { n: 2 });
    await one.currentPersist()!.flush();
    __freshPageForTests();
    const two = makeKit(factory);
    await two.start(ANN);
    const reading = two.hydrateWorkspace("w2");
    setPrincipal(BEN);
    await reading;
    expect(two.cache.size()).toBe(0);
  });
});

describe("end", () => {
  test("a sign-out clears memory and wipes the copy; a wipe that fails is not an error", async () => {
    const bad: Kv = { ...memoryKv(), wipe: async () => { throw new Error("no"); } };
    const kit = makeKit(factory, { openKv: async () => bad });
    await expect(kit.end()).resolves.toBeUndefined();
    expect(currentPrincipal()).toBeNull();
  });
  test("a sign-in right after a sign-out waits for the wipe", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN, { persist: noTimer });
    kit.cache.set(cacheKey(WS, "topics"), 1);
    await kit.currentPersist()!.flush();
    void kit.end();
    await kit.start(BEN, { persist: noTimer });
    expect(await indexOf()).toEqual([]);
  });
});

describe("the parts the kit hands out", () => {
  test("the registry's warm context goes when the person changes", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN);
    kit.prefetch.setWarmContext({ ws: WS, vault: {} });
    await kit.start(BEN);
    expect(kit.prefetch.getWarmContext()).toBeNull();
  });
  test("a cache of the app's own is emptied by a change of person", async () => {
    const own = createSessionCache();
    const kit = makeKit(factory, { cache: own });
    await kit.start(ANN);
    own.set(cacheKey(WS, "x"), 1);
    await kit.start(BEN);
    expect(own.size()).toBe(0);
  });
});
