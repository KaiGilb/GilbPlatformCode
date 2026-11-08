import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-picture-upload", () => ({ uploadPicture: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", () => ({ patchRecord: vi.fn() }));

import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { uploadPicture } from "@kaigilb/gilbplatformcode-picture-upload";
import { linkFullLater, uploadWithThumb, type UploadProgress } from "./index";

const target = { vaultOrigin: "https://example.test", vaultRoot: "https://example.test/vault", folder: "pics" };
const E = (n: string) => `https://example.test/vault/e/${n}`;
const jpeg = (s: string) => new Blob([s], { type: "image/jpeg" });
const webp = (s: string) => new Blob([s], { type: "image/webp" });
const named = (name: string) => new File(["m"], name, { type: "image/jpeg" });

let calls: string[];
let warn: ReturnType<typeof vi.spyOn>;
const up = vi.mocked(uploadPicture);
const patch = vi.mocked(patchRecord);
const names = () => up.mock.calls.map((c) => c[1]);

beforeEach(() => {
  calls = [];
  up.mockReset();
  patch.mockReset();
  up.mockImplementation(async (_b, name) => {
    calls.push(`PUT ${name}`);
    return E(name.replace(/\W/g, ""));
  });
  patch.mockImplementation(async (id, p) => {
    calls.push(`PATCH ${id} ${JSON.stringify(p)}`);
    return { etag: null };
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("uploadWithThumb without a full copy (0.1.0 behaviour)", () => {
  test("master, then thumb, then one patch of transcodedFrom on the thumb; answers the master", async () => {
    const r = await uploadWithThumb(named("rose.png"), jpeg("t"), {}, target);
    expect(r).toBe(E("rosejpg"));
    expect(calls).toEqual(["PUT rose.jpg", "PUT rose-320.jpg", `PATCH rose320jpg ${JSON.stringify({ transcodedFrom: { "@id": E("rosejpg") } })}`]);
  });
  test("the target goes to every upload; the patch is on the thumb's own record", async () => {
    await uploadWithThumb(named("rose.jpg"), jpeg("t"), {}, target);
    expect(up.mock.calls.map((c) => c[2])).toEqual([target, target]);
    expect(patch.mock.calls[0]![2]).toBe(E("rose320jpg"));
    expect(patch).toHaveBeenCalledTimes(1);
  });
  test("a blob that is not a File is called picture; an empty file name too", async () => {
    await uploadWithThumb(jpeg("m"), jpeg("t"), {}, target);
    expect(names()).toEqual(["picture.jpg", "picture-320.jpg"]);
    up.mockClear();
    await uploadWithThumb(named(".jpg"), null, {}, target);
    expect(names()).toEqual(["picture.jpg"]);
    expect(names()).not.toContain("plant.jpg");
  });
  test("no thumb: one upload, no patch", async () => {
    await uploadWithThumb(named("a.jpg"), null, {}, target);
    expect(calls).toEqual(["PUT a.jpg"]);
  });
  test("with full omitted or null nothing of the full copy runs and the progress holds only the 0.1.0 keys", async () => {
    const seen: UploadProgress[] = [];
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { onProgress: (p) => void seen.push(p) }, target, null);
    expect(seen.at(-1)).toEqual({ masterEntity: E("ajpg"), thumbEntity: E("a320jpg"), thumbLinked: true });
    expect(calls.length).toBe(3);
  });
  test("onProgress is called after each step with a copy", async () => {
    const seen: UploadProgress[] = [];
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { onProgress: (p) => void seen.push(p) }, target);
    expect(seen).toEqual([{ masterEntity: E("ajpg") }, { masterEntity: E("ajpg"), thumbEntity: E("a320jpg") }, { masterEntity: E("ajpg"), thumbEntity: E("a320jpg"), thumbLinked: true }]);
    expect(seen[0]).not.toBe(seen[1]);
  });
  test("the sink's progress is not changed in place", async () => {
    const progress: UploadProgress = {};
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress }, target);
    expect(progress).toEqual({});
  });
  test("resume: masterEntity set, the master is not uploaded again", async () => {
    const r = await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress: { masterEntity: E("old") } }, target);
    expect(names()).toEqual(["a-320.jpg"]);
    expect(r).toBe(E("old"));
    expect((patch.mock.calls[0]![1] as { transcodedFrom: { "@id": string } }).transcodedFrom["@id"]).toBe(E("old"));
  });
  test("resume: thumbEntity set, only the patch", async () => {
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress: { masterEntity: E("old"), thumbEntity: E("oldthumb") } }, target);
    expect(up).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledTimes(1);
  });
  test("resume: thumbLinked set, nothing more is done", async () => {
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress: { masterEntity: E("m"), thumbEntity: E("t"), thumbLinked: true } }, target);
    expect(up).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });
  test("a thumb upload that fails warns, and the master is answered", async () => {
    up.mockImplementation(async (_b, name) => {
      if (name.includes("-320")) throw new TypeError("Failed to fetch");
      return E("m1");
    });
    expect(await uploadWithThumb(named("a.jpg"), jpeg("t"), {}, target)).toBe(E("m1"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();
  });
  test("a thumb patch that fails warns too; the thumb entity is kept in the progress for the retry", async () => {
    patch.mockRejectedValue(new Error("500"));
    const seen: UploadProgress[] = [];
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { onProgress: (p) => void seen.push(p) }, target);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toEqual({ masterEntity: E("ajpg"), thumbEntity: E("a320jpg") });
  });
  test("a master upload that fails fails the call", async () => {
    up.mockRejectedValue(new Error("down"));
    await expect(uploadWithThumb(named("a.jpg"), jpeg("t"), {}, target)).rejects.toThrow("down");
  });
  test("onProgress is awaited", async () => {
    let finished = false;
    await uploadWithThumb(named("a.jpg"), null, { onProgress: async () => { await new Promise((r) => setTimeout(r, 5)); finished = true; } }, target);
    expect(finished).toBe(true);
  });
});

describe("file extension follows the blob", () => {
  test("a WebP master and thumb are .webp; any other type is .jpg", async () => {
    await uploadWithThumb(new File(["m"], "a.png", { type: "image/webp" }), webp("t"), {}, target);
    expect(names()).toEqual(["a.webp", "a-320.webp"]);
    up.mockClear();
    await uploadWithThumb(new File(["m"], "a.png", { type: "image/png" }), new Blob(["t"]), {}, target);
    expect(names()).toEqual(["a.jpg", "a-320.jpg"]);
  });
  test("each blob has its own extension", async () => {
    await uploadWithThumb(named("a.jpg"), webp("t"), {}, target);
    expect(names()).toEqual(["a.jpg", "a-320.webp"]);
  });
});

describe("uploadWithThumb with a full copy as the root", () => {
  const linkOf = (i: number) => (patch.mock.calls[i]![1] as { transcodedFrom: { "@id": string } }).transcodedFrom["@id"];
  test("order: master, full, thumb, then the thumb and the master are linked to the full copy", async () => {
    const r = await uploadWithThumb(named("a.jpg"), jpeg("t"), {}, target, webp("f"));
    expect(r).toBe(E("ajpg"));
    expect(names()).toEqual(["a.jpg", "a-full.webp", "a-320.jpg"]);
    expect(patch.mock.calls.map((c) => c[2])).toEqual([E("a320jpg"), E("ajpg")]);
    expect(linkOf(0)).toBe(E("afullwebp"));
    expect(linkOf(1)).toBe(E("afullwebp"));
    expect(up.mock.calls.map((c) => c[2])).toEqual([target, target, target]);
    expect(calls.map((c) => c.split(" ")[0])).toEqual(["PUT", "PUT", "PUT", "PATCH", "PATCH"]);
  });
  test("the progress ends with every flag", async () => {
    const seen: UploadProgress[] = [];
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { onProgress: (p) => void seen.push(p) }, target, jpeg("f"));
    expect(seen.length).toBe(5);
    expect(seen.at(-1)).toEqual({ masterEntity: E("ajpg"), fullEntity: E("afulljpg"), thumbEntity: E("a320jpg"), thumbLinked: true, thumbRelinked: true, masterLinked: true, linkFailures: [] });
  });
  test("a full copy with no thumb: master is linked to the full copy", async () => {
    await uploadWithThumb(named("a.jpg"), null, {}, target, jpeg("f"));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]![2]).toBe(E("ajpg"));
  });
  test("a full upload that fails warns; the thumb is linked to the master as before and nothing else is patched", async () => {
    up.mockImplementation(async (_b, name) => {
      if (name.includes("-full")) throw new Error("full failed");
      return E(name.replace(/\W/g, ""));
    });
    expect(await uploadWithThumb(named("a.jpg"), jpeg("t"), {}, target, jpeg("f"))).toBe(E("ajpg"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(linkOf(0)).toBe(E("ajpg"));
  });
  test("a master link that fails warns, the thumb relink still runs, and the master is answered", async () => {
    patch.mockImplementation(async (id) => {
      if (id === "ajpg") throw new Error("412");
      return { etag: null };
    });
    expect(await uploadWithThumb(named("a.jpg"), jpeg("t"), {}, target, jpeg("f"))).toBe(E("ajpg"));
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("resume: fullEntity set, the full copy is not uploaded again", async () => {
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress: { masterEntity: E("m"), fullEntity: E("f") } }, target, jpeg("f"));
    expect(names()).toEqual(["a-320.jpg"]);
    expect(linkOf(0)).toBe(E("f"));
  });
  test("resume: masterLinked and thumbRelinked set, nothing is patched", async () => {
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress: { masterEntity: E("m"), fullEntity: E("f"), thumbEntity: E("t"), thumbLinked: true, thumbRelinked: true, masterLinked: true } }, target, jpeg("f"));
    expect(up).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });
  test("resume: only masterLinked missing, one patch on the master", async () => {
    await uploadWithThumb(named("a.jpg"), jpeg("t"), { progress: { masterEntity: E("m"), fullEntity: E("f"), thumbEntity: E("t"), thumbLinked: true, thumbRelinked: true } }, target, jpeg("f"));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]![2]).toBe(E("m"));
  });
});

describe("linkFullLater", () => {
  const saved: UploadProgress = { masterEntity: E("m"), thumbEntity: E("t"), thumbLinked: true };
  test("uploads the full copy, then links the master and the thumb to it", async () => {
    const seen: UploadProgress[] = [];
    const r = await linkFullLater(saved, webp("f"), { onProgress: (p) => void seen.push(p) }, target, "rose");
    expect(names()).toEqual(["rose-full.webp"]);
    expect(patch.mock.calls.map((c) => c[2])).toEqual([E("m"), E("t")]);
    expect(patch.mock.calls.map((c) => (c[1] as { transcodedFrom: { "@id": string } }).transcodedFrom["@id"])).toEqual([E("rosefullwebp"), E("rosefullwebp")]);
    expect(r).toEqual({ ...saved, fullEntity: E("rosefullwebp"), masterLinked: true, thumbRelinked: true, linkFailures: [] });
    expect(seen.length).toBe(3);
    expect(up.mock.calls[0]![2]).toBe(target);
  });
  test("a thumb whose first link never happened is marked linked once it is linked to the full copy", async () => {
    const r = await linkFullLater({ masterEntity: E("m"), thumbEntity: E("t") }, jpeg("f"), {}, target);
    expect(r.thumbLinked).toBe(true);
  });
  test("the name defaults to picture", async () => {
    await linkFullLater(saved, jpeg("f"), {}, target);
    expect(names()).toEqual(["picture-full.jpg"]);
  });
  test("no thumb: only the master is linked", async () => {
    await linkFullLater({ masterEntity: E("m") }, jpeg("f"), {}, target);
    expect(patch).toHaveBeenCalledTimes(1);
  });
  test("resume: fullEntity set, no upload; masterLinked set, only the thumb is patched", async () => {
    const r = await linkFullLater({ ...saved, fullEntity: E("f"), masterLinked: true }, jpeg("f"), {}, target);
    expect(up).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]![2]).toBe(E("t"));
    expect(r.thumbRelinked).toBe(true);
  });
  test("resume: everything done, nothing is called", async () => {
    await linkFullLater({ ...saved, fullEntity: E("f"), masterLinked: true, thumbRelinked: true }, jpeg("f"), {}, target);
    expect(up).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });
  test("a failed upload warns and answers the progress as it was; a failed link keeps the flags it did reach", async () => {
    up.mockRejectedValueOnce(new Error("offline"));
    expect(await linkFullLater(saved, jpeg("f"), {}, target)).toEqual(saved);
    expect(patch).not.toHaveBeenCalled();
    patch.mockRejectedValueOnce(new Error("500"));
    const r = await linkFullLater(saved, jpeg("f"), {}, target);
    expect(r.masterLinked).toBeUndefined();
    expect(r.thumbRelinked).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  test("the progress it was given is not changed", async () => {
    const p = { ...saved };
    await linkFullLater(p, jpeg("f"), {}, target);
    expect(p).toEqual(saved);
  });
  test("a progress with no master is refused", async () => {
    await expect(linkFullLater({}, jpeg("f"), {}, target)).rejects.toThrow();
  });
  test("a link that is refused is one linkFailure, and a clean link is an empty list", async () => {
    patch.mockRejectedValueOnce(new Error("412"));
    const failed = await linkFullLater(saved, jpeg("f"), {}, target);
    expect(failed.linkFailures).toEqual([{ which: "full", message: "412" }]);
    expect(failed.masterLinked).toBeUndefined();
    expect(failed.thumbRelinked).toBe(true);
    patch.mockReset();
    patch.mockImplementation(async () => ({ etag: null }));
    const ok = await linkFullLater(saved, jpeg("f"), {}, target);
    expect(ok.linkFailures).toEqual([]);
  });
});
