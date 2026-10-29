import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  forgetFile,
  forgetRecord,
  listFileRefs,
  listRecordRefs,
  purgeWorkingSet,
  rememberFile,
  rememberRecord,
  type FileRef,
  type WorkingSetRef,
} from "./workingSet";

// The transient, NON-AUTHORITATIVE working-set id-index (4Sol.S.Arch.WorkingSetReplicaCache).
// Under jsdom `indexedDB` is absent, so these exercise the in-memory
// fallback path — but every assertion is over the public API, so the behaviour is identical
// whichever backend is live. The vault stays the single source of truth: this index only holds
// opaque id pointers + type/updatedAt used to draw a placeholder row before hydrate.

const VAULT_A = "vaultA";
const VAULT_B = "vaultB";
const NOTE_URI = "https://vault.example.test/base/t/Note";

function ref(id: string, vaultId: string, updatedAt: number): WorkingSetRef {
  return { id, vaultId, typeUri: NOTE_URI, updatedAt };
}

beforeEach(async () => {
  await purgeWorkingSet();
});
afterEach(async () => {
  await purgeWorkingSet();
});

describe("working-set id-index (transient, non-authoritative)", () => {
  // Spec: 4Sol.S.Arch.WorkingSetReplicaCache — "the grid's default recent-first order".
  it("remembers refs and lists them most-recently-touched first", async () => {
    await rememberRecord(ref("r1", VAULT_A, 100));
    await rememberRecord(ref("r2", VAULT_A, 300));
    await rememberRecord(ref("r3", VAULT_A, 200));

    const refs = await listRecordRefs(VAULT_A);
    expect(refs.map((r) => r.id)).toEqual(["r2", "r3", "r1"]);
  });

  // Spec: 4Sol.S.Arch.WorkingSetReplicaCache — "the working set is scoped per vault".
  it("scopes refs per vault — no cross-vault leakage", async () => {
    await rememberRecord(ref("a1", VAULT_A, 1));
    await rememberRecord(ref("a2", VAULT_A, 2));
    await rememberRecord(ref("b1", VAULT_B, 1));

    expect((await listRecordRefs(VAULT_A)).map((r) => r.id).sort()).toEqual(["a1", "a2"]);
    expect((await listRecordRefs(VAULT_B)).map((r) => r.id)).toEqual(["b1"]);
  });

  // The id is the key — a re-touch refreshes in place rather than duplicating the row.
  it("refreshing an existing ref updates it in place (id is the key)", async () => {
    await rememberRecord(ref("r1", VAULT_A, 100));
    await rememberRecord(ref("r1", VAULT_A, 500));

    const refs = await listRecordRefs(VAULT_A);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.updatedAt).toBe(500);
  });

  // Spec: 4Sol.S.Arch.WorkingSetReplicaCache — a ref that is gone on the vault is dropped
  // (the vault is authoritative; forgetRecord runs on delete / 404-prune).
  it("forgetRecord drops a single ref, leaving the rest", async () => {
    await rememberRecord(ref("r1", VAULT_A, 1));
    await rememberRecord(ref("r2", VAULT_A, 2));

    await forgetRecord("r1");

    expect((await listRecordRefs(VAULT_A)).map((r) => r.id)).toEqual(["r2"]);
  });

  // Spec: 4Sol.S.Arch.WorkingSetReplicaCache — "purge-on-logout" (security-at-rest; the vault
  // is the home, so nothing is lost).
  it("purgeWorkingSet clears the whole index across vaults", async () => {
    await rememberRecord(ref("r1", VAULT_A, 1));
    await rememberRecord(ref("r2", VAULT_B, 1));

    await purgeWorkingSet();

    expect(await listRecordRefs(VAULT_A)).toEqual([]);
    expect(await listRecordRefs(VAULT_B)).toEqual([]);
  });

  it("listing an unknown vault returns an empty index (never throws)", async () => {
    expect(await listRecordRefs("nobody")).toEqual([]);
  });
});

// The file↔record link store — the same transient-mirror shape,
// keyed by file id, indexed by the record it hangs off. A record's attachment list needs a
// reverse lookup (DPoP-blocked), so it lives here until a Bearer-floor primitive exists.
function fileRef(id: string, recordId: string, updatedAt: number): FileRef {
  return { id, recordId, vaultId: VAULT_A, name: `${id}.txt`, mediaType: "text/plain", byteSize: 10, updatedAt };
}

describe("working-set file links (attachments)", () => {
  it("remembers file links and lists them per record, most-recent first", async () => {
    await rememberFile(fileRef("f1", "rec1", 100));
    await rememberFile(fileRef("f2", "rec1", 300));
    await rememberFile(fileRef("f3", "rec2", 200));

    expect((await listFileRefs("rec1")).map((f) => f.id)).toEqual(["f2", "f1"]);
    expect((await listFileRefs("rec2")).map((f) => f.id)).toEqual(["f3"]);
  });

  it("forgetFile drops one link, leaving the rest of the record's files", async () => {
    await rememberFile(fileRef("f1", "rec1", 1));
    await rememberFile(fileRef("f2", "rec1", 2));

    await forgetFile("f1");

    expect((await listFileRefs("rec1")).map((f) => f.id)).toEqual(["f2"]);
  });

  it("purgeWorkingSet clears file links too (logout security-at-rest)", async () => {
    await rememberFile(fileRef("f1", "rec1", 1));
    await purgeWorkingSet();
    expect(await listFileRefs("rec1")).toEqual([]);
  });

  it("a record with no attachments lists empty (never throws)", async () => {
    expect(await listFileRefs("bare")).toEqual([]);
  });
});
