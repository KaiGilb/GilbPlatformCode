// A copy of the app's record writer (src/lib/base/recordSidecarSave.ts lines 17-110), used by the tests as the host's `saveRecordSidecar` and
// `noteServedVersion`: one versioned, serial save per record, with If-Match and a re-read and resend after a 412. The calls it makes are the
// fake `patchRecord` and `readRecord` of ./records, so the tests read what the section sent.
import { patchRecord, readRecord, RecordConflictError, type BaseRecord, type MergePatchValue } from "./records";

interface RecordSaveState {
  tail: Promise<void>;
  /** Saves queued or in flight. */
  pending: number;
  etag: string | null;
  meta: unknown;
  /** The ETag of the last card read noted, so a stale re-render is not taken as news. */
  servedEtag: string | null | undefined;
  /** The sidecar of the last card read noted (serialised): with {@link servedEtag}, what makes a read news. */
  servedMeta: string | undefined;
}

const states = new Map<string, RecordSaveState>();

function stateOf(recordId: string): RecordSaveState {
  let st = states.get(recordId);
  if (!st) {
    st = { tail: Promise.resolve(), pending: 0, etag: null, meta: undefined, servedEtag: undefined, servedMeta: undefined };
    states.set(recordId, st);
  }
  return st;
}

/** The sidecar as stored after a merge patch: an entry sent as null is gone. */
function withoutNulls(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) if (v !== null) out[k] = v;
  return out;
}

/** A card read of the record: its version and stored sidecar (see the header for when it is taken). */
export function noteServedVersion(recordId: string, etag: string | null, meta: unknown): void {
  const st = stateOf(recordId);
  if (st.pending > 0) return;
  // F15 (Agent.Scaling it5): a read is news when its version OR its sidecar differs from the last
  // read noted. A door that serves no ETag answers `null` every time; keyed on the ETag alone, only
  // the first read was ever taken and a save built on a stale sidecar. A re-render carrying the same
  // read (same version, same sidecar) is still not news, so it never rolls a save's version back.
  const metaSig = JSON.stringify(meta ?? null);
  if (st.servedEtag !== undefined && st.servedEtag === etag && st.servedMeta === metaSig) return;
  st.servedEtag = etag;
  st.servedMeta = metaSig;
  st.etag = etag;
  st.meta = meta;
}

/** The record's latest version and stored sidecar as this module holds them (tests and diagnostics). */
export function heldVersion(recordId: string): { etag: string | null; meta: unknown } {
  const st = stateOf(recordId);
  return { etag: st.etag, meta: st.meta };
}

/**
 * Queue one save of a section. `build` makes the patch from the sidecar as stored now (called again
 * for the resend after a 412). `rebase` gets the fresh record after a 412, before the resend.
 */
export function saveRecordSidecar(
  recordId: string,
  recordEntityUri: string | null,
  metaKey: string,
  build: (storedMeta: unknown) => { patch: Record<string, MergePatchValue>; meta: Record<string, unknown> },
  rebase: (fresh: BaseRecord) => void,
): Promise<void> {
  const st = stateOf(recordId);
  st.pending++;
  const job = async () => {
    const send = async () => {
      const b = build(st.meta);
      const { etag } = await patchRecord(recordId, b.patch, recordEntityUri, undefined, { ifMatch: st.etag });
      st.meta = withoutNulls(b.meta);
      st.etag = etag;
    };
    try {
      await send();
    } catch (e) {
      if (!(e instanceof RecordConflictError)) throw e;
      const fresh = await readRecord(recordId, recordEntityUri);
      if (!fresh) throw e;
      st.meta = fresh.served?.facts[metaKey];
      st.etag = fresh.etag ?? null;
      rebase(fresh);
      await send();
    }
  };
  const run = st.tail.then(job);
  st.tail = run.catch(() => undefined);
  void run.then(
    () => st.pending--,
    () => st.pending--,
  );
  return run;
}
