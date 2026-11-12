import { pictureFiles } from "@kaigilb/gilbplatformcode-picture-pick";
import { makePictureSet } from "@kaigilb/gilbplatformcode-picture-shrink";
import type { PreparedPicture } from "./types";

export type { PreparedPicture } from "./types";

const MB = 1024 * 1024;

/** The sentences checkPictureFile answers; both can be replaced. */
export interface PictureWords {
  notPicture: string;
  tooBig: (mb: number) => string;
}

const DEFAULT_WORDS: PictureWords = {
  notPicture: "That file is not a picture. Choose a JPEG or PNG.",
  tooBig: (mb) => `That picture is larger than ${mb} MB. Choose a smaller one.`,
};

/**
 * One sentence, or null when the file can be decoded. Checked before any decoding. A picture is what picture-pick's `pictureFiles` accepts:
 * a type that starts with `image/`, or an empty type with a picture extension (browsers often give a HEIC file an empty type).
 * `maxBytes` defaults to 25 MB; a file of exactly that size passes.
 */
export function checkPictureFile(file: File, o: { maxBytes?: number; words?: PictureWords } = {}): string | null {
  const maxBytes = o.maxBytes ?? 25 * MB;
  const words = o.words ?? DEFAULT_WORDS;
  if (pictureFiles([file]).length === 0) return words.notPicture;
  if (file.size > maxBytes) return words.tooBig(Number((maxBytes / MB).toFixed(1)));
  return null;
}

/**
 * Shrinks a picture to a screen copy (the master) and a small copy, with no full copy, and a preview object URL of the screen copy (the
 * caller revokes it). Edges default to picture-shrink's own: 1600 px screen, 320 px small. The type is "auto" (WebP where the browser can
 * encode it, else JPEG). EVERY copy is re-encoded from a canvas, so the original's metadata, EXIF and GPS location included, is dropped.
 * A file that cannot be decoded throws picture-shrink's PictureUnreadableError.
 */
export async function preparePicture(
  file: File,
  o: { screenEdge?: number; thumbEdge?: number; makeSet?: typeof makePictureSet } = {},
): Promise<PreparedPicture> {
  const make = o.makeSet ?? makePictureSet;
  const set = await make(file, {
    type: "auto",
    sizes: {
      full: false,
      ...(o.screenEdge !== undefined ? { screen: o.screenEdge } : {}),
      ...(o.thumbEdge !== undefined ? { thumb: o.thumbEdge } : {}),
    },
  });
  return { thumb: set.thumb, screen: set.screen, previewUrl: URL.createObjectURL(set.screen) };
}
