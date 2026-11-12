import type { UploadTarget } from "@kaigilb/gilbplatformcode-picture-upload";
import { uploadWithThumb, type ProgressSink, type UploadProgress } from "./uploadSet";

/** What {@link storePictureSet} stored. */
export interface StoredPicture {
  /** The master's address: the one thing a record keeps. */
  master: string;
  /** The small copy's address, or null when it was not stored. */
  thumb: string | null;
  /** The sizes, for a local copy map. */
  screenBytes: number;
  thumbBytes: number;
  /** A sentence when the picture is stored but its small copy is not linked, else null. */
  warning: string | null;
}

export const DEFAULT_UNLINKED_WARNING = "The picture is saved, but its small copy could not be linked. The list may be slow to show it.";

/**
 * Stores a shrunken picture (the screen copy as the master, and its small copy) and answers what was stored.
 * Each step is `uploadWithThumb`'s. When the small copy is not linked after the first try, it tries again, resuming from the progress,
 * so no finished step is sent twice (`retryLinks`, default 1 extra try). The master failing throws; a small copy that still is not linked
 * is not an error: it comes back as `warning` (`o.warning` or {@link DEFAULT_UNLINKED_WARNING}).
 *
 * @param parts the screen copy (stored as the master) and the small copy
 * @param target where to store (`picture-upload`'s target: vault origin, vault root, folder)
 * @param o `retryLinks` extra tries for an unlinked small copy (0 = none); `warning` replaces the sentence; `onProgress` sees each finished step
 */
export async function storePictureSet(
  parts: { screen: Blob; thumb: Blob },
  target: UploadTarget,
  o: { retryLinks?: number; warning?: string; onProgress?: (p: UploadProgress) => void } = {},
): Promise<StoredPicture> {
  let progress: UploadProgress = {};
  const sink: ProgressSink = {
    get progress() {
      return progress;
    },
    onProgress: (p) => {
      progress = p;
      o.onProgress?.(p);
    },
  };
  let master = await uploadWithThumb(parts.screen, parts.thumb, sink, target);
  const retries = Math.max(0, Math.floor(o.retryLinks ?? 1));
  for (let i = 0; i < retries && progress.thumbLinked !== true; i++) {
    master = await uploadWithThumb(parts.screen, parts.thumb, sink, target);
  }
  const linked = progress.thumbLinked === true && !(progress.linkFailures && progress.linkFailures.length > 0);
  return {
    master,
    thumb: progress.thumbEntity ?? null,
    screenBytes: parts.screen.size,
    thumbBytes: parts.thumb.size,
    warning: linked ? null : (o.warning ?? DEFAULT_UNLINKED_WARNING),
  };
}
