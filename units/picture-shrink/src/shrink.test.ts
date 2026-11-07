import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PictureUnreadableError, makePictures, shrinkPicture } from "./index";
import { fakeBitmap, installRig, type Rig } from "./testCanvas";

let rig: Rig;
beforeEach(() => {
  rig = installRig();
});
afterEach(() => rig.restore());

const file = () => new File(["x"], "ann.jpg", { type: "image/jpeg" });
const bitmapOf = (w: number, h: number) => {
  const b = fakeBitmap(w, h);
  rig.createImageBitmap.mockResolvedValue(b);
  return b;
};

describe("sizes", () => {
  test("a 4000x3000 picture gives a 1600x1200 master and a 320x240 thumbnail", async () => {
    bitmapOf(4000, 3000);
    await makePictures(file());
    expect(rig.blobCalls.map((c) => [c.width, c.height])).toEqual([[1600, 1200], [320, 240]]);
  });
  test("an 800x600 picture is never enlarged", async () => {
    bitmapOf(800, 600);
    await shrinkPicture(file());
    expect(rig.blobCalls[0]).toMatchObject({ width: 800, height: 600 });
  });
  test("a small picture is not enlarged to the thumbnail size either", async () => {
    bitmapOf(200, 100);
    await makePictures(file());
    expect(rig.blobCalls.map((c) => [c.width, c.height])).toEqual([[200, 100], [200, 100]]);
  });
  test("a portrait 3000x4000 picture gives 1200x1600", async () => {
    bitmapOf(3000, 4000);
    await shrinkPicture(file());
    expect(rig.blobCalls[0]).toMatchObject({ width: 1200, height: 1600 });
  });
  test("a 10000x1 picture keeps at least one pixel on the short edge", async () => {
    bitmapOf(10000, 1);
    await shrinkPicture(file());
    expect(rig.blobCalls[0]).toMatchObject({ width: 1600, height: 1 });
  });
  test("a 1x10000 picture keeps at least one pixel on the short edge", async () => {
    bitmapOf(1, 10000);
    await shrinkPicture(file());
    expect(rig.blobCalls[0]).toMatchObject({ width: 1, height: 1600 });
  });
  test("shrinkPicture takes the size and quality you give it", async () => {
    bitmapOf(4000, 3000);
    await shrinkPicture(file(), 1000, 0.5);
    expect(rig.blobCalls[0]).toEqual({ width: 1000, height: 750, type: "image/jpeg", quality: 0.5 });
  });
  test("the picture is drawn to the canvas at the exported size", async () => {
    const b = bitmapOf(4000, 3000);
    await shrinkPicture(file());
    expect(rig.draws).toEqual([[b, 0, 0, 1600, 1200]]);
  });
});

describe("quality", () => {
  test("the master is 0.82 and the thumbnail 0.72, both image/jpeg", async () => {
    bitmapOf(4000, 3000);
    await makePictures(file());
    expect(rig.blobCalls.map((c) => [c.type, c.quality])).toEqual([["image/jpeg", 0.82], ["image/jpeg", 0.72]]);
  });
  test("shrinkPicture defaults to a 1600 px edge at 0.82", async () => {
    bitmapOf(4000, 3000);
    await shrinkPicture(file());
    expect(rig.blobCalls).toEqual([{ width: 1600, height: 1200, type: "image/jpeg", quality: 0.82 }]);
  });
});

describe("decoding", () => {
  test("createImageBitmap is asked for the orientation in the file", async () => {
    bitmapOf(10, 10);
    const f = file();
    await shrinkPicture(f);
    expect(rig.createImageBitmap).toHaveBeenCalledWith(f, { imageOrientation: "from-image" });
  });
  test("makePictures decodes once for both copies", async () => {
    bitmapOf(4000, 3000);
    await makePictures(file());
    expect(rig.createImageBitmap).toHaveBeenCalledTimes(1);
  });
  test("when createImageBitmap throws, an <img> is used and its object URL is revoked on release", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no bitmap"));
    rig.image.width = 2000;
    rig.image.height = 1000;
    const blob = await shrinkPicture(file());
    expect(blob).toBeInstanceOf(Blob);
    expect(rig.blobCalls[0]).toMatchObject({ width: 1600, height: 800 });
    expect(rig.createObjectURL).toHaveBeenCalledTimes(1);
    expect(rig.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(rig.revokeObjectURL).toHaveBeenCalledWith("blob:example.test/picture");
  });
  test("when createImageBitmap does not exist, the <img> is used", async () => {
    (globalThis as Record<string, unknown>).createImageBitmap = undefined;
    rig.image.width = 100;
    rig.image.height = 50;
    await shrinkPicture(file());
    expect(rig.blobCalls[0]).toMatchObject({ width: 100, height: 50 });
  });
  test("an <img> that fails to load gives PictureUnreadableError and the URL is revoked", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no bitmap"));
    rig.image.mode = "error";
    await expect(shrinkPicture(file())).rejects.toBeInstanceOf(PictureUnreadableError);
    expect(rig.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  test("the error says which formats to try", async () => {
    bitmapOf(0, 0);
    const e = (await shrinkPicture(file()).catch((x: unknown) => x)) as Error;
    expect(e).toBeInstanceOf(PictureUnreadableError);
    expect(e.name).toBe("PictureUnreadableError");
    expect(e.message).toBe("This picture format can not be read here. Try a JPEG or PNG.");
  });
});

describe("refusals", () => {
  test("zero width gives PictureUnreadableError, in both functions", async () => {
    bitmapOf(0, 100);
    await expect(shrinkPicture(file())).rejects.toBeInstanceOf(PictureUnreadableError);
    await expect(makePictures(file())).rejects.toBeInstanceOf(PictureUnreadableError);
    expect(rig.blobCalls).toEqual([]);
  });
  test("zero height gives PictureUnreadableError", async () => {
    bitmapOf(100, 0);
    await expect(makePictures(file())).rejects.toBeInstanceOf(PictureUnreadableError);
  });
  test("toBlob answering null gives PictureUnreadableError", async () => {
    bitmapOf(100, 100);
    rig.nullBlob = true;
    await expect(shrinkPicture(file())).rejects.toBeInstanceOf(PictureUnreadableError);
  });
  test("a canvas with no 2d context gives PictureUnreadableError", async () => {
    bitmapOf(100, 100);
    rig.noContext = true;
    await expect(makePictures(file())).rejects.toBeInstanceOf(PictureUnreadableError);
  });
});

describe("release", () => {
  test("release is called exactly once after a good run", async () => {
    const b = bitmapOf(4000, 3000);
    await makePictures(file());
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("release is called exactly once when encoding throws", async () => {
    const b = bitmapOf(100, 100);
    rig.noContext = true;
    await shrinkPicture(file()).catch(() => undefined);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("release is called exactly once when the size is zero", async () => {
    const b = bitmapOf(0, 0);
    await shrinkPicture(file()).catch(() => undefined);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("release is called once when the second copy fails", async () => {
    const b = bitmapOf(4000, 3000);
    let n = 0;
    const real = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, q?: number) {
      n++;
      if (n === 2) cb(null);
      else real.call(this, cb, type, q);
    };
    await expect(makePictures(file())).rejects.toBeInstanceOf(PictureUnreadableError);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("a canvas draw that throws still releases", async () => {
    const b = bitmapOf(100, 100);
    rig.drawThrows = true;
    await expect(shrinkPicture(file())).rejects.toThrow("draw failed");
    expect(b.close).toHaveBeenCalledTimes(1);
  });
});
