import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-picture-upload", () => ({ uploadPicture: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", () => ({ patchRecord: vi.fn() }));

import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { uploadPicture } from "@kaigilb/gilbplatformcode-picture-upload";
import { DEFAULT_UNLINKED_WARNING, storePictureSet, type UploadProgress } from "./index";

const target = { vaultOrigin: "https://example.test", vaultRoot: "https://example.test/vault", folder: "pics" };
const E = (n: string) => `https://example.test/vault/e/${n}`;
const screen = new Blob(["screen-bytes"], { type: "image/jpeg" });
const thumb = new Blob(["t"], { type: "image/jpeg" });

const up = vi.mocked(uploadPicture);
const patch = vi.mocked(patchRecord);
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  up.mockReset();
  patch.mockReset();
  up.mockImplementation(async (_b, name) => E(name.replace(/\W/g, "")));
  patch.mockResolvedValue({ etag: null });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("storePictureSet", () => {
  test("stores master and thumbnail, links once, answers the addresses and sizes with no warning", async () => {
    const r = await storePictureSet({ screen, thumb }, target);
    expect(r).toEqual({ master: E("picturejpg"), thumb: E("picture320jpg"), screenBytes: screen.size, thumbBytes: thumb.size, warning: null });
    expect(up).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  test("a failed thumbnail link is tried again and resumes: the uploads are not repeated", async () => {
    patch.mockRejectedValueOnce(new Error("link failed"));
    const r = await storePictureSet({ screen, thumb }, target);
    expect(r.warning).toBeNull();
    expect(up).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(r.thumb).toBe(E("picture320jpg"));
  });

  test("a link that keeps failing is a warning, not an error, after exactly one retry by default", async () => {
    patch.mockRejectedValue(new Error("link failed"));
    const r = await storePictureSet({ screen, thumb }, target);
    expect(r.master).toBe(E("picturejpg"));
    expect(r.warning).toBe(DEFAULT_UNLINKED_WARNING);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(up).toHaveBeenCalledTimes(2);
  });

  test("retryLinks: 0 tries once; retryLinks: 3 tries four times; a custom warning replaces the sentence", async () => {
    patch.mockRejectedValue(new Error("x"));
    await storePictureSet({ screen, thumb }, target, { retryLinks: 0 });
    expect(patch).toHaveBeenCalledTimes(1);
    patch.mockClear();
    const r = await storePictureSet({ screen, thumb }, target, { retryLinks: 3, warning: "Slow list." });
    expect(patch).toHaveBeenCalledTimes(4);
    expect(r.warning).toBe("Slow list.");
  });

  test("a thumbnail that did not upload gives thumb null and the warning; the retry uploads only the thumbnail", async () => {
    up.mockImplementation(async (_b, name) => {
      if (name.includes("-320") && up.mock.calls.length < 3) throw new Error("thumb upload failed");
      return E(name.replace(/\W/g, ""));
    });
    const r = await storePictureSet({ screen, thumb }, target);
    expect(r.warning).toBeNull();
    expect(r.thumb).toBe(E("picture320jpg"));
    expect(up.mock.calls.map((c) => c[1])).toEqual(["picture.jpg", "picture-320.jpg", "picture-320.jpg"]);
    expect(warn).toHaveBeenCalled();
  });

  test("the master failing throws and nothing is linked", async () => {
    up.mockRejectedValueOnce(new Error("upload refused"));
    await expect(storePictureSet({ screen, thumb }, target)).rejects.toThrow("upload refused");
    expect(patch).not.toHaveBeenCalled();
  });

  test("onProgress sees each finished step", async () => {
    const seen: UploadProgress[] = [];
    await storePictureSet({ screen, thumb }, target, { onProgress: (p) => seen.push(p) });
    expect(seen.map((p) => [!!p.masterEntity, !!p.thumbEntity, p.thumbLinked === true])).toEqual([
      [true, false, false],
      [true, true, false],
      [true, true, true],
    ]);
  });
});
