import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", () => ({
  dpopReadAuth: vi.fn(async (method: string, url: string) => ({ authorization: `DPoP t-${method}`, dpop: `proof-for-${url}` })),
}));

import { dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { forgetPictures, pictureObjectUrl } from "./index";

const ORIGIN = "https://example.test";
const ok = (text = "bytes") => new Response(new Blob([text]), { status: 200 });
let fetchMock: ReturnType<typeof vi.fn>;
let created: string[];
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  created = [];
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:example.test/${created.length + 1}`;
    created.push(u);
    return u;
  }) as unknown as typeof URL.createObjectURL;
  revoke = vi.fn();
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
});
afterEach(() => {
  forgetPictures();
  vi.unstubAllGlobals();
  vi.mocked(dpopReadAuth).mockClear();
});

describe("pictureObjectUrl", () => {
  test("the GET goes to the files door with the auth headers and credentials omitted", async () => {
    const u = await pictureObjectUrl("https://example.test/vault/e/file-1", ORIGIN);
    expect(u).toBe("blob:example.test/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.test/files/file-1");
    expect(init).toEqual({
      method: "GET",
      headers: { authorization: "DPoP t-GET", dpop: "proof-for-https://example.test/files/file-1" },
      credentials: "omit",
    });
    expect(dpopReadAuth).toHaveBeenCalledWith("GET", "https://example.test/files/file-1");
  });
  test("the id is percent-encoded in the address", async () => {
    await pictureObjectUrl("https://example.test/vault/e/a b", ORIGIN);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/files/a%20b");
  });
  test("a photo-ref address resolves to its file id", async () => {
    await pictureObjectUrl("/files/file-2", ORIGIN);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/files/file-2");
  });
  test("a plain entity address resolves to its id tail", async () => {
    await pictureObjectUrl("https://example.test/vault/e/file-3", ORIGIN);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/files/file-3");
  });
  test("a record address, which is not a photo-ref, resolves through the id tail", async () => {
    await pictureObjectUrl("https://example.test/lws/r/rec-14", ORIGIN);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/files/rec-14");
  });
  test("the origin is the one the caller gives", async () => {
    await pictureObjectUrl("https://example.test/vault/e/file-4", "https://other.example.test");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://other.example.test/files/file-4");
  });
  test("an address with no file id is refused before any request", async () => {
    await expect(pictureObjectUrl("", ORIGIN)).rejects.toThrow("This picture has no file address.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("a second call for the same file returns the same promise and fetches once", async () => {
    const a = pictureObjectUrl("https://example.test/vault/e/file-5", ORIGIN);
    const b = pictureObjectUrl("https://example.test/vault/e/file-5", ORIGIN);
    expect(b).toBe(a);
    await a;
    expect(pictureObjectUrl("https://example.test/vault/e/file-5", ORIGIN)).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });
  test("the cache is keyed by the file address only: a second origin gets the first URL", async () => {
    const first = await pictureObjectUrl("https://example.test/vault/e/file-6", ORIGIN);
    const second = await pictureObjectUrl("https://example.test/vault/e/file-6", "https://other.example.test");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test("a failed fetch is forgotten, so the next call fetches again", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(pictureObjectUrl("https://example.test/vault/e/file-7", ORIGIN)).rejects.toThrow("offline");
    await expect(pictureObjectUrl("https://example.test/vault/e/file-7", ORIGIN)).resolves.toBe("blob:example.test/1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  test("a refused read says so, with the status, and is forgotten", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 404 }));
    await expect(pictureObjectUrl("https://example.test/vault/e/file-8", ORIGIN)).rejects.toThrow("The picture could not be read (HTTP 404).");
    expect(created).toHaveLength(0);
    await pictureObjectUrl("https://example.test/vault/e/file-8", ORIGIN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  test("a failure of one file does not drop another file's entry", async () => {
    const good = pictureObjectUrl("https://example.test/vault/e/file-9", ORIGIN);
    await good;
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(pictureObjectUrl("https://example.test/vault/e/file-10", ORIGIN)).rejects.toThrow("HTTP 500");
    expect(pictureObjectUrl("https://example.test/vault/e/file-9", ORIGIN)).toBe(good);
  });
});

describe("forgetPictures", () => {
  test("revokes every URL and clears the cache", async () => {
    await pictureObjectUrl("https://example.test/vault/e/file-11", ORIGIN);
    await pictureObjectUrl("https://example.test/vault/e/file-12", ORIGIN);
    forgetPictures();
    await new Promise((r) => setTimeout(r, 0));
    expect(revoke.mock.calls.map((c) => c[0]).sort()).toEqual(["blob:example.test/1", "blob:example.test/2"]);
    await pictureObjectUrl("https://example.test/vault/e/file-11", ORIGIN);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  test("with nothing cached it does nothing", () => {
    forgetPictures();
    expect(revoke).not.toHaveBeenCalled();
  });
  test("a pending fetch that later fails does not make it throw", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    const p = pictureObjectUrl("https://example.test/vault/e/file-13", ORIGIN);
    p.catch(() => undefined);
    expect(() => forgetPictures()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(revoke).not.toHaveBeenCalled();
  });
});
