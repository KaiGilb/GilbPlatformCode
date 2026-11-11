import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeBitmap, installRig, type Rig } from "../test/testCanvas";

type Unit = typeof import("./index");
let rig: Rig;
let u: Unit;
// A fresh module each time, so the WebP probe memo and the HEIC decoder start clean.
beforeEach(async () => {
  rig = installRig();
  vi.resetModules();
  u = await import("./index");
});
afterEach(() => rig.restore());

const file = () => new File(["x"], "ann.jpg", { type: "image/jpeg" });
const bitmapOf = (w: number, h: number) => {
  const b = fakeBitmap(w, h);
  rig.createImageBitmap.mockResolvedValue(b);
  return b;
};
const sizes = () => rig.blobCalls.map((c) => [c.width, c.height]);

describe("0.1.0 outputs are unchanged", () => {
  test("makePictures: 1600 q0.82 then 320 q0.72, image/jpeg, no WebP probe", async () => {
    bitmapOf(4000, 3000);
    await u.makePictures(file());
    expect(rig.blobCalls).toEqual([
      { width: 1600, height: 1200, type: "image/jpeg", quality: 0.82 },
      { width: 320, height: 240, type: "image/jpeg", quality: 0.72 },
    ]);
  });
  test("shrinkPicture: the size and quality given, image/jpeg", async () => {
    bitmapOf(4000, 3000);
    await u.shrinkPicture(file(), 1000, 0.5);
    expect(rig.blobCalls).toEqual([{ width: 1000, height: 750, type: "image/jpeg", quality: 0.5 }]);
  });
});

describe("makePictureSet sizes", () => {
  test("4000x3000: thumb 320x240, screen 1600x1200, full 4000x3000 (not enlarged, under 4096)", async () => {
    bitmapOf(4000, 3000);
    const r = await u.makePictureSet(file());
    expect(sizes()).toEqual([[320, 240], [1600, 1200], [4000, 3000]]);
    expect(r.full).toBeInstanceOf(Blob);
    expect([r.width, r.height, r.type]).toEqual([4000, 3000, "image/jpeg"]);
  });
  test("sizes.full: false on a 4000x3000 original: full is null and only the thumb and the screen copy are encoded", async () => {
    bitmapOf(4000, 3000);
    const r = await u.makePictureSet(file(), { sizes: { screen: 1600, thumb: 320, full: false } });
    expect(r.full).toBeNull();
    expect(r.thumb).toBeInstanceOf(Blob);
    expect(r.screen).toBeInstanceOf(Blob);
    expect(sizes()).toEqual([[320, 240], [1600, 1200]]);
  });
  test("sizes.full: false leaves the other sizes and the default alone; with it left out the full copy is still made", async () => {
    bitmapOf(6000, 4000);
    await u.makePictureSet(file(), { sizes: { full: false } });
    expect(sizes()).toEqual([[320, 213], [1600, 1067]]);
    rig.blobCalls.length = 0;
    bitmapOf(6000, 4000);
    expect((await u.makePictureSet(file())).full).toBeInstanceOf(Blob);
    expect(sizes()[2]).toEqual([4096, 2731]);
  });
  test("6000x4000: full is cut to 4096x2731", async () => {
    bitmapOf(6000, 4000);
    await u.makePictureSet(file());
    expect(sizes()[2]).toEqual([4096, 2731]);
  });
  test("1200x900: full is null and only two encodes run", async () => {
    bitmapOf(1200, 900);
    const r = await u.makePictureSet(file());
    expect(r.full).toBeNull();
    expect(sizes()).toEqual([[320, 240], [1200, 900]]);
  });
  test("exactly 1600 on the long edge: full is null", async () => {
    bitmapOf(1600, 1000);
    expect((await u.makePictureSet(file())).full).toBeNull();
  });
  test("1601 on the long edge: full is made", async () => {
    bitmapOf(1601, 1000);
    expect((await u.makePictureSet(file())).full).toBeInstanceOf(Blob);
  });
  test("the original's size is answered, not the copy's", async () => {
    bitmapOf(6000, 4000);
    const r = await u.makePictureSet(file());
    expect([r.width, r.height]).toEqual([6000, 4000]);
  });
});

describe("makePictureSet order, quality and options", () => {
  test("encodes thumb, screen, full, with q0.72, q0.82, q0.9", async () => {
    bitmapOf(6000, 4000);
    await u.makePictureSet(file());
    expect(rig.blobCalls.map((c) => [c.width, c.type, c.quality])).toEqual([
      [320, "image/jpeg", 0.72],
      [1600, "image/jpeg", 0.82],
      [4096, "image/jpeg", 0.9],
    ]);
  });
  test("sizes and quality can be given, one by one", async () => {
    bitmapOf(6000, 4000);
    await u.makePictureSet(file(), { sizes: { thumb: 100, full: 3000 }, quality: { screen: 0.5 } });
    expect(rig.blobCalls.map((c) => [c.width, c.quality])).toEqual([[100, 0.72], [1600, 0.5], [3000, 0.9]]);
  });
  test("a given screen size moves the line below which full is null", async () => {
    bitmapOf(1200, 900);
    const r = await u.makePictureSet(file(), { sizes: { screen: 1000 } });
    expect(r.full).toBeInstanceOf(Blob);
  });
  test("one decode for the three copies, one release", async () => {
    const b = bitmapOf(6000, 4000);
    await u.makePictureSet(file());
    expect(rig.createImageBitmap).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("the picture is drawn at each exported size", async () => {
    const b = bitmapOf(6000, 4000);
    await u.makePictureSet(file());
    expect(rig.draws).toEqual([[b, 0, 0, 320, 213], [b, 0, 0, 1600, 1067], [b, 0, 0, 4096, 2731]]);
  });
});

describe("type", () => {
  test("image/webp is asked for on every copy, with no probe", async () => {
    bitmapOf(6000, 4000);
    const r = await u.makePictureSet(file(), { type: "image/webp" });
    expect(rig.blobCalls.map((c) => c.type)).toEqual(["image/webp", "image/webp", "image/webp"]);
    expect(r.type).toBe("image/webp");
  });
  test("auto gives WebP when the browser can export it", async () => {
    bitmapOf(1200, 900);
    const r = await u.makePictureSet(file(), { type: "auto" });
    expect(r.type).toBe("image/webp");
    expect(r.thumb.type).toBe("image/webp");
    expect(rig.blobCalls.map((c) => c.type)).toEqual(["image/webp", "image/webp", "image/webp"]);
  });
  test("auto gives JPEG when it can not", async () => {
    rig.noWebp = true;
    bitmapOf(1200, 900);
    const r = await u.makePictureSet(file(), { type: "auto" });
    expect(r.type).toBe("image/jpeg");
    expect(r.screen.type).toBe("image/jpeg");
    expect(rig.blobCalls.slice(1).map((c) => c.type)).toEqual(["image/jpeg", "image/jpeg"]);
  });
});

describe("webpSupported", () => {
  test("true when the canvas answers a webp blob; the probe is a 1x1 canvas", async () => {
    await expect(u.webpSupported()).resolves.toBe(true);
    expect(rig.blobCalls).toEqual([{ width: 1, height: 1, type: "image/webp", quality: undefined }]);
  });
  test("false when the canvas falls back to another type", async () => {
    rig.noWebp = true;
    await expect(u.webpSupported()).resolves.toBe(false);
  });
  test("false when toBlob answers null", async () => {
    rig.nullBlob = true;
    await expect(u.webpSupported()).resolves.toBe(false);
  });
  test("asked once, then remembered, also across makePictureSet calls", async () => {
    bitmapOf(1200, 900);
    await u.webpSupported();
    await u.webpSupported();
    await u.makePictureSet(file(), { type: "auto" });
    await u.makePictureSet(file(), { type: "auto" });
    expect(rig.blobCalls.filter((c) => c.width === 1 && c.height === 1)).toHaveLength(1);
  });
});

describe("privacy: every copy comes from canvas.toBlob", () => {
  test("thumb, screen and full are the blobs the canvas made, not the original", async () => {
    bitmapOf(6000, 4000);
    const f = file();
    const r = await u.makePictureSet(f);
    expect(rig.blobs).toHaveLength(3);
    expect([r.thumb, r.screen, r.full]).toEqual(rig.blobs);
    expect(rig.blobs.some((b) => b === f)).toBe(false);
    expect(r.thumb).not.toBe(f);
  });
});

describe("makePictureSet refusals and release", () => {
  test("zero size gives PictureUnreadableError, nothing encoded, one release", async () => {
    const b = bitmapOf(0, 100);
    await expect(u.makePictureSet(file())).rejects.toBeInstanceOf(u.PictureUnreadableError);
    expect(rig.blobCalls).toEqual([]);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("an undecodable file gives the 0.1.0 message", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const e = (await u.makePictureSet(file()).catch((x: unknown) => x)) as Error;
    expect(e).toBeInstanceOf(u.PictureUnreadableError);
    expect(e.message).toBe("This picture format can not be read here. Try a JPEG or PNG.");
  });
  test("toBlob answering null gives PictureUnreadableError and one release", async () => {
    const b = bitmapOf(6000, 4000);
    rig.nullBlob = true;
    await expect(u.makePictureSet(file())).rejects.toBeInstanceOf(u.PictureUnreadableError);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  test("a failing full copy still releases once", async () => {
    const b = bitmapOf(6000, 4000);
    let n = 0;
    const real = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, q?: number) {
      if (++n === 3) cb(null);
      else real.call(this, cb, type, q);
    };
    await expect(u.makePictureSet(file())).rejects.toBeInstanceOf(u.PictureUnreadableError);
    expect(b.close).toHaveBeenCalledTimes(1);
  });
});

describe("HEIC", () => {
  const heic = () => new File(["h"], "IMG_1.HEIC", { type: "image/heic" });
  /** the browser can not read HEIC, but can read the JPEG the decoder gives */
  const browserCannotReadHeic = (jpeg: Blob, w = 3000, h = 2000) => {
    rig.image.mode = "error";
    rig.createImageBitmap.mockImplementation(async (f: Blob) => {
      if (f === jpeg) return fakeBitmap(w, h);
      throw new Error("no heic");
    });
  };

  test("the decoder is called once and its result is decoded", async () => {
    const jpeg = new Blob(["j"], { type: "image/jpeg" });
    browserCannotReadHeic(jpeg);
    const fn = vi.fn(async () => jpeg);
    u.setHeicDecoder(fn);
    const f = heic();
    const r = await u.makePictureSet(f);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(f);
    expect(r.width).toBe(3000);
    expect(rig.createImageBitmap).toHaveBeenLastCalledWith(jpeg, { imageOrientation: "from-image" });
  });
  test("works for makePictures and shrinkPicture too", async () => {
    const jpeg = new Blob(["j"], { type: "image/jpeg" });
    browserCannotReadHeic(jpeg);
    u.setHeicDecoder(async () => jpeg);
    await expect(u.makePictures(heic())).resolves.toBeTruthy();
    await expect(u.shrinkPicture(heic())).resolves.toBeInstanceOf(Blob);
  });
  test("the decoder is not called when the browser can read the file", async () => {
    bitmapOf(100, 100);
    const fn = vi.fn(async () => new Blob(["j"]));
    u.setHeicDecoder(fn);
    await u.makePictureSet(heic());
    expect(fn).not.toHaveBeenCalled();
  });
  test("the decoder is not called for a file that is not HEIC", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const fn = vi.fn(async () => new Blob(["j"]));
    u.setHeicDecoder(fn);
    await expect(u.makePictureSet(new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow("Try a JPEG or PNG");
    expect(fn).not.toHaveBeenCalled();
  });
  test("a decoder that throws gives HEIC_UNREADABLE", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    u.setHeicDecoder(async () => {
      throw new Error("wasm");
    });
    const e = (await u.makePictureSet(heic()).catch((x: unknown) => x)) as Error;
    expect(e).toBeInstanceOf(u.PictureUnreadableError);
    expect(e.message).toBe(u.HEIC_UNREADABLE);
  });
  test("a decoder whose result the browser can not read gives HEIC_UNREADABLE", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    u.setHeicDecoder(async () => new Blob(["junk"]));
    await expect(u.shrinkPicture(heic())).rejects.toThrow(u.HEIC_UNREADABLE);
  });
  test("no decoder gives HEIC_UNREADABLE, in all three functions", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    await expect(u.makePictureSet(heic())).rejects.toThrow(u.HEIC_UNREADABLE);
    await expect(u.makePictures(heic())).rejects.toThrow(u.HEIC_UNREADABLE);
    await expect(u.shrinkPicture(heic())).rejects.toThrow(u.HEIC_UNREADABLE);
  });
  test("the sentence is exactly this", () => {
    expect(u.HEIC_UNREADABLE).toBe(
      "This HEIC picture can not be read here. On an iPhone, choose Most Compatible in Settings → Camera → Formats, or pick a JPEG.",
    );
  });
  test("a non-HEIC failure keeps the 0.1.0 message, with or without a decoder", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const f = new File(["x"], "a.jpg", { type: "image/jpeg" });
    await expect(u.shrinkPicture(f)).rejects.toThrow("This picture format can not be read here. Try a JPEG or PNG.");
    u.setHeicDecoder(async () => new Blob(["j"]));
    await expect(u.makePictures(f)).rejects.toThrow("This picture format can not be read here. Try a JPEG or PNG.");
  });
  test.each([
    ["image/heic", "a.bin", true],
    ["image/heif", "a.bin", true],
    ["IMAGE/HEIC", "a.bin", true],
    ["", "a.heic", true],
    ["", "A.HEIF", true],
    ["", "a.jpg", false],
    ["image/jpeg", "a.heic", false],
    ["image/png", "a.heic", false],
    ["", "heic", false],
  ])("type %j name %j looks HEIC: %s", async (type, name, yes) => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const fn = vi.fn(async () => new Blob(["j"]));
    u.setHeicDecoder(fn);
    await u.shrinkPicture(new File(["x"], name, { type })).catch(() => undefined);
    expect(fn).toHaveBeenCalledTimes(yes ? 1 : 0);
  });
  test("an upper-case type string is still HEIC (File lower-cases its type, a host object may not)", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const fn = vi.fn(async () => new Blob(["j"]));
    u.setHeicDecoder(fn);
    await u.shrinkPicture({ type: "IMAGE/HEIC", name: "a.bin" } as unknown as File).catch(() => undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test("a blob with no name and no type is not HEIC", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const fn = vi.fn(async () => new Blob(["j"]));
    u.setHeicDecoder(fn);
    await expect(u.shrinkPicture(new Blob(["x"]) as File)).rejects.toThrow("Try a JPEG or PNG");
    expect(fn).not.toHaveBeenCalled();
  });
  test("setHeicDecoder(null) resets", async () => {
    rig.createImageBitmap.mockRejectedValue(new Error("no"));
    rig.image.mode = "error";
    const fn = vi.fn(async () => new Blob(["j"]));
    u.setHeicDecoder(fn);
    u.setHeicDecoder(null);
    await expect(u.shrinkPicture(heic())).rejects.toThrow(u.HEIC_UNREADABLE);
    expect(fn).not.toHaveBeenCalled();
  });
});
