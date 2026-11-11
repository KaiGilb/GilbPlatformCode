/** The picture could not be decoded here. */
export class PictureUnreadableError extends Error {
  constructor(message = "This picture format can not be read here. Try a JPEG or PNG.") {
    super(message);
    this.name = "PictureUnreadableError";
  }
}

async function decodeNative(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    // An <img> is drawn with its EXIF orientation applied by current browsers.
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PictureUnreadableError();
  }
}

/** The sentence a person sees when a HEIC picture can not be read here. */
export const HEIC_UNREADABLE =
  "This HEIC picture can not be read here. On an iPhone, choose Most Compatible in Settings → Camera → Formats, or pick a JPEG.";

type HeicDecoder = (file: Blob) => Promise<Blob>;
let heicDecoder: HeicDecoder | null = null;

/** Sets (or, with null, clears) the app's HEIC decoder: it turns a HEIC file into a JPEG or PNG blob. One per app. The unit ships none. */
export function setHeicDecoder(fn: HeicDecoder | null): void {
  heicDecoder = fn;
}

function looksHeic(file: Blob): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const name = (file as { name?: unknown }).name;
  return type === "" && typeof name === "string" && /\.(heic|heif)$/i.test(name);
}

/** The browser's own decode; when it fails on a HEIC file, the app's HEIC decoder (called once) gets a go. */
async function decode(file: Blob): Promise<Decoded> {
  try {
    return await decodeNative(file);
  } catch (e) {
    if (!looksHeic(file)) throw e;
    const fn = heicDecoder;
    if (!fn) throw new PictureUnreadableError(HEIC_UNREADABLE);
    try {
      return await decodeNative(await fn(file));
    } catch {
      throw new PictureUnreadableError(HEIC_UNREADABLE);
    }
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

export type PictureType = "image/jpeg" | "image/webp";

/** Draws the decoded picture, scaled so its longest edge is at most `maxEdge` (never enlarged, never cropped), and exports it as `type`. */
async function encode(d: Decoded, maxEdge: number, quality: number, type: PictureType): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(d.width, d.height));
  const w = Math.max(1, Math.round(d.width * scale));
  const h = Math.max(1, Math.round(d.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PictureUnreadableError();
  ctx.drawImage(d.source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new PictureUnreadableError();
  return blob;
}

/** Draws the decoded picture, scaled so its longest edge is at most `maxEdge` (never enlarged, never cropped), and exports a JPEG. */
function encodeJpeg(d: Decoded, maxEdge: number, quality: number): Promise<Blob> {
  return encode(d, maxEdge, quality, "image/jpeg");
}

/** Scales the picture so its longest edge is at most `maxEdge`, upright, and returns it as a JPEG. */
export async function shrinkPicture(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  const d = await decode(file).catch((e: unknown) => {
    throw e instanceof PictureUnreadableError ? e : new PictureUnreadableError();
  });
  try {
    if (!d.width || !d.height) throw new PictureUnreadableError();
    return await encodeJpeg(d, maxEdge, quality);
  } finally {
    d.release();
  }
}

/** One decode, two JPEGs: the master (longest edge 1600, q0.82) and a thumb of the same picture, not cropped (longest edge 320, q0.72). */
export async function makePictures(file: Blob): Promise<{ master: Blob; thumb: Blob }> {
  const d = await decode(file).catch((e: unknown) => {
    throw e instanceof PictureUnreadableError ? e : new PictureUnreadableError();
  });
  try {
    if (!d.width || !d.height) throw new PictureUnreadableError();
    const master = await encodeJpeg(d, 1600, 0.82);
    const thumb = await encodeJpeg(d, 320, 0.72);
    return { master, thumb };
  } finally {
    d.release();
  }
}

let webpProbe: Promise<boolean> | null = null;

/** Whether this browser's canvas can export WebP: a 1x1 canvas is asked for one. Asked once, then remembered. */
export function webpSupported(): Promise<boolean> {
  webpProbe ??= new Promise<boolean>((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(!!blob && blob.type === "image/webp"), "image/webp");
    } catch {
      resolve(false);
    }
  });
  return webpProbe;
}

export type PictureSetOptions = {
  /** `sizes.full: false` makes no full copy at all (no encode): `full` is null in the answer. */
  sizes?: { thumb?: number; screen?: number; full?: number | false };
  type?: PictureType | "auto";
  quality?: { thumb?: number; screen?: number; full?: number };
};

export type PictureSet = { thumb: Blob; screen: Blob; full: Blob | null; width: number; height: number; type: PictureType };

/**
 * One decode, three copies of the same picture, not cropped: thumb (320, q0.72), screen (1600, q0.82) and full (4096, q0.9).
 * `full` is null when the original's longest edge is at most `screen`, or when `sizes.full` is `false` (no full copy is encoded). Every copy is re-encoded from a canvas, so no metadata survives.
 */
export async function makePictureSet(file: Blob, options: PictureSetOptions = {}): Promise<PictureSet> {
  const noFull = options.sizes?.full === false;
  const edge = { thumb: options.sizes?.thumb ?? 320, screen: options.sizes?.screen ?? 1600, full: options.sizes?.full === false ? 0 : (options.sizes?.full ?? 4096) };
  const q = { thumb: options.quality?.thumb ?? 0.72, screen: options.quality?.screen ?? 0.82, full: options.quality?.full ?? 0.9 };
  const d = await decode(file).catch((e: unknown) => {
    throw e instanceof PictureUnreadableError ? e : new PictureUnreadableError();
  });
  try {
    if (!d.width || !d.height) throw new PictureUnreadableError();
    const wanted = options.type ?? "image/jpeg";
    const type: PictureType = wanted === "auto" ? ((await webpSupported()) ? "image/webp" : "image/jpeg") : wanted;
    const thumb = await encode(d, edge.thumb, q.thumb, type);
    const screen = await encode(d, edge.screen, q.screen, type);
    const full = noFull || Math.max(d.width, d.height) <= edge.screen ? null : await encode(d, edge.full, q.full, type);
    return { thumb, screen, full, width: d.width, height: d.height, type };
  } finally {
    d.release();
  }
}
