// IndexedDB seam for {@link SessionCredential}. Framework-free.
//
// A published app is a third-party page: it has no platform cookie, so the access token and the
// DPoP key would otherwise die with the page. This store keeps them on the app's own origin.
//
// What is stored, and what is not:
//   - one database, one object store, one key. The record is a {@link StoredSession}.
//   - the DPoP key is the CryptoKey OBJECTS. IndexedDB structured-clones them. The private key
//     stays non-extractable. Nothing here calls `exportKey`, or writes `localStorage`.
//   - `publicKeyId` is the public key's JWK `x` and `y` joined by `.`. The caller computes it
//     with `exportKey` before any transaction. An update compares that string and does not
//     export inside one. The session code re-reads the JWK when it adopts the record.
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
  /**
   * `x` + `.` + `y` of the public key's JWK. Computed with `exportKey` when the
   * record is built, outside any transaction. `restore` refuses a missing id, or
   * one that is not the stored public key's own `x.y`.
   */
  publicKeyId: string;
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
  /** Replaces the one record. A fresh sign-in may create it. */
  save(session: StoredSession): Promise<void>;
  /**
   * Writes `session` only when a record is already stored and its `publicKeyId`
   * equals `samePublicKeyId`, and that id is not empty. If the record is missing,
   * has no id, or holds another id, this writes nothing. The IndexedDB adapter
   * compares the strings and puts inside the same `get` success callback, so the
   * transaction is still active and a delete that commits first is not put back.
   */
  saveIfSameKey(session: StoredSession, samePublicKeyId: string): Promise<void>;
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

  async saveIfSameKey(session: StoredSession, samePublicKeyId: string): Promise<void> {
    const db = await this.connect();
    await putIfSamePublicKeyId(db, session, samePublicKeyId);
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

/**
 * One readwrite transaction: read the record, compare `publicKeyId` with
 * `samePublicKeyId`, and put only when both are that same non-empty string.
 *
 * The compare and the put run in the `get` callback with no await between them.
 * A transaction commits once control returns to the event loop with no request
 * in flight, so an export or any other promise here would let the put throw
 * TransactionInactiveError and drop the update.
 */
function putIfSamePublicKeyId(db: IDBDatabase, session: StoredSession, samePublicKeyId: string): Promise<void> {
  let tx: IDBTransaction;
  try {
    tx = readwrite(db);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error("IndexedDB transaction failed"));
  }
  const objectStore = tx.objectStore(SESSION_OBJECT_STORE);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) reject(err instanceof Error ? err : new Error("IndexedDB transaction failed"));
      else resolve();
    };
    tx.oncomplete = () => finish();
    tx.onabort = () => finish(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onerror = () => finish(tx.error ?? new Error("IndexedDB transaction failed"));

    const req = objectStore.get(SESSION_RECORD_KEY);
    req.onerror = () => finish(req.error ?? new Error("IndexedDB request failed"));
    req.onsuccess = () => {
      const existing = req.result as StoredSession | undefined;
      const storedId = existing?.publicKeyId;
      if (typeof storedId !== "string" || storedId.length === 0 || storedId !== samePublicKeyId) {
        // No put. Resolve here: a get-only transaction has nothing left in flight,
        // and the test double does not fire `oncomplete` unless a put or delete did.
        finish();
        return;
      }
      try {
        objectStore.put(session, SESSION_RECORD_KEY);
      } catch (err) {
        finish(err);
      }
    };
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
