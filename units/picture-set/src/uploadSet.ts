import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { entityIdTail } from "@kaigilb/gilbplatformcode-photo-ref";
import { uploadPicture, type UploadTarget } from "@kaigilb/gilbplatformcode-picture-upload";

/** The file extension a blob is stored with: `.webp` for a WebP blob, else `.jpg`. */
const ext = (b: Blob): string => (b.type === "image/webp" ? ".webp" : ".jpg");

const baseName = (pic: File | Blob): string => {
  const base = pic instanceof File && pic.name ? pic.name.replace(/\.[^./\\]+$/, "") : "picture";
  return base || "picture";
};

/** A link to the full copy that did not land. The picture is stored; it is not tied to its record. */
export type LinkFailure = { which: "full" | "thumb"; message: string };

/** What a send has already done. A retry resumes after these steps and never uploads the same picture twice. */
export type UploadProgress = { masterEntity?: string; thumbEntity?: string; thumbLinked?: boolean; fullEntity?: string; masterLinked?: boolean; thumbRelinked?: boolean; linkFailures?: LinkFailure[] };
export type ProgressSink = { progress?: UploadProgress; onProgress?: (p: UploadProgress) => void | Promise<void> };

/**
 * Uploads the master, then its 320 px copy, then tells the vault the copy was made from the master: a PATCH of `transcodedFrom` on the
 * copy's file record (the upload door takes no facts at create: its query carries only name, folder, tag, storedWith).
 * Each finished step is reported through `onProgress` and skipped when `progress` already holds it.
 * The master upload failing fails the save (the retry repeats only the steps not done). The copy is best effort: any failure there is
 * logged and the save goes on with the master alone. Answers the MASTER's entity URI.
 * When `full` is given it is the ROOT of the copies: it is uploaded (`<base>-full<ext>`) right after the master, the copy is linked to it
 * (not to the master), and then the master is linked to it too (`transcodedFrom` on the master's file record). The full copy and its links
 * are best effort like the small copy; the answer is still the MASTER's entity URI. Without `full` nothing of this runs.
 */
export async function uploadWithThumb(master: File | Blob, thumb: Blob | null | undefined, sink: ProgressSink, target: UploadTarget, full?: Blob | null): Promise<string> {
  const base = baseName(master);
  const done: UploadProgress = { ...(sink.progress ?? {}) };
  const note = async () => {
    await sink.onProgress?.({ ...done });
  };
  if (!done.masterEntity) {
    done.masterEntity = await uploadPicture(master, `${base}${ext(master)}`, target);
    await note();
  }
  const file = done.masterEntity;
  if (full && !done.fullEntity) {
    try {
      done.fullEntity = await uploadPicture(full, `${base}-full${ext(full)}`, target);
      await note();
    } catch (e) {
      console.warn("The full-size copy of the picture could not be saved; the picture is shown at the size that was saved.", e);
    }
  }
  if (thumb && !done.thumbLinked) {
    try {
      if (!done.thumbEntity) {
        done.thumbEntity = await uploadPicture(thumb, `${base}-320${ext(thumb)}`, target);
        await note();
      }
      await patchRecord(entityIdTail(done.thumbEntity) || done.thumbEntity, { transcodedFrom: { "@id": done.fullEntity ?? file } }, done.thumbEntity);
      done.thumbLinked = true;
      if (done.fullEntity) done.thumbRelinked = true;
      await note();
    } catch (e) {
      console.warn("The small copy of the picture could not be saved; the list will show the full picture.", e);
    }
  }
  if (done.fullEntity) await linkToFull(done, note);
  return file;
}

function linkFailureMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Links the master and the small copy to the full copy, each once (best effort: a failure warns and the other still runs). Needs `done.fullEntity`. Records each failed link on `done.linkFailures` and does not throw. */
async function linkToFull(done: UploadProgress, note: () => Promise<void>): Promise<void> {
  const full = done.fullEntity;
  const failures: LinkFailure[] = [];
  const stamp = () => {
    done.linkFailures = failures.map((f) => ({ ...f }));
  };
  if (!full) {
    stamp();
    return;
  }
  if (done.masterEntity && !done.masterLinked) {
    try {
      await patchRecord(entityIdTail(done.masterEntity) || done.masterEntity, { transcodedFrom: { "@id": full } }, done.masterEntity);
      done.masterLinked = true;
      stamp();
      await note();
    } catch (e) {
      console.warn("The picture could not be linked to its full-size copy.", e);
      failures.push({ which: "full", message: linkFailureMessage(e) });
    }
  }
  if (done.thumbEntity && !done.thumbRelinked) {
    try {
      await patchRecord(entityIdTail(done.thumbEntity) || done.thumbEntity, { transcodedFrom: { "@id": full } }, done.thumbEntity);
      done.thumbLinked = true;
      done.thumbRelinked = true;
      stamp();
      await note();
    } catch (e) {
      console.warn("The small copy could not be linked to the full-size copy.", e);
      failures.push({ which: "thumb", message: linkFailureMessage(e) });
    }
  }
  stamp();
  if (failures.length > 0) await note();
}

/**
 * For a full copy that arrives after the save (it waits for Wi-Fi): uploads it when `progress.fullEntity` is not set, then links the master
 * and the small copy (when there is one) to it. Resumes by `fullEntity`, `masterLinked` and `thumbRelinked`. Best effort: a failure warns and
 * the progress so far is answered, so the caller can try again. Throws only when the master was never saved.
 */
export async function linkFullLater(progress: UploadProgress, full: Blob, sink: Pick<ProgressSink, "onProgress">, target: UploadTarget, name?: string): Promise<UploadProgress> {
  if (!progress.masterEntity) throw new Error("The full-size copy can only follow a saved picture.");
  const done: UploadProgress = { ...progress };
  const note = async () => {
    await sink.onProgress?.({ ...done });
  };
  if (!done.fullEntity) {
    try {
      done.fullEntity = await uploadPicture(full, `${name ?? "picture"}-full${ext(full)}`, target);
      await note();
    } catch (e) {
      console.warn("The full-size copy of the picture could not be saved; the picture is shown at the size that was saved.", e);
      return done;
    }
  }
  await linkToFull(done, note);
  return done;
}
