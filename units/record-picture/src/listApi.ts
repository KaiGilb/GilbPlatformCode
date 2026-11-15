// The picture half of a record list's four calls (create, update, remove), written once. It holds no fact name, type or field: the app
// passes the steps in. The shapes match optimistic-records' `useRecordList` (create(draft), update(item, draft), remove(item)); the load call
// (`list`) stays the app's own.
import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { addWithPicture, deleteWithPicture, PictureSaveError, removePicture, replacePicture, type PictureFlowDeps } from "./flow";
import type { RecordRef } from "./link";
import type { PictureChange, PreparedPicture } from "./types";

/** The record a list shows: its address and tag, the picture it holds, and a local preview while the stored copy is not shown. */
export type ListedRecord = RecordRef & { picture: string | null; previewUrl?: string };

/** An app's draft: its own fields, plus what the person did to the picture. */
export type PictureDraft<F> = F & { change?: PictureChange };

export interface RecordPictureListOptions<R extends ListedRecord, F> {
  /** The flow's steps (`vaultPictureFlowDeps`). `fresh` is true for a replace, remove or delete: list the vault's copies again first. */
  deps(fresh: boolean): Promise<PictureFlowDeps<R, F>>;
  /** The merge patch from the stored record to the edited fields; `{}` when nothing but the picture changed (no field PATCH is sent then). */
  patchOf(from: R, to: F): Record<string, never> | Parameters<typeof patchRecord>[1];
  /** The record as it is after the field PATCH took the tag `etag` (the app's own mapping: it knows which fields cleared). */
  afterPatch(item: R, fields: F, etag: string | null): R;
  /** The If-Match for the field PATCH and the delete; default `rec.etag` (null sends none). */
  ifMatch?(rec: R): string | null;
  /** Gets a sentence to show: a notice of the flow, or a picture step that failed after the record itself was saved. */
  onNotice(line: string): void;
  /** One sentence for a failed picture step (`lead` says what was being done); default: `lead` and the error's message. */
  failureLine?(lead: string, err: unknown): string;
  /** Takes charge of a local preview URL that now belongs to the list (e.g. `service.track`); default: as it is. */
  keepPreview?(url: string): string;
  /** Frees a preview URL of a picture that was not kept; default `URL.revokeObjectURL`. */
  revokePreview?(url: string): void;
  /** The words of the leads in `failureLine`. */
  words?: { addFailed?: string; changeFailed?: string };
  /** Replaces lws-records' `patchRecord` (for a test). */
  patch?: typeof patchRecord;
}

export interface RecordPictureListApi<R, D> {
  create(draft: D): Promise<R>;
  update(item: R, draft: D): Promise<R>;
  remove(item: R): Promise<void>;
}

/**
 * The create, update and remove calls of `useRecordList`, with the record's picture handled by record-picture's flow:
 * - create: add (record, then upload, then link). A record saved without its picture is kept in the list and a notice says why.
 * - update: the field PATCH with If-Match first (the new tag is kept), then replace or remove the picture from that tag. A failed picture
 *   step is a notice and the record as it stands, never a throw.
 * - remove: `deleteWithPicture` record-first with If-Match: if the record changed meanwhile the delete is refused (a 412 is thrown for the
 *   list to roll back) and the picture files are not touched.
 * `D` is the app's draft: its fields `F` and an optional `change` (a picture set or removed).
 */
export function recordPictureListApi<R extends ListedRecord, F, D extends PictureDraft<F> = PictureDraft<F>>(o: RecordPictureListOptions<R, F>): RecordPictureListApi<R, D> {
  const patch = o.patch ?? patchRecord;
  const tagOf = o.ifMatch ?? ((r: R) => r.etag);
  const revoke = o.revokePreview ?? ((u: string) => URL.revokeObjectURL(u));
  const keepUrl = o.keepPreview ?? ((u: string) => u);
  const line = o.failureLine ?? ((lead: string, e: unknown) => `${lead} ${e instanceof Error && e.message ? e.message : "Something went wrong."}`);
  const withoutChange = (d: D): F => {
    const { change: _change, ...fields } = d;
    return fields as unknown as F;
  };
  const shown = (rec: R, p: PreparedPicture): R => ({ ...rec, previewUrl: keepUrl(p.previewUrl) });

  return {
    async create(draft) {
      const prepared = draft.change?.kind === "set" ? draft.change.prepared : null;
      try {
        const r = await addWithPicture(await o.deps(false), withoutChange(draft), prepared);
        if (r.notice) o.onNotice(r.notice);
        return prepared ? shown(r.record, prepared) : r.record;
      } catch (e) {
        if (prepared) revoke(prepared.previewUrl);
        if (e instanceof PictureSaveError) {
          o.onNotice(line(o.words?.addFailed ?? "The record was saved, but its picture was not.", e));
          return e.record as R;
        }
        throw e;
      }
    },
    async update(item, draft) {
      const fields = withoutChange(draft);
      let cur = item;
      const changes = o.patchOf(item, fields);
      if (Object.keys(changes).length) {
        const { etag } = await patch(item.id, changes as Parameters<typeof patchRecord>[1], item.entity, undefined, { ifMatch: tagOf(item) });
        cur = o.afterPatch(item, fields, etag);
      }
      const change = draft.change;
      if (!change) return cur;
      try {
        const d = await o.deps(true);
        const r = change.kind === "set" ? await replacePicture(d, cur, change.prepared) : await removePicture(d, cur);
        if (r.notice) o.onNotice(r.notice);
        if (change.kind === "set") return shown(r.record, change.prepared);
        const { previewUrl: _gone, ...bare } = r.record; // no picture any more, so no local preview either
        return bare as R;
      } catch (e) {
        if (change.kind === "set") revoke(change.prepared.previewUrl);
        o.onNotice(line(o.words?.changeFailed ?? "The picture was not changed.", e));
        return cur;
      }
    },
    async remove(item) {
      const r = await deleteWithPicture(await o.deps(true), item, { order: "record-first", ifMatch: tagOf });
      if (r.notice) o.onNotice(r.notice);
    },
  };
}
