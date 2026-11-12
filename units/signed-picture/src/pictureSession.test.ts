import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", () => ({
  dpopReadAuth: vi.fn(async (method: string, url: string) => ({ authorization: `DPoP t-${method}`, dpop: `proof-for-${url}` })),
}));

import { deviceCacheNameFor, disablePictureDeviceCache, forgetPictures, pictureObjectUrl, queuePicture, startPictureSession } from "./index";
import { makeCachesFake, type FakeCaches } from "../test/cachesFake";

const ORIGIN = "https://example.test";
const FILE = "https://example.test/vault/e/file-1";
const ANN = "https://id.example.test/base/p/ann";
const BOB = "https://id.example.test/base/p/bob";
let fake: FakeCaches;

beforeEach(() => {
  fake = makeCachesFake();
  vi.stubGlobal("caches", fake.storage);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes", { status: 200 })));
  URL.createObjectURL = vi.fn(() => "blob:example.test/1") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});
afterEach(() => {
  forgetPictures();
  disablePictureDeviceCache();
  vi.unstubAllGlobals();
});

describe("deviceCacheNameFor", () => {
  test("is stable for a principal, differs for another, and does not contain the principal", () => {
    const a = deviceCacheNameFor("pr7", ANN);
    expect(a).toBe(deviceCacheNameFor("pr7", ANN));
    expect(a).not.toBe(deviceCacheNameFor("pr7", BOB));
    expect(a.startsWith("pr7:")).toBe(true);
    expect(a).not.toContain("ann");
    expect(a).toMatch(/^pr7:[0-9a-z]+$/);
  });
  test("the prefix separates two apps for one person", () => {
    expect(deviceCacheNameFor("one", ANN)).not.toBe(deviceCacheNameFor("two", ANN));
  });
  test("many principals give many names (no collision in 2000)", () => {
    const names = new Set(Array.from({ length: 2000 }, (_, i) => deviceCacheNameFor("p", `https://id.example.test/base/p/user${i}`)));
    expect(names.size).toBe(2000);
  });
});

describe("startPictureSession", () => {
  test("turns on this person's device cache: a fetched picture is stored under their name", async () => {
    startPictureSession({ principal: ANN, deviceCachePrefix: "pr7" });
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([deviceCacheNameFor("pr7", ANN)]);
  });

  test("stop deletes that person's device cache, turns the cache off and frees the URLs", async () => {
    const stop = startPictureSession({ principal: ANN, deviceCachePrefix: "pr7" });
    await pictureObjectUrl(FILE, ORIGIN);
    await stop();
    expect(fake.calls.delete).toEqual([deviceCacheNameFor("pr7", ANN)]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    fake.calls.open.length = 0;
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([]);
    await expect(stop()).resolves.toBeUndefined();
  });

  test("a second person on the same device gets a different cache", async () => {
    const stopAnn = startPictureSession({ principal: ANN, deviceCachePrefix: "pr7" });
    await stopAnn();
    startPictureSession({ principal: BOB, deviceCachePrefix: "pr7" });
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([deviceCacheNameFor("pr7", BOB)]);
  });

  test("the queue limit defaults to 6 and takes the app's number", async () => {
    let running = 0;
    let peak = 0;
    const job = () => queuePicture(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    startPictureSession({ principal: ANN, deviceCachePrefix: "pr7" });
    await Promise.all(Array.from({ length: 20 }, job));
    expect(peak).toBe(6);
    peak = 0;
    startPictureSession({ principal: ANN, deviceCachePrefix: "pr7", queueLimit: 2 });
    await Promise.all(Array.from({ length: 10 }, job));
    expect(peak).toBe(2);
  });

  test("a bad principal or queue limit throws before changing anything", async () => {
    expect(() => startPictureSession({ principal: "", deviceCachePrefix: "pr7" })).toThrow(/principal/);
    expect(() => startPictureSession({ principal: ANN, deviceCachePrefix: "pr7", queueLimit: 0 })).toThrow(RangeError);
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([]);
  });
});
