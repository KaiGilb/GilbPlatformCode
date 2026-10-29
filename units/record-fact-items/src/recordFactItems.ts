/**
 * The one-key writer of a record's fact: the items AS STORED NOW are changed, written back as a merge PATCH of that
 * one key, CONDITIONAL on the read it was built from (`If-Match`); a 412 re-reads and re-applies (up to 3); one write
 * at a time per record. It is a general record-fact writer: a card link's remove and an employment edge's change both
 * use it.
 *
 * The condition is the one `holder-reference` gives (`conditionFromEtag`):
 *   - a strong tag is sent as it is;
 *   - the production edge's weak form of the platform's own tag (`W/"sha256:<64 hex>"`) sends the
 *     platform's tag under it;
 *   - a read with no ETag, or any other weak or malformed tag: "not known yet"
 *     ({@link RecordVersionUnknownError}), with NOTHING sent. An unconditional patch is never sent in its place.
 */
import { conditionFromEtag } from "@kaigilb/gilbplatformcode-holder-reference";
import { patchRecord, readRecord, RecordConflictError, type MergePatchValue } from "@kaigilb/gilbplatformcode-lws-records";

/** The stored items of a fact, in order (a scalar is a one-item list). */
export function storedFactItems(raw: unknown): unknown[] {
  if (raw == null || raw === "") return [];
  return Array.isArray(raw) ? [...raw] : [raw];
}

/** The items as the fact goes back: none → retract, one → scalar, several → array. */
export function factItemsToWire(items: readonly unknown[]): MergePatchValue {
  if (items.length === 0) return null;
  return (items.length === 1 ? items[0] : [...items]) as MergePatchValue;
}

/**
 * The record's read named no version this writer can condition a patch on (no ETag, or a weak tag that is
 * not the edge's form of the platform's own): "not known yet". Nothing was sent.
 */
export class RecordVersionUnknownError extends Error {
  readonly etag: string | null;
  constructor(etag: string | null, notChanged: string) {
    super(
      `The record's read named ${etag === null ? "no version (no ETag)" : `the version ${etag}, which is not the platform's own`}, so a change cannot be conditioned on it and ${notChanged}. Nothing was sent.`,
    );
    this.name = "RecordVersionUnknownError";
    this.etag = etag;
  }
}

const queues = new Map<string, Promise<unknown>>();
const MAX_TRIES = 3;

/**
 * Change one fact of the record. `change` is handed the items AS STORED NOW and returns the next list;
 * when it returns the same items nothing is written. Resolves with the list as written. `notChanged` ends
 * the sentence said when the record cannot be read or its version is not known ("…, so <notChanged>").
 */
export function changeRecordFactItems(
  recordId: string,
  recordEntityUri: string | null,
  factKey: string,
  change: (stored: readonly unknown[]) => unknown[],
  notChanged: string,
): Promise<unknown[]> {
  const key = factKey.replace(/^a:/, "");
  const job = async (): Promise<unknown[]> => {
    for (let attempt = 1; ; attempt++) {
      const fresh = await readRecord(recordId, recordEntityUri);
      if (!fresh) throw new Error(`The person's record could not be read, so ${notChanged}.`);
      const stored = storedFactItems(fresh.served ? fresh.served.facts[key] : undefined);
      const next = change(stored);
      if (JSON.stringify(next) === JSON.stringify(stored)) return stored;
      const served = fresh.etag ?? null;
      const ifMatch = served === null ? null : conditionFromEtag(served);
      if (!ifMatch) throw new RecordVersionUnknownError(served, notChanged);
      try {
        await patchRecord(recordId, { [key]: factItemsToWire(next) }, recordEntityUri, undefined, { ifMatch });
        return next;
      } catch (e) {
        if (!(e instanceof RecordConflictError) || attempt >= MAX_TRIES) throw e;
      }
    }
  };
  const run = (queues.get(recordId) ?? Promise.resolve()).then(job, job);
  queues.set(
    recordId,
    run.catch(() => undefined),
  );
  return run;
}
