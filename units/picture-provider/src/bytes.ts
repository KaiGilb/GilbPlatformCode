// What a made picture's bytes may be: PNG, JPEG or WebP, checked by their own magic numbers, never by a header alone.

export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type PictureType = (typeof PICTURE_TYPES)[number];

/** The most bytes one made picture may hold (10 MiB). A larger answer is cut off and refused. */
export const PICTURE_BYTES_MAX = 10 * 1024 * 1024;

/**
 * The size a PNG states in its IHDR chunk, or null when the bytes are not a PNG.
 *
 * @param b the bytes
 */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 33) return null;
  const magic = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!magic.every((v, i) => b[i] === v)) return null;
  const be = (o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  if (be(8) !== 13 || String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== "IHDR") return null;
  const width = be(16), height = be(20);
  return width > 0 && height > 0 && width <= 16384 && height <= 16384 ? { width, height } : null;
}

/**
 * True when the bytes are a picture of the stated media type.
 *
 * @param b the bytes
 * @param mime the media type the bytes are said to be
 */
export function imageBytesMatch(b: Uint8Array, mime: string): boolean {
  if (mime === "image/png") return pngSize(b) !== null;
  if (mime === "image/jpeg") return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/webp") return b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return false;
}
