import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", () => ({
  dpopReadAuth: vi.fn(async (method: string, url: string) => ({ authorization: `DPoP t-${method}`, dpop: `proof-for-${url}` })),
}));

import { createPictureSession, deviceCacheNameFor, disablePictureDeviceCache, forgetPictures, pictureObjectUrl, type PictureSessionService } from "./index";
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

function service() {
  const log: string[] = [];
  let n = 0;
  const pending: Array<(m: string) => void> = [];
  const s: PictureSessionService<string> = {
    fresh: (v) => void log.push(`fresh:${v}`),
    copies: (v) => (log.push(`copies:${v}`), Promise.resolve(`map${++n}`)),
    forget: () => void log.push("forget"),
  };
  return { s, log, pending };
}

describe("createPictureSession", () => {
  test("a person starts: their device cache is on, the copy map is listed fresh and handed to onCopies", async () => {
    const { s, log } = service();
    const maps: string[] = [];
    const session = createPictureSession({ deviceCachePrefix: "pr", service: s, vaultId: "v1", onCopies: (m) => maps.push(m) });
    await session.setPrincipal(ANN);
    expect(log).toEqual(["fresh:v1", "copies:v1"]);
    expect(maps).toEqual(["map1"]);
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([deviceCacheNameFor("pr", ANN)]);
  });

  test("the same principal again changes nothing", async () => {
    const { s, log } = service();
    const session = createPictureSession({ deviceCachePrefix: "pr", service: s, vaultId: "v1", onCopies: () => undefined });
    await session.setPrincipal(ANN);
    log.length = 0;
    await session.setPrincipal(ANN);
    expect(log).toEqual([]);
  });

  test("switching principal forgets the old person's pictures and cache, then starts the new person's", async () => {
    const { s, log } = service();
    const session = createPictureSession({ deviceCachePrefix: "pr", service: s, vaultId: "v1", onCopies: () => undefined });
    await session.setPrincipal(ANN);
    await pictureObjectUrl(FILE, ORIGIN);
    log.length = 0;
    await session.setPrincipal(BOB);
    expect(fake.calls.delete).toEqual([deviceCacheNameFor("pr", ANN)]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["forget", "fresh:v1", "copies:v1"]);
    fake.calls.open.length = 0;
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([deviceCacheNameFor("pr", BOB)]);
  });

  test("sign-out (stop, or a null principal) forgets everything, turns the cache off, and a second stop is safe", async () => {
    const { s, log } = service();
    const session = createPictureSession({ deviceCachePrefix: "pr", service: s, vaultId: "v1", onCopies: () => undefined });
    await session.setPrincipal(ANN);
    await pictureObjectUrl(FILE, ORIGIN);
    log.length = 0;
    await session.stop();
    expect(log).toEqual(["forget"]);
    expect(fake.calls.delete).toEqual([deviceCacheNameFor("pr", ANN)]);
    fake.calls.open.length = 0;
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([]);
    await expect(session.stop()).resolves.toBeUndefined();
    await session.setPrincipal(null);
    expect(log).toEqual(["forget"]);
  });

  test("a copy map that arrives after sign-out is dropped, and refresh does nothing without a person", async () => {
    let release: (m: string) => void = () => undefined;
    const log: string[] = [];
    const s: PictureSessionService<string> = { fresh: () => undefined, copies: () => new Promise((r) => (release = r)), forget: () => void log.push("forget") };
    const maps: string[] = [];
    const session = createPictureSession({ deviceCachePrefix: "pr", service: s, vaultId: "v1", onCopies: (m) => maps.push(m) });
    const starting = session.setPrincipal(ANN);
    await session.stop();
    release("late");
    await starting;
    expect(maps).toEqual([]);
    await session.refresh();
    expect(maps).toEqual([]);
  });

  test("an empty principal is sign-out and never starts a session", async () => {
    const { s, log } = service();
    const session = createPictureSession({ deviceCachePrefix: "pr", service: s, vaultId: "v1", onCopies: () => undefined });
    await session.setPrincipal("");
    expect(log).toEqual([]);
  });
});
