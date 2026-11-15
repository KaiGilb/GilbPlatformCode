// The picture flow's ORDER, with every network step injected, so it is tested without a network or a canvas:
//   add (record-first):  create the record -> upload -> link          (picture-first: upload -> create the record with the link)
//   replace:             upload new -> link -> end the old files
//   remove:              link null -> end the files
//   delete:              end the files -> delete the record
import type { PreparedPicture, UploadedPicture } from "./types";

/** Shown after the work succeeded when the old picture files could not be ended. */
export const FILES_NOT_REMOVED = "Picture files could not be removed.";

/** What a flow step answers: the record as it now is, and a sentence to show after the work succeeded (a storing warning, or FILES_NOT_REMOVED), else null. */
export interface FlowResult<R> {
  record: R;
  notice: string | null;
}

/** Every step an app passes in. This unit holds no state. */
export interface PictureFlowDeps<R, F> {
  /** The name of the record's picture fact; "picture-first" hands it to `createRecord` with the master. */
  fact: string;
  /** Creates the record. `picture` is given only by the "picture-first" order. */
  createRecord(form: F, picture?: { fact: string; master: string }): Promise<R>;
  upload(p: PreparedPicture): Promise<UploadedPicture>;
  /** Sets (master) or clears (null) the record's picture link; answers the record as the vault now holds it. */
  link(rec: R, master: string | null): Promise<R>;
  /** Ends a master and its copies; answers the addresses that could NOT be ended. */
  endFiles(master: string, copies: readonly string[]): Promise<string[]>;
  /** The stored copies of a master other than the master itself. */
  copiesOf(master: string): readonly string[];
  /** Deletes the record. The flow passes `o` only when `deleteWithPicture` was given an `ifMatch` that answered a tag; with none it calls `deleteRecord(rec)` as before. */
  deleteRecord(rec: R, o?: { ifMatch: string }): Promise<void>;
  /** The picture address the record holds, or null. */
  pictureOf(rec: R): string | null;
}

/** The record was saved but its picture was not: the host edits this record and lets the person try the picture again. `cause` is what failed. */
export class PictureSaveError<R> extends Error {
  readonly record: R;
  constructor(message: string, record: R, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PictureSaveError";
    this.record = record;
  }
}

const sentence = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

async function endQuietly(d: { endFiles: PictureFlowDeps<unknown, unknown>["endFiles"] }, master: string, copies: readonly string[]): Promise<boolean> {
  try {
    return (await d.endFiles(master, copies)).length === 0;
  } catch {
    return false;
  }
}

/** The new set's copies: its small copy when it has one. */
const newCopies = (u: UploadedPicture): readonly string[] => (u.thumb ? [u.thumb] : []);

/**
 * Adds a record with an optional picture.
 * "record-first" (default): create -> upload -> link. A failed upload keeps the saved record (PictureSaveError; nothing to end). A failed
 * link ends the new files, then PictureSaveError (`cause` = the link error).
 * "picture-first": upload -> create with the link. A failed create ends the new files and throws the create error unchanged.
 * With no picture it only creates.
 */
export async function addWithPicture<R, F>(
  d: PictureFlowDeps<R, F>,
  form: F,
  p: PreparedPicture | null,
  o: { order?: "record-first" | "picture-first" } = {},
): Promise<FlowResult<R>> {
  if (!p) return { record: await d.createRecord(form), notice: null };
  if (o.order === "picture-first") {
    const up = await d.upload(p);
    let record: R;
    try {
      record = await d.createRecord(form, { fact: d.fact, master: up.master });
    } catch (e) {
      await endQuietly(d, up.master, newCopies(up));
      throw e;
    }
    return { record, notice: up.warning };
  }
  const created = await d.createRecord(form);
  let up: UploadedPicture;
  try {
    up = await d.upload(p);
  } catch (e) {
    throw new PictureSaveError(`The record was saved, but its picture was not: ${sentence(e)}`, created, { cause: e });
  }
  try {
    return { record: await d.link(created, up.master), notice: up.warning };
  } catch (e) {
    await endQuietly(d, up.master, newCopies(up));
    throw new PictureSaveError(`The record was saved, but its picture was not: ${sentence(e)}`, created, { cause: e });
  }
}

/**
 * Replaces the record's picture: upload the new one, link it, and only AFTER the link succeeded end the old master and its copies. A failed
 * upload throws as it is and leaves the old picture. A failed link ends the NEW set, keeps the old one and throws PictureSaveError (`record` is
 * `rec`). Old files that cannot be ended are a notice (FILES_NOT_REMOVED), not an error.
 */
export async function replacePicture<R, F>(d: PictureFlowDeps<R, F>, rec: R, p: PreparedPicture): Promise<FlowResult<R>> {
  const old = d.pictureOf(rec);
  const oldCopies = old ? d.copiesOf(old) : [];
  const up = await d.upload(p);
  let linked: R;
  try {
    linked = await d.link(rec, up.master);
  } catch (e) {
    await endQuietly(d, up.master, newCopies(up));
    throw new PictureSaveError(`The picture was not changed: ${sentence(e)}`, rec, { cause: e });
  }
  let notice = up.warning;
  if (old && old !== up.master && !(await endQuietly(d, old, oldCopies))) notice = FILES_NOT_REMOVED;
  return { record: linked, notice };
}

/**
 * Removes the record's picture: link null, then end the old master and its copies (a failure to end is the notice FILES_NOT_REMOVED). A record
 * with no picture is answered as it is, with no call. A failed link throws as it is and ends nothing.
 */
export async function removePicture<R, F>(d: PictureFlowDeps<R, F>, rec: R): Promise<FlowResult<R>> {
  const old = d.pictureOf(rec);
  if (!old) return { record: rec, notice: null };
  const oldCopies = d.copiesOf(old);
  const linked = await d.link(rec, null);
  return { record: linked, notice: (await endQuietly(d, old, oldCopies)) ? null : FILES_NOT_REMOVED };
}

/** What `deleteWithPicture` may be told. */
export interface DeleteOptions<R> {
  /**
   * The version tag the delete must match (sent as If-Match), or a function that answers it from the record (null: none). Default: none, an
   * unconditional delete.
   */
  ifMatch?: string | ((rec: R) => string | null);
  /**
   * "files-first" (default): end the files, then delete the record, so a record that moved on still goes. "record-first": delete the record
   * (with If-Match when given) and only then end the files; a refused delete (a 412 included) throws before a file is touched.
   */
  order?: "files-first" | "record-first";
}

/**
 * Deletes the record and ends the picture's files.
 * "files-first" (default, as in 0.1.x): ends the files FIRST, then deletes the record, with no If-Match unless `o.ifMatch` gives one. Files that
 * cannot be ended give the notice FILES_NOT_REMOVED and the record is still deleted. A failure of `deleteRecord` is thrown.
 * "record-first": deletes the record FIRST (with `If-Match` when `o.ifMatch` gives a tag), then ends the files. A refused delete (a 412 because
 * the record changed, or any other error) is thrown as it is, and no file has been touched, so the record keeps its picture. Files that cannot
 * be ended after the record went give the notice FILES_NOT_REMOVED.
 */
export async function deleteWithPicture<R, F>(d: PictureFlowDeps<R, F>, rec: R, o: DeleteOptions<R> = {}): Promise<{ notice: string | null }> {
  const tag = typeof o.ifMatch === "function" ? o.ifMatch(rec) : (o.ifMatch ?? null);
  const del = () => (tag ? d.deleteRecord(rec, { ifMatch: tag }) : d.deleteRecord(rec));
  const old = d.pictureOf(rec);
  if (o.order === "record-first") {
    const copies = old ? d.copiesOf(old) : [];
    await del();
    return { notice: old && !(await endQuietly(d, old, copies)) ? FILES_NOT_REMOVED : null };
  }
  const notice = old && !(await endQuietly(d, old, d.copiesOf(old))) ? FILES_NOT_REMOVED : null;
  await del();
  return { notice };
}
