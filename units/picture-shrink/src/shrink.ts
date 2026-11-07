/** The picture could not be decoded here. */
export class PictureUnreadableError extends Error {
  constructor(message = "This picture format can not be read here. Try a JPEG or PNG.") {
    super(message);
    this.name = "PictureUnreadableError";
  }
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
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

type Decoded = Awaited<ReturnType<typeof decode>>;

/** Draws the decoded picture, scaled so its longest edge is at most `maxEdge` (never enlarged, never cropped), and exports a JPEG. */
async function encodeJpeg(d: Decoded, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(d.width, d.height));
  const w = Math.max(1, Math.round(d.width * scale));
  const h = Math.max(1, Math.round(d.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PictureUnreadableError();
  ctx.drawImage(d.source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new PictureUnreadableError();
  return blob;
}

/** Scales the picture so its longest edge is at most `maxEdge`, upright, and returns it as a JPEG. */
export async function shrinkPicture(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  const d = await decode(file).catch(() => {
    throw new PictureUnreadableError();
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
  const d = await decode(file).catch(() => {
    throw new PictureUnreadableError();
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
