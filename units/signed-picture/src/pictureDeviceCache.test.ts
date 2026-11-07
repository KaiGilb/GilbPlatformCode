import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", () => ({
  dpopReadAuth: vi.fn(async (method: string, url: string) => ({ authorization: `DPoP t-${method}`, dpop: `proof-for-${url}` })),
}));

import { disablePictureDeviceCache, enablePictureDeviceCache, forgetPictures, pictureObjectUrl } from "./index";
import { makeCachesFake, type FakeCaches } from "../test/cachesFake";

const ORIGIN = "https://example.test";
const FILE = "https://example.test/vault/e/file-1";
const URL1 = "https://example.test/files/file-1";
const ok = (text = "bytes") => new Response(text, { status: 200 });
let fetchMock: ReturnType<typeof vi.fn>;
let fake: FakeCaches;
let blobs: Blob[];
// Reads any blob: a Node Blob has text(); a jsdom Blob (no text()) is read with jsdom's FileReader.
const textOf = (b: Blob): Promise<string> => {
  if (typeof (b as { text?: unknown }).text === "function") return b.text();
  if (b instanceof Blob) {
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(b);
    });
  }
  return new Response(b).text();
};
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  blobs = [];
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
  fake = makeCachesFake();
  vi.stubGlobal("caches", fake.storage);
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return `blob:example.test/${blobs.length}`;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  forgetPictures();
  disablePictureDeviceCache();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

describe("the device cache", () => {
  test("off by default: nothing is opened or stored", async () => {
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([]);
    expect(fake.calls.put).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test("a miss fetches, stores a copy under the request URL, then makes the object URL", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    const u = await pictureObjectUrl(FILE, ORIGIN);
    expect(u).toBe("blob:example.test/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fake.calls.open).toEqual(["sp:ann"]);
    expect(fake.calls.put).toEqual([URL1]);
    expect(await textOf(blobs[0]!)).toBe("bytes");
    expect(await fake.stores.get("sp:ann")!.get(URL1)!.text()).toBe("bytes");
  });
  test("a hit makes the object URL from the stored blob with no network call", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    await pictureObjectUrl(FILE, ORIGIN);
    forgetPictures();
    fetchMock.mockClear();
    const u = await pictureObjectUrl(FILE, ORIGIN);
    expect(u).toBe("blob:example.test/2");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await textOf(blobs[1]!)).toBe("bytes");
  });
  test("the key is the request URL with the encoded id", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    await pictureObjectUrl("https://example.test/vault/e/a b", ORIGIN);
    expect(fake.calls.put).toEqual(["https://example.test/files/a%20b"]);
  });
  test("a refused read is not stored", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 404 }));
    await expect(pictureObjectUrl(FILE, ORIGIN)).rejects.toThrow("The picture could not be read (HTTP 404).");
    expect(fake.calls.put).toEqual([]);
  });
  test("a put that throws is swallowed with one warning and the picture still shows", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    fake.failPut = true;
    const u = await pictureObjectUrl(FILE, ORIGIN);
    expect(u).toBe("blob:example.test/1");
    expect(await textOf(blobs[0]!)).toBe("bytes");
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("a cache that cannot be opened is swallowed with one warning and the picture is fetched", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    vi.stubGlobal("caches", { open: async () => { throw new Error("private mode"); }, delete: async () => true });
    const u = await pictureObjectUrl(FILE, ORIGIN);
    expect(u).toBe("blob:example.test/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("a read that throws after the cache opened is swallowed with one warning, the picture is fetched and nothing is stored", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    vi.stubGlobal("caches", {
      open: async () => ({ match: async () => { throw new Error("broken"); }, put: async () => { throw new Error("must not be called"); } }),
      delete: async () => true,
    });
    const u = await pictureObjectUrl(FILE, ORIGIN);
    expect(u).toBe("blob:example.test/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("two names keep two people apart: Ann's cache never answers Ben", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    await pictureObjectUrl(FILE, ORIGIN);
    forgetPictures();
    enablePictureDeviceCache({ name: "sp:ben" });
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(ok("ben-bytes"));
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await textOf(blobs[1]!)).toBe("ben-bytes");
    expect([...fake.stores.keys()].sort()).toEqual(["sp:ann", "sp:ben"]);
    expect(await fake.stores.get("sp:ann")!.get(URL1)!.text()).toBe("bytes");
  });
  test("disabling stops its use", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    disablePictureDeviceCache();
    await pictureObjectUrl(FILE, ORIGIN);
    expect(fake.calls.open).toEqual([]);
  });
  test("forgetPictures({ device: true }) deletes the named cache; plain forgetPictures() does not", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    await pictureObjectUrl(FILE, ORIGIN);
    forgetPictures();
    expect(fake.calls.delete).toEqual([]);
    expect(fake.stores.has("sp:ann")).toBe(true);
    forgetPictures({ device: false });
    expect(fake.calls.delete).toEqual([]);
    forgetPictures({ device: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.calls.delete).toEqual(["sp:ann"]);
    expect(fake.stores.has("sp:ann")).toBe(false);
  });
  test("forgetPictures({ device: true }) with the cache not enabled deletes nothing", async () => {
    forgetPictures({ device: true });
    expect(fake.calls.delete).toEqual([]);
  });
  test("a delete that fails is swallowed with a warning", async () => {
    enablePictureDeviceCache({ name: "sp:ann" });
    vi.stubGlobal("caches", { delete: async () => { throw new Error("denied"); } });
    forgetPictures({ device: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("without a caches global, enabling is a no-op and the picture comes as in 0.1.0", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    expect((globalThis as { caches?: unknown }).caches).toBeUndefined();
    enablePictureDeviceCache({ name: "sp:ann" });
    const u = await pictureObjectUrl(FILE, ORIGIN);
    expect(u).toBe("blob:example.test/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toEqual({
      method: "GET",
      headers: { authorization: "DPoP t-GET", dpop: `proof-for-${URL1}` },
      credentials: "omit",
    });
    forgetPictures({ device: true });
    expect(warn).not.toHaveBeenCalled();
  });
});
