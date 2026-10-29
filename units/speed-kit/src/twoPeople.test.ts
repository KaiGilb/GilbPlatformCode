// Two people on one device: nothing of Ann is readable by Ben from the person hub's caches, the session cache, the background jobs or the device store,
// and an answer that reaches Ann's code after Ben has signed in is not shown to Ben.
import { beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { indexedDbKv } from "@kaigilb/gilbplatformcode-device-store";
import { __freshPageForTests } from "@kaigilb/gilbplatformcode-principal-hub";
import { cacheKey } from "@kaigilb/gilbplatformcode-session-cache";
import { ANN, BEN, deferred, makeKit, noTimer, WS } from "../test/testKit";

let factory: IDBFactory;
beforeEach(() => { factory = new IDBFactory(); sessionStorage.clear(); __freshPageForTests(); });

/** Everything that is on the device, whoever it belongs to. */
async function onDisk(): Promise<string> {
  const kv = (await indexedDbKv(factory, "example-cache"))!;
  const all = await kv.index();
  return JSON.stringify([all, ...(await Promise.all([ANN, BEN].map((p) => kv.read(p, WS).then((r) => kv.read(p, "").then((v) => [...r, ...v])))))]);
}
/** Everything one kit shows for a workspace, as one string. */
function shown(kit: ReturnType<typeof makeKit>): string {
  return JSON.stringify([kit.jobs.jobsOf(WS), kit.jobs.noticesOf(WS), kit.jobs.toastsOf(WS), kit.jobs.unfinishedOf(WS), kit.cache.size(), kit.prefetch.getWarmContext()]);
}

async function annWorks(kit: ReturnType<typeof makeKit>) {
  await kit.start(ANN, { workspace: WS, persist: noTimer });
  kit.prefetch.setWarmContext({ ws: WS, vault: {} });
  kit.cache.set(cacheKey(WS, "topics"), { secret: "ANN-TOPICS" });   // fills the session cache (and, on commit, the device store)
  await kit.currentPersist()!.flush();
  await kit.jobs.enqueue({ key: "k-done", kind: "save", draftId: "d1", workspace: WS, label: "ANN-LABEL-1", run: async () => ({ ok: false, message: "ANN-FAILED" }) });
  await kit.jobs.jobsIdle();
  const gate = deferred<{ ok: boolean; message: string }>();
  kit.jobs.enqueue({ key: "k-run", kind: "save", draftId: "d2", workspace: WS, label: "ANN-LABEL-2", run: () => gate.promise });
  return gate;
}

describe("Ann works, then Ben signs in (a change of person)", () => {
  test("Ann's work is visible to Ann: the test would otherwise prove nothing", async () => {
    const kit = makeKit(factory);
    await annWorks(kit);
    expect(shown(kit)).toContain("ANN-");
    expect(await onDisk()).toContain("ANN-TOPICS");
    expect(sessionStorage.getItem("example.jobIntents")).toContain("ANN-LABEL-2");
  });

  test("nothing of Ann is readable from the hub's caches, the cache, the jobs or the device", async () => {
    const kit = makeKit(factory);
    const gate = await annWorks(kit);
    const b = await kit.start(BEN, { workspace: WS, persist: noTimer });
    expect(b).toEqual({ disk: true, hydrated: false });
    expect(shown(kit)).not.toMatch(/ANN/);
    expect(shown(kit)).toBe("[[],[],[],[],0,null]");
    expect(kit.cache.peek(`${ANN}|${WS}|topics`).data).toBeUndefined();
    expect(await onDisk()).not.toMatch(/ANN|ann\.example/);
    expect(sessionStorage.getItem("example.jobIntents") ?? "").not.toMatch(/ANN/);
    gate.resolve({ ok: true, message: "ANN-DONE" });
    await kit.jobs.jobsIdle();
    expect(shown(kit)).not.toMatch(/ANN/);
    expect(sessionStorage.getItem("example.jobIntents") ?? "").not.toMatch(/ANN/);
  });

  test("a late answer for Ann, landing after the switch, is not shown to Ben and not written to the device", async () => {
    const kit = makeKit(factory);
    await kit.start(ANN, { workspace: WS, persist: noTimer });
    const late = deferred<{ secret: string }>();
    const key = cacheKey(WS, "topics");           // made for Ann, before the await
    const asked = kit.cache.swr(key, () => late.promise);
    await kit.start(BEN, { workspace: WS, persist: noTimer });
    late.resolve({ secret: "ANN-LATE" });
    await asked.promise.catch(() => undefined);
    await kit.currentPersist()!.flush();
    expect(kit.cache.size()).toBe(0);
    expect(kit.cache.peek(key).data).toBeUndefined();
    expect(kit.cache.peek(cacheKey(WS, "topics")).data).toBeUndefined();
    expect(await onDisk()).not.toMatch(/ANN/);
  });
});

describe("Ann signs out, then Ben signs in", () => {
  test("the device is empty after the sign-out, and Ben starts from nothing", async () => {
    const kit = makeKit(factory);
    const gate = await annWorks(kit);
    await kit.end();
    expect((await (await indexedDbKv(factory, "example-cache"))!.index())).toEqual([]);
    expect(shown(kit)).not.toMatch(/ANN/);
    const b = await kit.start(BEN, { workspace: WS, persist: noTimer });
    expect(b.hydrated).toBe(false);
    gate.resolve({ ok: true, message: "ANN-DONE" });
    await kit.jobs.jobsIdle();
    expect(shown(kit)).not.toMatch(/ANN/);
    expect(await onDisk()).not.toMatch(/ANN/);
  });

  test("a reload between the two: Ben's page finds none of Ann's copy, her jobs or her intent records", async () => {
    const first = makeKit(factory);
    const gate = await annWorks(first);
    gate.resolve({ ok: true, message: "ANN-DONE" });
    await first.jobs.jobsIdle();
    await first.end();
    __freshPageForTests();                          // the page reloads; storage stays
    const second = makeKit(factory);
    const b = await second.start(BEN, { workspace: WS, persist: noTimer });
    expect(b.hydrated).toBe(false);
    expect(shown(second)).not.toMatch(/ANN/);
    expect(sessionStorage.getItem("example.jobIntents") ?? "").not.toMatch(/ANN/);
  });

  test("a reload that cuts Ann's job off: Ann sees 'did not finish', Ben does not", async () => {
    const first = makeKit(factory);
    await annWorks(first);                          // a job is running when the page goes
    __freshPageForTests();
    const second = makeKit(factory);
    await second.start(BEN, { workspace: WS, persist: noTimer });
    expect(second.jobs.unfinishedOf(WS)).toEqual([]);
    expect(sessionStorage.getItem("example.jobIntents") ?? "").not.toMatch(/ANN/);
  });

  test("with no one signed in the stored copy is wiped even when no copy was running (a page that loads signed out)", async () => {
    const first = makeKit(factory);
    await annWorks(first);
    __freshPageForTests();
    const second = makeKit(factory);
    await second.end();
    expect(await (await indexedDbKv(factory, "example-cache"))!.index()).toEqual([]);
  });
});
