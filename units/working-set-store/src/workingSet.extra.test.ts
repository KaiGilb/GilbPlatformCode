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
  type WorkingSetRef,
} from "./workingSet";
import * as api from "./index";

// The in-memory path (no IndexedDB in this environment). Pins the exports the app's own tests leave
// out: listStandaloneFiles, and the rules of the file list that the record list tests do not reach.

function ref(id: string, vaultId: string, updatedAt: number): WorkingSetRef {
  return { id, vaultId, typeUri: "https://vault.example.test/base/t/Note", updatedAt };
}
function file(id: string, vaultId: string, updatedAt: number, recordId?: string): FileRef {
  return { id, vaultId, ...(recordId === undefined ? {} : { recordId }), name: `${id}.txt`, mediaType: "text/plain", byteSize: 10, updatedAt };
}

beforeEach(async () => {
  await purgeWorkingSet();
});
afterEach(async () => {
  await purgeWorkingSet();
});

describe("listStandaloneFiles", () => {
  it("lists a vault's unattached files, most recent first, and leaves out attached files and other vaults", async () => {
    await rememberFile(file("s1", "vA", 100));
    await rememberFile(file("s2", "vA", 300));
    await rememberFile(file("s3", "vA", 200));
    await rememberFile(file("att", "vA", 999, "rec1"));
    await rememberFile(file("other", "vB", 500));
    expect((await listStandaloneFiles("vA")).map((f) => f.id)).toEqual(["s2", "s3", "s1"]);
    expect((await listStandaloneFiles("vB")).map((f) => f.id)).toEqual(["other"]);
  });

  it("an unknown vault, or a vault that holds only attached files, lists empty", async () => {
    await rememberFile(file("att", "vA", 1, "rec1"));
    expect(await listStandaloneFiles("vA")).toEqual([]);
    expect(await listStandaloneFiles("nobody")).toEqual([]);
  });

  it("forgetFile and purgeWorkingSet remove a standalone file", async () => {
    await rememberFile(file("s1", "vA", 1));
    await rememberFile(file("s2", "vA", 2));
    await forgetFile("s1");
    expect((await listStandaloneFiles("vA")).map((f) => f.id)).toEqual(["s2"]);
    await purgeWorkingSet();
    expect(await listStandaloneFiles("vA")).toEqual([]);
  });
});

describe("the lists hand back what was remembered", () => {
  it("a record ref comes back with all four fields", async () => {
    const r = ref("r1", "vA", 7);
    await rememberRecord(r);
    expect(await listRecordRefs("vA")).toEqual([r]);
  });

  it("a file ref comes back with all its fields, attached or standalone", async () => {
    const attached = file("f1", "vA", 5, "rec1");
    const alone = file("f2", "vA", 6);
    await rememberFile(attached);
    await rememberFile(alone);
    expect(await listFileRefs("rec1")).toEqual([attached]);
    expect(await listStandaloneFiles("vA")).toEqual([alone]);
  });

  it("a file remembered again under the same id is refreshed in place and can move to another record", async () => {
    await rememberFile(file("f1", "vA", 1, "rec1"));
    await rememberFile(file("f1", "vA", 2, "rec2"));
    expect(await listFileRefs("rec1")).toEqual([]);
    expect((await listFileRefs("rec2")).map((f) => f.updatedAt)).toEqual([2]);
  });

  it("forgetting an id that was never remembered is harmless", async () => {
    await expect(forgetRecord("nope")).resolves.toBeUndefined();
    await expect(forgetFile("nope")).resolves.toBeUndefined();
  });

  it("purgeWorkingSet clears record refs and file links together", async () => {
    await rememberRecord(ref("r1", "vA", 1));
    await rememberFile(file("f1", "vA", 1, "rec1"));
    await rememberFile(file("f2", "vA", 1));
    await purgeWorkingSet();
    expect(await listRecordRefs("vA")).toEqual([]);
    expect(await listFileRefs("rec1")).toEqual([]);
    expect(await listStandaloneFiles("vA")).toEqual([]);
  });
});

describe("the export list", () => {
  it("is exactly the eight functions (the two types are erased)", () => {
    expect(Object.keys(api).sort()).toEqual([
      "forgetFile",
      "forgetRecord",
      "listFileRefs",
      "listRecordRefs",
      "listStandaloneFiles",
      "purgeWorkingSet",
      "rememberFile",
      "rememberRecord",
    ]);
  });
});
