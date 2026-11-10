// IndexedDB seam for {@link SessionCredential}. Framework-free.
//
// A published app is a third-party page: it has no platform cookie, so the access token and the
// DPoP key would otherwise die with the page. This store keeps them on the app's own origin.
//
// What is stored, and what is not:
//   - one database, one object store, one key. The record is a {@link StoredSession}.
//   - the DPoP key is the CryptoKey OBJECTS. IndexedDB structured-clones them. The private key
//     stays non-extractable. Nothing here calls `exportKey` on it, or writes `localStorage`.
//   - the public key is stored the same way. It is public; the session code re-reads its JWK
//     with `exportKey` when it adopts the record.
//
// A later record shape bumps {@link STORED_SESSION_VERSION}. Readers refuse a version they do
// not know rather than guessing.
//
// Page close: IndexedDB commits a transaction asynchronously. `clear` starts the delete
// transaction before it yields when the database is already open, so a sign-out has a delete
// queued even if the caller never awaits. If the browser discards the document before that
// transaction commits, or a save transaction created after the delete commits later, the
// record can remain. That limit is the browser's, and it is called out on `invalidate(true)`.

import type { GilbSession } from "./session";

/** The record shape this unit writes. A reader refuses any other `version`. */
export const STORED_SESSION_VERSION = 1;

/** Database the default store opens. One per origin. */
export const SESSION_DB_NAME = "gilb-signin-session";

/** The one object store in {@link SESSION_DB_NAME}. */
export const SESSION_OBJECT_STORE = "session";

/** The one key in {@link SESSION_OBJECT_STORE}. A later save replaces it. */
export const SESSION_RECORD_KEY = "current";

const DB_VERSION = 1;

/**
 * A DPoP key and the access token it is bound to, as IndexedDB can hold them.
 * `keyPair` is the WebCrypto objects, not exported key material.
 */
export interface StoredSession {
  /** {@link STORED_SESSION_VERSION} for this shape. */
  version: number;
  /** Public and private CryptoKey. The private key is non-extractable. */
  keyPair: CryptoKeyPair;
  /** Empty when a 401 dropped the token and the key was kept. Not a session `restore` adopts. */
  accessToken: string;
  /** Epoch milliseconds. `0` when the token was dropped. */
  expiresAt: number;
  session: GilbSession;
}

/** The persistence seam. A throwing method is a storage failure, not a failed sign-in. */
export interface SessionStore {
  /** The current record, or null when nothing is stored. */
  load(): Promise<StoredSession | null>;
  /** Replaces the one record. */
  save(session: StoredSession): Promise<void>;
  /** Deletes the one record. Starts the delete before it needs to wait, when it can. */
  clear(): Promise<void>;
}

/**
 * A {@link SessionStore} on `globalThis.indexedDB`: one database, one object store, one key.
 * The database name is the argument (the default credential uses {@link SESSION_DB_NAME}).
 *
 * @param name the IndexedDB database name
 */
export function indexedDbSessionStore(name: string): SessionStore {
  return new IndexedDbSessionStore(name);
}

class IndexedDbSessionStore implements SessionStore {
  /** The open connection, once `open` has succeeded. Kept so a sign-out can delete in this turn. */
  private db: IDBDatabase | null = null;
  /** The in-flight open. Shared so a clear during the first save uses the same connection. */
  private opening: Promise<IDBDatabase> | null = null;

  constructor(private readonly name: string) {}

  async load(): Promise<StoredSession | null> {
    const db = await this.connect();
    const tx = db.transaction(SESSION_OBJECT_STORE, "readonly");
    const value = await requestResult<StoredSession | undefined>(tx.objectStore(SESSION_OBJECT_STORE).get(SESSION_RECORD_KEY));
    return value ?? null;
  }

  async save(session: StoredSession): Promise<void> {
    const db = await this.connect();
    const tx = readwrite(db);
    tx.objectStore(SESSION_OBJECT_STORE).put(session, SESSION_RECORD_KEY);
    await transactionDone(tx);
  }

  async clear(): Promise<void> {
    // Already open: create the delete transaction before the first wait, so a page
    // that unloads immediately still has the delete queued behind any open transaction.
    if (this.db) {
      await deleteRecord(this.db);
      return;
    }
    // An open is in flight (the first save). Queue the delete on that same connection
    // so it runs after the save's transaction, not on a second connection that races it.
    if (this.opening) {
      await deleteRecord(await this.opening);
      return;
    }
    const idb = indexedDb();
    if (!idb) throw new Error("IndexedDB is not available");
    // Nothing has opened the database. Creating it only to delete a record that
    // cannot be there is skipped when the browser can list databases.
    if (typeof idb.databases === "function") {
      const known = await idb.databases();
      if (!known.some((info) => info.name === this.name)) return;
    }
    await deleteRecord(await this.connect());
  }

  private connect(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    const pending = openDatabase(this.name).then((db) => {
      this.db = db;
      const drop = () => {
        if (this.db === db) this.db = null;
        if (this.opening === pending) this.opening = null;
      };
      db.onclose = drop;
      // Another page is upgrading. Close so its open is not blocked forever.
      db.onversionchange = () => {
        db.close();
        drop();
      };
      return db;
    }).catch((err: unknown) => {
      if (this.opening === pending) this.opening = null;
      throw err;
    });
    this.opening = pending;
    return pending;
  }
}

function indexedDb(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openDatabase(name: string): Promise<IDBDatabase> {
  const idb = indexedDb();
  if (!idb) return Promise.reject(new Error("IndexedDB is not available"));
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(name, DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("IndexedDB open failed"));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSION_OBJECT_STORE)) db.createObjectStore(SESSION_OBJECT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    // A hung open would stall sign-in, which awaits the save. Refuse instead.
    req.onblocked = () => reject(req.error ?? new Error("IndexedDB open blocked"));
  });
}

/** `strict` asks the browser to flush the commit. Engines that reject the argument get the default. */
function readwrite(db: IDBDatabase): IDBTransaction {
  try {
    return db.transaction(SESSION_OBJECT_STORE, "readwrite", { durability: "strict" });
  } catch {
    return db.transaction(SESSION_OBJECT_STORE, "readwrite");
  }
}

function deleteRecord(db: IDBDatabase): Promise<void> {
  const tx = readwrite(db);
  tx.objectStore(SESSION_OBJECT_STORE).delete(SESSION_RECORD_KEY);
  return transactionDone(tx);
}

function requestResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    tx.onabort = fail;
    tx.onerror = fail;
  });
}
