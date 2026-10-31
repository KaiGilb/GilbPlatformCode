// The first page early (session-cache 0.2.0 preview) through the kit: a preview is shown, but it is never put on the device and never outlives a change of person.
import { beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { indexedDbKv } from "@kaigilb/gilbplatformcode-device-store";
import { __freshPageForTests } from "@kaigilb/gilbplatformcode-principal-hub";
import { cacheKey, type LoadContext } from "@kaigilb/gilbplatformcode-session-cache";
import { ANN, BEN, deferred, makeKit, noTimer, WS } from "../test/testKit";

let factory: IDBFactory;
beforeEach(() => { factory = new IDBFactory(); sessionStorage.clear(); __freshPageForTests(); });

/** Everything on the device for one person and workspace, as one string. */
async function disk(person: string): Promise<string> {
  const kv = (await indexedDbKv(factory, "example-cache"))!;
  return JSON.stringify([await kv.index(), await kv.read(person, WS)]);
}
const kitOf = () => makeKit(factory, { persistResources: ["entries"] });

describe("a preview is shown and is not stored", () => {
  test("a preview is on the cache snapshot as partial, and after flush() the device holds no record; the committed load then stores the complete value", async () => {
    const kit = kitOf();
    await kit.start(ANN, { workspace: WS, persist: noTimer });
    const key = cacheKey(WS, "entries");
    const answer = deferred<string[]>();
    let ctx: LoadContext<string[]> | undefined;
    const asked = kit.cache.swr(key, (c) => { ctx = c; return answer.promise; });
    ctx!.preview(["PREVIEW-1", "PREVIEW-2"]);
    expect(kit.cache.peek(key)).toMatchObject({ data: ["PREVIEW-1", "PREVIEW-2"], partial: true, updating: true, updatedAt: undefined });
    await kit.currentPersist()!.flush();
    expect(await disk(ANN)).not.toMatch(/PREVIEW/);
    expect(JSON.parse(await disk(ANN))[1]).toEqual([]);
    ctx!.preview(["PREVIEW-1", "PREVIEW-2", "PREVIEW-3"]);
    await kit.currentPersist()!.flush();
    expect(await disk(ANN)).not.toMatch(/PREVIEW/);
    answer.resolve(["FULL-1", "FULL-2", "FULL-3", "FULL-4"]);
    await asked.promise;
    await kit.currentPersist()!.flush();
    const stored = await disk(ANN);
    expect(stored).toContain("FULL-4");
    expect(stored).not.toMatch(/PREVIEW/);
    expect(kit.cache.peek(key).partial).toBeUndefined();
  });

  test("a failed load after a preview leaves nothing on the device either", async () => {
    const kit = kitOf();
    await kit.start(ANN, { workspace: WS, persist: noTimer });
    const key = cacheKey(WS, "entries");
    const answer = deferred<string[]>();
    let ctx: LoadContext<string[]> | undefined;
    const asked = kit.cache.swr(key, (c) => { ctx = c; return new Promise<string[]>((_r, rej) => { void answer.promise.then(() => rej(new Error("page 2 failed"))); }); });
    ctx!.preview(["PREVIEW-1"]);
    answer.resolve([]);
    await asked.promise.catch(() => undefined);
    expect(kit.cache.peek(key)).toMatchObject({ data: ["PREVIEW-1"], partial: true, updating: false });
    await kit.currentPersist()!.flush();
    expect(await disk(ANN)).not.toMatch(/PREVIEW/);
    expect(JSON.parse(await disk(ANN))[1]).toEqual([]);
  });
});

describe("a preview and a change of person", () => {
  test("Ann previews, Ben signs in: Ben's key is empty, Ann's late preview and answer land nowhere, and Ann's device copy is gone", async () => {
    const kit = kitOf();
    await kit.start(ANN, { workspace: WS, persist: noTimer });
    const keyA = cacheKey(WS, "entries"); // made for Ann
    const answer = deferred<string[]>();
    let ctx: LoadContext<string[]> | undefined;
    const asked = kit.cache.swr(keyA, (c) => { ctx = c; return answer.promise; });
    ctx!.preview(["ANN-PREVIEW"]);
    expect(kit.cache.peek(keyA).data).toEqual(["ANN-PREVIEW"]);
    await kit.start(BEN, { workspace: WS, persist: noTimer });
    const keyB = cacheKey(WS, "entries");
    expect(keyB).not.toBe(keyA);
    expect(kit.cache.peek(keyB).data).toBeUndefined();
    expect(kit.cache.peek(keyA).data).toBeUndefined();
    ctx!.preview(["ANN-LATE-PREVIEW"]);
    answer.resolve(["ANN-FINAL"]);
    await asked.promise.catch(() => undefined);
    await kit.currentPersist()!.flush();
    expect(kit.cache.peek(keyB).data).toBeUndefined();
    expect(kit.cache.peek(keyA).data).toBeUndefined();
    expect(kit.cache.size()).toBe(0);
    expect(await disk(ANN)).not.toMatch(/ANN-/);
    expect(await disk(BEN)).not.toMatch(/ANN-/);
  });
});
