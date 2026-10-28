// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  forgetFile,
  forgetRecord,
  listFileRefs,
  listRecordRefs,
  listStandaloneFiles,
  purgeWorkingSet,
  rememberFile,
  rememberRecord,
  type FileRef,
} from "./workingSet";

// The IndexedDB path, on an in-memory implementation of IndexedDB (fake-indexeddb). It pins the store
// the unit shares with any other copy on the same browser origin, and the three reads as they behave
// when IndexedDB is present, including the two that answer empty (see the README, "Wrong readings").

function fileRef(id: string, updatedAt: number, recordId?: string): FileRef {
  return { id, vaultId: "vA", ...(recordId === undefined ? {} : { recordId }), name: `${id}.txt`, mediaType: "text/plain", byteSize: 1, updatedAt };
}

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("baseapp-workingset");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  await purgeWorkingSet();
});
afterEach(async () => {
  await purgeWorkingSet();
});

describe("the store", () => {
  it("is the database baseapp-workingset at version 3, with the stores records and files and their indexes", async () => {
    await rememberRecord({ id: "r1", vaultId: "vA", typeUri: "t", updatedAt: 1 });
    const db = await openRaw();
    try {
      expect(db.name).toBe("baseapp-workingset");
      expect(db.version).toBe(3);
      expect([...db.objectStoreNames].sort()).toEqual(["files", "records"]);
      const tx = db.transaction(["records", "files"], "readonly");
      expect(tx.objectStore("records").keyPath).toBe("id");
      expect([...tx.objectStore("records").indexNames]).toEqual(["podId"]);
      expect(tx.objectStore("files").keyPath).toBe("id");
      expect([...tx.objectStore("files").indexNames].sort()).toEqual(["podId", "recordId"]);
    } finally {
      db.close();
    }
  });

  it("holds the record under its id, as it was given", async () => {
    const r = { id: "r1", vaultId: "vA", typeUri: "t", updatedAt: 1 };
    await rememberRecord(r);
    const db = await openRaw();
    try {
      const got = await new Promise((resolve) => {
        const req = db.transaction("records", "readonly").objectStore("records").get("r1");
        req.onsuccess = () => resolve(req.result);
      });
      expect(got).toEqual(r);
    } finally {
      db.close();
    }
  });
});

describe("the reads with IndexedDB present", () => {
  it("listFileRefs lists a record's files from the store, most recent first", async () => {
    await rememberFile(fileRef("f1", 100, "rec1"));
    await rememberFile(fileRef("f2", 300, "rec1"));
    await rememberFile(fileRef("f3", 200, "rec2"));
    expect((await listFileRefs("rec1")).map((f) => f.id)).toEqual(["f2", "f1"]);
    expect((await listFileRefs("rec2")).map((f) => f.id)).toEqual(["f3"]);
  });

  it("forgetFile removes the file from the store", async () => {
    await rememberFile(fileRef("f1", 1, "rec1"));
    await rememberFile(fileRef("f2", 2, "rec1"));
    await forgetFile("f1");
    expect((await listFileRefs("rec1")).map((f) => f.id)).toEqual(["f2"]);
  });

  it("purgeWorkingSet empties the files store", async () => {
    await rememberFile(fileRef("f1", 1, "rec1"));
    await purgeWorkingSet();
    expect(await listFileRefs("rec1")).toEqual([]);
  });

  // Production quirk, kept: the store indexes `podId`, the refs carry `vaultId`, so the index holds no
  // row and the vault-scoped reads answer empty although the ref was remembered.
  it("listRecordRefs answers empty for a vault even after records were remembered in it", async () => {
    await rememberRecord({ id: "r1", vaultId: "vA", typeUri: "t", updatedAt: 1 });
    await rememberRecord({ id: "r2", vaultId: "vA", typeUri: "t", updatedAt: 2 });
    expect(await listRecordRefs("vA")).toEqual([]);
  });

  it("listStandaloneFiles answers empty for a vault even after standalone files were remembered in it", async () => {
    await rememberFile(fileRef("s1", 1));
    expect(await listStandaloneFiles("vA")).toEqual([]);
  });

  it("forgetRecord removes the record from the store without error", async () => {
    await rememberRecord({ id: "r1", vaultId: "vA", typeUri: "t", updatedAt: 1 });
    await forgetRecord("r1");
    const db = await openRaw();
    try {
      const n = await new Promise((resolve) => {
        const req = db.transaction("records", "readonly").objectStore("records").count();
        req.onsuccess = () => resolve(req.result);
      });
      expect(n).toBe(0);
    } finally {
      db.close();
    }
  });
});
