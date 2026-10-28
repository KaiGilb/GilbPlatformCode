// @vitest-environment node
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The store opens at version 3. A browser that already holds an older version is upgraded in place;
// one that holds a newer version cannot be opened, and the unit falls back to its in-memory copy.

const NAME = "baseapp-workingset";

function make(version: number, build: (db: IDBDatabase, tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, version);
    req.onupgradeneeded = () => build(req.result, req.transaction!);
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

function fresh() {
  vi.resetModules();
  return import("./workingSet");
}

function indexNames(storeName: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME);
    req.onsuccess = () => {
      const db = req.result;
      const names = [...db.transaction(storeName, "readonly").objectStore(storeName).indexNames].sort();
      db.close();
      resolve(names);
    };
    req.onerror = () => reject(req.error);
  });
}

// A fresh IndexedDB for each test: the unit never closes its connection, so an old one would block the next upgrade.
beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
});

describe("opening an older store", () => {
  it("version 2 (files indexed by record only): the files stay and gain the vault index", async () => {
    await make(2, (db, tx) => {
      db.createObjectStore("records", { keyPath: "id" }).createIndex("podId", "podId", { unique: false });
      const files = db.createObjectStore("files", { keyPath: "id" });
      files.createIndex("recordId", "recordId", { unique: false });
      files.put({ id: "f1", recordId: "rec1", vaultId: "vA", name: "n", mediaType: "m", byteSize: 1, updatedAt: 1 });
      void tx;
    });
    const ws = await fresh();
    expect((await ws.listFileRefs("rec1")).map((f) => f.id)).toEqual(["f1"]);
    expect(await indexNames("files")).toEqual(["podId", "recordId"]);
  });

  it("version 1 (records only): the files store is made", async () => {
    await make(1, (db) => {
      db.createObjectStore("records", { keyPath: "id" }).createIndex("podId", "podId", { unique: false });
    });
    const ws = await fresh();
    await ws.rememberFile({ id: "f1", recordId: "rec1", vaultId: "vA", name: "n", mediaType: "m", byteSize: 1, updatedAt: 1 });
    expect((await ws.listFileRefs("rec1")).map((f) => f.id)).toEqual(["f1"]);
    expect(await indexNames("files")).toEqual(["podId", "recordId"]);
  });
});

describe("a store that is newer than this unit", () => {
  it("cannot be opened, so the unit keeps the records and files in memory", async () => {
    await make(4, (db) => {
      db.createObjectStore("records", { keyPath: "id" });
    });
    const ws = await fresh();
    await ws.rememberRecord({ id: "r1", vaultId: "vA", typeUri: "t", updatedAt: 1 });
    await ws.rememberFile({ id: "f1", recordId: "rec1", vaultId: "vA", name: "n", mediaType: "m", byteSize: 1, updatedAt: 1 });
    expect((await ws.listRecordRefs("vA")).map((r) => r.id)).toEqual(["r1"]);
    expect((await ws.listFileRefs("rec1")).map((f) => f.id)).toEqual(["f1"]);
  });
});
