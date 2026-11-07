// The on-device queue of unsent work: every add, edit and delete is written here first and removed once the vault has it.
// Raw IndexedDB (store `pending`, database name set at start-up), behind a tiny storage interface so tests use an in-memory one.

export type PendingOp<T = unknown> = {
  id: string;
  kind: "create" | "update" | "delete";
  recordId?: string;
  etag?: string | null;
  /** The record as it was when the edit or delete began (what the host's update and delete need). */
  record?: T;
  change: Record<string, unknown>;
  pictureBlob?: Blob;
  thumbBlob?: Blob;
  /** Upload steps already done, so a retry never sends the same picture twice. */
  masterEntity?: string;
  thumbEntity?: string;
  thumbLinked?: boolean;
  /** The full-size copy waiting to be sent, and the steps already done for it. */
  fullBlob?: Blob;
  fullEntity?: string;
  fullLinked?: boolean;
  masterLinked?: boolean;
  thumbRelinked?: boolean;
  /** ISO. For a create this is also the record's made-date, which is how a resend finds its own earlier success. */
  createdAt: string;
  tries: number;
  /** Who was signed in when this was written. Only that person's session sends it or sees it. */
  principal: string;
  /** Failures where the vault answered 502/503/504 (busy or unreachable). Too many of them make the op "stuck". */
  busyFails?: number;
  /** The last busy sentence, shown only when the op turns stuck. */
  busySentence?: string;
  /** Failures that were neither network nor refusal. Five of them make the op "stuck". */
  otherFails?: number;
  /** Set once the op is stuck: the sentence the card shows. Cleared by "Try again". */
  stuckSentence?: string;
};

export const MAX_OTHER_FAILS = 5;
/** Busy answers (502/503/504) retried before the card says "Could not save". Delays: 2 s, 5 s, 15 s, then 30 s. */
export const MAX_BUSY_FAILS = 8;
export const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

export interface QueueStore {
  getAll(): Promise<PendingOp[]>;
  put(op: PendingOp): Promise<void>;
  remove(id: string): Promise<void>;
}

/** In-memory store: the fallback where IndexedDB is missing, and the test double. */
export function memoryStore(): QueueStore {
  const map = new Map<string, PendingOp>();
  return {
    async getAll() {
      return [...map.values()];
    },
    async put(op) {
      map.set(op.id, op);
    },
    async remove(id) {
      map.delete(id);
    },
  };
}

let dbName: string | null = null;
/** The IndexedDB database name. Set once at start-up, before the first queue call. An app that already has queued rows keeps its old name, or those rows are stranded. */
export function setQueueDbName(name: string): void {
  dbName = name;
}
function queueDbName(): string {
  if (!dbName) throw new Error("save-queue: call setQueueDbName(<name>) at start-up before the queue is used.");
  return dbName;
}
const STORE = "pending";

const asPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** The thin IndexedDB adapter. */
export function idbStore(): QueueStore {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(queueDbName(), 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    async getAll() {
      return (await asPromise((await store("readonly")).getAll())) as PendingOp[];
    },
    async put(op) {
      await asPromise((await store("readwrite")).put(op));
    },
    async remove(id) {
      await asPromise((await store("readwrite")).delete(id));
    },
  };
}

let current: QueueStore | null = null;

/** The store in use: IndexedDB when the browser has it, else memory. */
export function queueStore(): QueueStore {
  return (current ??= typeof indexedDB !== "undefined" ? idbStore() : memoryStore());
}
/** Tests (and nothing else) swap the store. */
export function setQueueStore(s: QueueStore | null): void {
  current = s;
}

export const newOpId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** A store that never answers (a locked or blocked database) must not hold the app: after this long the call gives up and the work goes on unqueued. */
const STORE_PATIENCE_MS = 1500;
function patiently<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("The on-device queue did not answer in time.")), STORE_PATIENCE_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Every pending op, oldest first. A store that fails to read answers an empty queue (the app still works, unqueued). */
export async function listOps(): Promise<PendingOp[]> {
  try {
    return (await patiently(queueStore().getAll())).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  } catch (e) {
    console.warn("The on-device queue could not be read.", e);
    return [];
  }
}
/** Writes (or rewrites) an op. A store failure is logged and the send goes on without the safety net. */
export async function saveOp(op: PendingOp): Promise<void> {
  try {
    await patiently(queueStore().put(op));
  } catch (e) {
    console.warn("The on-device queue could not be written.", e);
  }
}
export async function dropOp(id: string): Promise<void> {
  try {
    await patiently(queueStore().remove(id));
  } catch (e) {
    console.warn("The on-device queue could not be updated.", e);
  }
}
