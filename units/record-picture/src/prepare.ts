import { pictureFiles } from "@kaigilb/gilbplatformcode-picture-pick";
import { pictureFailure } from "@kaigilb/gilbplatformcode-picture-errors";
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

/** What {@link pickPicture} answers: the prepared picture (its `previewUrl` is the caller's to revoke), or ONE plain sentence for the person. */
export type PickResult = { ok: true; prepared: PreparedPicture; previewUrl: string } | { ok: false; sentence: string };

/**
 * The pick step: the first file picked, `checkPictureFile`, `prepare` (default `preparePicture`), and a preview URL. A file that fails the
 * check or cannot be prepared is `{ ok: false, sentence }`: the check's own sentence, or picture-errors' sentence and what to do next for a
 * failure of `prepare`. No file is `null`. When `isAlive()` is false by the time the picture is prepared (the screen went away) the preview is
 * revoked at once and the answer is `null`.
 *
 * @param files what the picker gave (picture-pick's `onPick`)
 * @param o `prepare`, `maxBytes` and `words` for the check, `failureWords` (picture-errors' words), `isAlive`
 */
export async function pickPicture(
  files: readonly File[],
  o: { prepare?: (file: File) => Promise<PreparedPicture>; maxBytes?: number; words?: PictureWords; failureWords?: Parameters<typeof pictureFailure>[1]; isAlive?: () => boolean } = {},
): Promise<PickResult | null> {
  const file = files[0];
  if (!file) return null;
  const bad = checkPictureFile(file, { ...(o.maxBytes !== undefined ? { maxBytes: o.maxBytes } : {}), ...(o.words ? { words: o.words } : {}) });
  if (bad) return { ok: false, sentence: bad };
  let prepared: PreparedPicture;
  try {
    prepared = await (o.prepare ?? preparePicture)(file);
  } catch (e) {
    const f = pictureFailure(e, o.failureWords);
    return { ok: false, sentence: `${f.sentence} ${f.next}` };
  }
  if (o.isAlive && !o.isAlive()) {
    URL.revokeObjectURL(prepared.previewUrl);
    return null;
  }
  return { ok: true, prepared, previewUrl: prepared.previewUrl };
}
