// The working-set replica (4Sol.S.Arch.WorkingSetReplicaCache).
//
// A TRANSIENT, NON-AUTHORITATIVE, device-local id-index of the records this browser has
// touched on a vault. It exists ONLY because Base exposes no Bearer-floor "list every
// record of type X" primitive yet (a later server route) —
// so to re-open the grid after reload we remember the minted ids here and re-hydrate each
// record's CONTENT from the vault (`GET /lws/r/:id`), which stays the single source of
// truth. §30 / BASEAPP_02 / BASEAPP_07 clean: this stores NO record data — only opaque
// ids + the type/updatedAt needed to render a placeholder row — and it is fully
// rebuildable from the vault the moment a list primitive exists (never a second source of
// truth). The actual per-record state always round-trips to the vault.
//
// Storage: IndexedDB when present; a same-session in-memory Map fallback otherwise (tests
// / private-mode). Every op degrades silently — a replica miss just means an empty grid
// that repopulates as the user acts; it never blocks a vault write or surfaces an error.

/** One remembered record — an id pointer + the minimum to draw a row before hydrate. */
export interface WorkingSetRef {
  /** The LWS/Base id (`/lws/r/<id>`). */
  id: string;
  /** The vault the record lives in (the working set is scoped per vault). */
  vaultId: string;
  /** The absolute BaseVeda Type URI — lets the grid group/icon before the GET resolves. */
  typeUri: string;
  /** Epoch ms of the last local touch — the grid's default "recent-first" order. */
  updatedAt: number;
}

/** One remembered file — the SAME transient-mirror rationale as WorkingSetRef: a file's
 * LIST membership needs a reverse lookup (files WHERE storedWith=record, or files WHERE
 * vault=X and unattached), which is on the DPoP-only `/base/*` surface BaseApp can't reach
 * yet, so we remember it here at upload time. Stores NO bytes — only the file id (the
 * `/files/<id>` handle) + the display metadata to draw a row; the bytes always round-trip
 * to the vault on download. Fully rebuildable from the vault's `a:fileStoredWith` (or its
 * absence) the moment a Bearer-floor reverse-lookup exists (never a second source of
 * truth). A file is EITHER attached to a record OR a standalone "registered" file — never
 * both — distinguished by whether `recordId` is set. */
export interface FileRef {
  /** The file ENTITY id — the handle for `GET`/`DELETE /files/<id>`. */
  id: string;
  /** The record this file is attached to (its LWS id) — the reverse-lookup key for a
   * record's Attachments list. ABSENT for a standalone/registered file (the central-view
   * "file register" — a first-class item, not tied to any note/contact/task). */
  recordId?: string;
  /** The vault the file lives in (scoped per vault, like records) — the reverse-lookup key
   * for the vault-wide "file register" list (both attached and standalone files carry it). */
  vaultId: string;
  /** The stored file name. */
  name: string;
  /** The stored media type. */
  mediaType: string;
  /** The committed byte size (for the row's at-a-glance size). */
  byteSize: number;
  /** Epoch ms of the last local touch — list order (recent-first). */
  updatedAt: number;
}

const DB_NAME = "baseapp-workingset";
const STORE = "records";
const FILE_STORE = "files";
// v3 adds a `podId` index on the v2 `files` store (list every file in a vault — the file
// register — alongside the existing `recordId` index (a record's own Attachments list).
const DB_VERSION = 3;

/** The in-memory fallback (used when IndexedDB is unavailable — tests / private mode). */
const memory = new Map<string, WorkingSetRef>();
/** The in-memory fallback for file links. */
const fileMemory = new Map<string, FileRef>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Opens (and upgrades) the working-set DB once; resolves null if IndexedDB is absent or
 * the open fails (→ the caller uses the in-memory fallback). */
function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("podId", "podId", { unique: false });
        }
        // v2: the file store, indexed by the record it hangs off (a record's Attachments).
        let files: IDBObjectStore;
        if (!db.objectStoreNames.contains(FILE_STORE)) {
          files = db.createObjectStore(FILE_STORE, { keyPath: "id" });
          files.createIndex("recordId", "recordId", { unique: false });
        } else {
          // Upgrading an existing DB — reach the store via the upgrade transaction (indexes
          // can only be added inside a versionchange transaction).
          files = req.transaction!.objectStore(FILE_STORE);
        }
        // v3: a vaultId index too — lists EVERY file in a vault (attached AND standalone), the
        // reverse-lookup the vault-wide "file register" central view needs. `recordId` is
        // absent on a standalone FileRef, so it's simply skipped by the recordId index
        // (IndexedDB's standard behaviour for an undefined key path) — no migration needed
        // for existing attached-file rows; they just gain the new index for free.
        if (!files.indexNames.contains("podId")) {
          files.createIndex("podId", "podId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Runs `fn` in a transaction on `storeName` and resolves when it commits; resolves the
 * fallback value on any failure so a replica error never propagates to the UI. */
function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void,
  onDone: () => T,
  fallback: T,
): Promise<T> {
  return openDb().then((db) => {
    if (!db) return fallback;
    return new Promise<T>((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        fn(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(onDone());
        tx.onerror = () => resolve(fallback);
        tx.onabort = () => resolve(fallback);
      } catch {
        resolve(fallback);
      }
    });
  });
}

/** Remembers (or refreshes) a record ref in the working set. */
export async function rememberRecord(ref: WorkingSetRef): Promise<void> {
  memory.set(ref.id, ref);
  await withStore(STORE, "readwrite", (store) => store.put(ref), () => undefined, undefined);
}

/** Forgets a record ref (on delete). */
export async function forgetRecord(id: string): Promise<void> {
  memory.delete(id);
  await withStore(STORE, "readwrite", (store) => store.delete(id), () => undefined, undefined);
}

/** Lists the record refs remembered for a vault, most-recently-touched first. */
export async function listRecordRefs(vaultId: string): Promise<WorkingSetRef[]> {
  const fromMemory = () =>
    [...memory.values()].filter((r) => r.vaultId === vaultId).sort((a, b) => b.updatedAt - a.updatedAt);

  const db = await openDb();
  if (!db) return fromMemory();

  return new Promise<WorkingSetRef[]>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const index = tx.objectStore(STORE).index("podId");
      const req = index.getAll(IDBKeyRange.only(vaultId));
      req.onsuccess = () => {
        const rows = (req.result as WorkingSetRef[]).sort((a, b) => b.updatedAt - a.updatedAt);
        // Seed the in-memory mirror so same-session reads are instant + consistent.
        for (const r of rows) memory.set(r.id, r);
        resolve(rows);
      };
      req.onerror = () => resolve(fromMemory());
    } catch {
      resolve(fromMemory());
    }
  });
}

// ── file↔record links ──────────────────────────────────────────────────────────────────

/** Remembers (or refreshes) a file→record link. */
export async function rememberFile(ref: FileRef): Promise<void> {
  fileMemory.set(ref.id, ref);
  await withStore(FILE_STORE, "readwrite", (store) => store.put(ref), () => undefined, undefined);
}

/** Forgets a file link (on detach/delete). */
export async function forgetFile(id: string): Promise<void> {
  fileMemory.delete(id);
  await withStore(FILE_STORE, "readwrite", (store) => store.delete(id), () => undefined, undefined);
}

/** Lists the files attached to a record, most-recently-attached first. */
export async function listFileRefs(recordId: string): Promise<FileRef[]> {
  const fromMemory = () =>
    [...fileMemory.values()].filter((f) => f.recordId === recordId).sort((a, b) => b.updatedAt - a.updatedAt);

  const db = await openDb();
  if (!db) return fromMemory();

  return new Promise<FileRef[]>((resolve) => {
    try {
      const tx = db.transaction(FILE_STORE, "readonly");
      const index = tx.objectStore(FILE_STORE).index("recordId");
      const req = index.getAll(IDBKeyRange.only(recordId));
      req.onsuccess = () => {
        const rows = (req.result as FileRef[]).sort((a, b) => b.updatedAt - a.updatedAt);
        for (const r of rows) fileMemory.set(r.id, r); // seed the in-memory mirror
        resolve(rows);
      };
      req.onerror = () => resolve(fromMemory());
    } catch {
      resolve(fromMemory());
    }
  });
}

/** Lists a vault's STANDALONE (unattached) files, most-recently-registered first — the "file
 * register" central-view list. Attached files (recordId set) are excluded; they live in
 * their owning record's Attachments instead (listFileRefs). */
export async function listStandaloneFiles(vaultId: string): Promise<FileRef[]> {
  const standalone = (rows: FileRef[]) =>
    rows.filter((f) => f.recordId === undefined).sort((a, b) => b.updatedAt - a.updatedAt);
  const fromMemory = () => standalone([...fileMemory.values()].filter((f) => f.vaultId === vaultId));

  const db = await openDb();
  if (!db) return fromMemory();

  return new Promise<FileRef[]>((resolve) => {
    try {
      const tx = db.transaction(FILE_STORE, "readonly");
      const index = tx.objectStore(FILE_STORE).index("podId");
      const req = index.getAll(IDBKeyRange.only(vaultId));
      req.onsuccess = () => {
        const rows = req.result as FileRef[];
        for (const r of rows) fileMemory.set(r.id, r); // seed the in-memory mirror
        resolve(standalone(rows));
      };
      req.onerror = () => resolve(fromMemory());
    } catch {
      resolve(fromMemory());
    }
  });
}

/** Purges the whole working set — call on logout (security-at-rest; the vault is the home,
 * so nothing is lost). Clears BOTH the record refs and the file links. */
export async function purgeWorkingSet(): Promise<void> {
  memory.clear();
  fileMemory.clear();
  await withStore(STORE, "readwrite", (store) => store.clear(), () => undefined, undefined);
  await withStore(FILE_STORE, "readwrite", (store) => store.clear(), () => undefined, undefined);
}
