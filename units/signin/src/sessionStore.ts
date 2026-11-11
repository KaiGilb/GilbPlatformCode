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
//     with `exportKey` before any transaction. An update compares that string and, when the
//     tab holds a renewal, the family id and the server's `renewExpiresAt` as a number. The
//     family id and the stored ISO time are parsed in the `get` callback. Nothing awaits
//     inside the transaction. The session code re-reads the JWK when it adopts the record.
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
  /** Empty when a 401 dropped the token and the key was kept. Not a session `restore` adopts, unless `renew` is still in date: then `restore` renews. */
  accessToken: string;
  /** Epoch milliseconds. `0` when the token was dropped. */
  expiresAt: number;
  session: GilbSession;
  /**
   * Renewal credential (`rsi1.<familyId>.<secret>`). Optional. A record without it
   * cannot be renewed. The server accepts the immediately previous credential once,
   * inside 60 seconds. Anything else ends the sign-in.
   */
  renew?: string;
  /** ISO-8601 expiry of {@link renew}. Optional, and absent when `renew` is absent. */
  renewExpiresAt?: string;
  /**
   * Sign-in origin the renewal is posted to, with no trailing slash. Optional.
   * A `renew` value with no origin cannot be renewed: the client will not guess a host.
   */
  origin?: string;
  /**
   * Epoch milliseconds of the renew attempt for this credential that may have reached
   * the server. A reload inside the retry window retries once. After that window one
   * last try may present it again. A lost last try replaces this with the new attempt.
   */
  renewAttemptAt?: number;
  /**
   * The grace retry for this attempt has been handed to the transport. A load inside
   * the retry window must not present the credential again. After the window, one
   * last try may. A lost last try clears this so the next try is a grace retry.
   */
  renewGraceUsed?: boolean;
}

/**
 * The record a tab may still change on its own behalf.
 *
 * `publicKeyId` is always compared, and it must be a non-empty string. A different
 * key is another sign-in. A missing record is not current.
 *
 * When `renewExpiresAt` is a finite number, that number is this tab's credential
 * time (epoch milliseconds). The time orders credentials only inside one family.
 * The stored record may be written or cleared when it holds exactly `renew`
 * (the same credential: a mark, or a dropped access token), or when it is the
 * same family and its `renewExpiresAt` is strictly earlier. A later time is left
 * alone. An equal time with a different credential of that family is left alone.
 * Another family is left alone. A stored credential with no parsable family id
 * is left alone. The compare is numeric. The stored ISO string and the stored
 * family are parsed here, and this function does not await.
 *
 * `family` is that id, parsed once by {@link familyOf} before the transaction.
 * When `family` is omitted, the id is `familyOf(renew)` so the same helper still
 * decides. The order uses the server's times only.
 *
 * When `renewExpiresAt` is absent, the record has no renewal order. `renew`, when
 * present, must be the stored credential (`null` or `""` means none). `accessToken`,
 * when present, must be the stored access token.
 *
 * `allowAbsent` is the one case where a missing record may be written. A tab sets
 * it only to put its own record back after an empty store that was not this
 * family's sign-out. A record that is present is still decided by the family and
 * the time order. A missing `publicKeyId` is never a write.
 */
export interface CurrentRecordExpect {
  publicKeyId: string;
  renew?: string | null;
  /** Family id of `renew`. Null when `renew` has no parsable family. */
  family?: string | null;
  renewExpiresAt?: number;
  accessToken?: string;
  /**
   * Write when the store has no record. A present record is still compared.
   * Set only for the re-save after an empty store that was not this family's.
   */
  allowAbsent?: boolean;
}

/** Epoch milliseconds of a `renewExpiresAt` value, or null when it is not a time. */
export function renewExpiresAtMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Family id of a renewal credential, or null when `renew` is not
 * `rsi1.<familyId>.<secret>`. The id is the middle segment. An empty segment
 * is not an id. This is the only parse. It does not await, so the IndexedDB
 * `get` callback can call it.
 */
export function familyOf(renew: unknown): string | null {
  if (typeof renew !== "string") return null;
  const first = renew.indexOf(".");
  if (first !== 4 || renew.slice(0, 4) !== "rsi1") return null;
  const second = renew.indexOf(".", first + 1);
  if (second <= first + 1 || second >= renew.length - 1) return null;
  return renew.slice(first + 1, second);
}

/** The family the time order applies to. `family` on the expect wins; otherwise {@link familyOf}. */
function expectFamily(expect: CurrentRecordExpect): string | null {
  if ("family" in expect) return typeof expect.family === "string" && expect.family.length > 0 ? expect.family : null;
  return familyOf(expect.renew);
}

function renewSecret(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "";
}

/**
 * True when `existing` is a record this tab may still change.
 * A missing record is not current, unless `expect.allowAbsent` is set and
 * `publicKeyId` is a non-empty string: that write fills an empty store and
 * still refuses a record that is present and is not this family. Callers can
 * run this inside one IndexedDB `get` callback: it does not await.
 */
export function recordIsCurrent(existing: unknown, expect: CurrentRecordExpect): boolean {
  if (existing == null) {
    return expect.allowAbsent === true
      && typeof expect.publicKeyId === "string"
      && expect.publicKeyId.length > 0;
  }
  if (typeof existing !== "object") return false;
  if (typeof expect.publicKeyId !== "string" || expect.publicKeyId.length === 0) return false;
  const record = existing as Partial<StoredSession>;
  if (record.publicKeyId !== expect.publicKeyId) return false;
  if (typeof expect.renewExpiresAt === "number" && Number.isFinite(expect.renewExpiresAt)) {
    const want = renewSecret(expect.renew);
    const have = renewSecret(record.renew);
    if (want.length > 0 && have === want) return true;
    const storedFamily = familyOf(record.renew);
    const wantFamily = expectFamily(expect);
    if (storedFamily === null || wantFamily === null || storedFamily !== wantFamily) return false;
    const storedAt = renewExpiresAtMs(record.renewExpiresAt);
    if (storedAt === null) return false;
    return storedAt < expect.renewExpiresAt;
  }
  if ("renew" in expect) {
    const have = renewSecret(record.renew);
    const want = renewSecret(expect.renew);
    if ((have.length > 0 ? have : null) !== (want.length > 0 ? want : null)) return false;
  }
  if ("accessToken" in expect && record.accessToken !== expect.accessToken) return false;
  return true;
}

/**
 * The identity of a stored record, for a later conditional clear.
 * Null when the value has no `publicKeyId` to compare.
 * A renewal credential carries its `renewExpiresAt` when that time parses,
 * so a later credential is not cleared and an earlier one can be.
 * With no renewal credential, the access token is the match.
 */
export function expectOfStored(raw: unknown): CurrentRecordExpect | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<StoredSession>;
  if (typeof record.publicKeyId !== "string" || record.publicKeyId.length === 0) return null;
  if (typeof record.renew === "string" && record.renew.length > 0) {
    const family = familyOf(record.renew);
    const at = renewExpiresAtMs(record.renewExpiresAt);
    if (at === null) return { publicKeyId: record.publicKeyId, renew: record.renew, family };
    return { publicKeyId: record.publicKeyId, renew: record.renew, renewExpiresAt: at, family };
  }
  return {
    publicKeyId: record.publicKeyId,
    renew: null,
    accessToken: typeof record.accessToken === "string" ? record.accessToken : "",
  };
}

/** The persistence seam. A throwing method is a storage failure, not a failed sign-in. */
export interface SessionStore {
  /** The current record, or null when nothing is stored. */
  load(): Promise<StoredSession | null>;
  /** Replaces the one record. A fresh sign-in may create it. */
  save(session: StoredSession): Promise<void>;
  /**
   * Writes `session` only when the stored record is still {@link recordIsCurrent}
   * for `expect`. A missing record writes nothing, unless `expect.allowAbsent`
   * is set. Another key, another family, a credential with no family id, a
   * later `renewExpiresAt`, or an equal time with a different credential writes
   * nothing and resolves `false`.
   * `true` means the put was made. The IndexedDB adapter compares and puts inside
   * the same `get` success callback, so the transaction is still active and a
   * delete that commits first is not put back.
   */
  saveIfCurrent(session: StoredSession, expect: CurrentRecordExpect): Promise<boolean>;
  /**
   * Deletes the one record only when it is still {@link recordIsCurrent} for
   * `expect`. Another key, another family, a credential with no family id, a
   * later `renewExpiresAt`, or an equal time with a different credential is
   * left in place and this resolves `false`. `true`
   * means the delete was made. The IndexedDB adapter compares and deletes
   * inside the same `get` success callback.
   */
  clearIfCurrent(expect: CurrentRecordExpect): Promise<boolean>;
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

  async saveIfCurrent(session: StoredSession, expect: CurrentRecordExpect): Promise<boolean> {
    const db = await this.connect();
    return mutateIfCurrent(db, expect, (objectStore) => {
      objectStore.put(session, SESSION_RECORD_KEY);
    });
  }

  async clearIfCurrent(expect: CurrentRecordExpect): Promise<boolean> {
    const db = await this.connect();
    return mutateIfCurrent(db, expect, (objectStore) => {
      objectStore.delete(SESSION_RECORD_KEY);
    });
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
 * One readwrite transaction: read the record, compare every field on `expect`,
 * and put or delete only when the stored record is still that one.
 *
 * The compare and the mutation run in the `get` callback with no await between
 * them. A transaction commits once control returns to the event loop with no
 * request in flight, so an export or any other promise here would let the
 * mutation throw TransactionInactiveError and drop the update.
 */
function mutateIfCurrent(
  db: IDBDatabase,
  expect: CurrentRecordExpect,
  mutate: (objectStore: IDBObjectStore) => void,
): Promise<boolean> {
  let tx: IDBTransaction;
  try {
    tx = readwrite(db);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error("IndexedDB transaction failed"));
  }
  const objectStore = tx.objectStore(SESSION_OBJECT_STORE);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: unknown, wrote = false) => {
      if (settled) return;
      settled = true;
      if (err) reject(err instanceof Error ? err : new Error("IndexedDB transaction failed"));
      else resolve(wrote);
    };
    tx.oncomplete = () => finish(undefined, true);
    tx.onabort = () => finish(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onerror = () => finish(tx.error ?? new Error("IndexedDB transaction failed"));

    const req = objectStore.get(SESSION_RECORD_KEY);
    req.onerror = () => finish(req.error ?? new Error("IndexedDB request failed"));
    req.onsuccess = () => {
      if (!recordIsCurrent(req.result, expect)) {
        // No mutation. Resolve false here: a get-only transaction has nothing
        // left in flight, and the test double does not fire `oncomplete` unless
        // a put or delete did.
        finish(undefined, false);
        return;
      }
      try {
        mutate(objectStore);
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
