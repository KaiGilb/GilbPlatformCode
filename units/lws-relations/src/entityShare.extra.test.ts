// New. The arms of the share acts the ported cases leave to chance: the addresses, the listener signal, the agent of a grant, the
// read-back of a revoke, and the lists of direct shares. `readRecord` and `patchRecord` are collaborators (as in the ported cases);
// the share acts, the addresses and the lists are real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import * as vaultSets from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import {
  entityUriForShare,
  grantDirectUrl,
  listDirectShares,
  onEntityShareChanged,
  revokeDirectUrl,
  revokeEntityShare,
  shareEntity,
} from "./index";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readRecord: vi.fn(),
  patchRecord: vi.fn(),
}));
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listVaultRecordsPage: vi.fn(async () => ({})),
}));

const VAULT = "https://v.platform.example.test/base";
const ID = "rec1";
const FRAMED = `${VAULT}/e/${ID}`;
const ALICE = "https://alice.platform.example.test/base";
const BOB = "https://bob.platform.example.test/base";

function rec(over: Partial<BaseRecord> = {}): BaseRecord {
  return { id: ID, entityUri: FRAMED, typeUri: "https://ontology.example.test/base/t/NoteDocument", facts: { title: "T" }, opaqueFacts: [], etag: '"e1"', ...over } as BaseRecord;
}

let host: FakeHost;
let posts: { url: string; body: Record<string, unknown> }[];

beforeEach(() => {
  host = setUp();
  posts = [];
  vi.mocked(records.readRecord).mockReset();
  vi.mocked(records.patchRecord).mockReset();
  vi.mocked(vaultSets.listVaultRecordsPage).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return resp(200, { body: {} });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("the addresses of the share acts", () => {
  it("entityUriForShare: the framed @id when it is an address", () => {
    expect(entityUriForShare(rec(), "https://other.example.test/base")).toBe(FRAMED);
  });
  it("entityUriForShare: an id that is already an address, in either scheme", () => {
    expect(entityUriForShare(rec({ entityUri: undefined, id: "https://x.example.test/e/a" }))).toBe("https://x.example.test/e/a");
    expect(entityUriForShare(rec({ entityUri: undefined, id: "http://x.example.test/e/a" }))).toBe("http://x.example.test/e/a");
  });
  it("entityUriForShare: an entityUri that is not an address is skipped, and the vault namespace composes the address", () => {
    expect(entityUriForShare(rec({ entityUri: "base:e/rec1" }), `${VAULT}/`)).toBe(FRAMED);
  });
  it("entityUriForShare: last resort is the platform origin, read when called", () => {
    expect(entityUriForShare(rec({ entityUri: undefined }))).toBe("https://platform.example.test/base/e/rec1");
    setBaseOrigin("https://other.example.test");
    expect(entityUriForShare(rec({ entityUri: undefined }), null)).toBe("https://other.example.test/base/e/rec1");
  });
  it("grantDirectUrl: read and write acts, at the origin of the entity", () => {
    expect(grantDirectUrl(FRAMED, "read")).toBe("https://v.platform.example.test/base/authz/grant-direct");
    expect(grantDirectUrl(FRAMED, "write")).toBe("https://v.platform.example.test/base/authz/grant-write-direct");
  });
  it("revokeDirectUrl: at the origin of the entity, and at the platform origin for none", () => {
    expect(revokeDirectUrl(FRAMED)).toBe("https://v.platform.example.test/base/authz/revoke-direct");
    expect(revokeDirectUrl(null)).toBe("https://platform.example.test/base/authz/revoke-direct");
    expect(revokeDirectUrl(undefined)).toBe("https://platform.example.test/base/authz/revoke-direct");
  });
});

describe("shareEntity", () => {
  it("reads the record at the door, grants for read, and answers the mode", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec());
    await expect(shareEntity(ID, ALICE, "read", VAULT, FRAMED)).resolves.toEqual({ granted: true, mode: "read" });
    expect(records.readRecord).toHaveBeenCalledWith(ID, FRAMED);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe("https://v.platform.example.test/base/authz/grant-direct");
    expect(posts[0]!.body).toMatchObject({ entity: FRAMED, principal: ALICE, type: rec().typeUri });
  });
  it("a write share is ONE grant-write-direct act", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec());
    await expect(shareEntity(ID, ` ${ALICE} `, "write", VAULT, FRAMED)).resolves.toEqual({ granted: true, mode: "write" });
    expect(posts.map((p) => p.url)).toEqual(["https://v.platform.example.test/base/authz/grant-write-direct"]);
    expect(posts[0]!.body.principal).toBe(ALICE);
  });
  it("a record the caller has just read is not read again", async () => {
    await shareEntity(ID, ALICE, "read", VAULT, FRAMED, { rec: rec() });
    expect(records.readRecord).not.toHaveBeenCalled();
    expect(posts).toHaveLength(1);
  });
  it("a record that cannot be read is refused, and nothing is posted", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(null);
    await expect(shareEntity(ID, ALICE, "read", VAULT, FRAMED)).rejects.toThrow("Record not found or not readable.");
    expect(posts).toHaveLength(0);
  });
  it("the facts are the editor's facts spelt for the wire: blanks left out, an a: key kept as it is, a bare key given its stored spelling", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ facts: { title: "T", blank: "", "a:kept": "k", empty: "" } }));
    await shareEntity(ID, ALICE, "read", VAULT, FRAMED);
    const facts = posts[0]!.body.facts as Record<string, unknown>;
    expect(facts["a:title"]).toBe("T");
    expect(facts["a:kept"]).toBe("k");
    expect(Object.keys(facts).some((k) => /blank|empty/.test(k))).toBe(false);
  });
  it("the grant is made as the signed-in principal, and as the share agent at the platform origin when there is no session", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(rec());
    await shareEntity(ID, ALICE, "read", VAULT, FRAMED);
    expect(posts[0]!.body.agent).toBe("https://id.platform.example.test/base/p/ann");
    host.tokenManager.getSession.mockRejectedValueOnce(new Error("no"));
    await shareEntity(ID, ALICE, "read", VAULT, FRAMED);
    expect(posts[1]!.body.agent).toBe("https://platform.example.test/base/e/agent-baseapp-share");
  });
});

describe("onEntityShareChanged", () => {
  it("a listener is told the id after a share and after a revoke, and not after it unsubscribes", async () => {
    const seen: string[] = [];
    const off = onEntityShareChanged((id) => seen.push(id));
    vi.mocked(records.readRecord).mockResolvedValue(rec({ facts: { directReader: ALICE } }));
    vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"e2"' } as never);
    await shareEntity(ID, BOB, "read", VAULT, FRAMED);
    expect(seen).toEqual([ID]);
    vi.mocked(records.readRecord).mockReset();
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ facts: { directReader: ALICE } })).mockResolvedValueOnce(rec({ facts: {} }));
    await revokeEntityShare(ID, ALICE, VAULT, FRAMED);
    expect(seen).toEqual([ID, ID]);
    off();
    vi.mocked(records.readRecord).mockResolvedValue(rec());
    await shareEntity(ID, BOB, "read", VAULT, FRAMED);
    expect(seen).toEqual([ID, ID]);
  });
  it("two listeners are both told, and unsubscribing one leaves the other", async () => {
    const a: string[] = [];
    const b: string[] = [];
    const offA = onEntityShareChanged((id) => a.push(id));
    const offB = onEntityShareChanged((id) => b.push(id));
    vi.mocked(records.readRecord).mockResolvedValue(rec());
    await shareEntity(ID, BOB, "read", VAULT, FRAMED);
    offA();
    await shareEntity(ID, BOB, "read", VAULT, FRAMED);
    offB();
    expect(a).toEqual([ID]);
    expect(b).toEqual([ID, ID]);
  });
  it("unsubscribing twice is harmless", () => {
    const off = onEntityShareChanged(() => {});
    off();
    expect(() => off()).not.toThrow();
  });
});

describe("revokeEntityShare", () => {
  it("an empty principal is refused before anything is changed", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec());
    await expect(revokeEntityShare(ID, "   ", VAULT, FRAMED)).rejects.toThrow("No principal to revoke.");
    expect(records.patchRecord).not.toHaveBeenCalled();
  });
  it("a record that cannot be read is refused", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(null);
    await expect(revokeEntityShare(ID, ALICE, VAULT, FRAMED)).rejects.toThrow("Record not found or not readable.");
  });
  it("a principal that holds no grant changes nothing: no patch, and the read-back is still made", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(rec({ facts: { directReader: ALICE } }));
    await revokeEntityShare(ID, BOB, VAULT, FRAMED);
    expect(records.patchRecord).not.toHaveBeenCalled();
    expect(records.readRecord).toHaveBeenCalledTimes(2);
  });
  it("matches a principal ignoring case, spaces and a closing slash", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ facts: { directReader: `${ALICE}, ${BOB}` } })).mockResolvedValueOnce(rec({ facts: { directReader: BOB } }));
    vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"e2"' } as never);
    await revokeEntityShare(ID, ` ${ALICE.toUpperCase()}/ `, VAULT, FRAMED);
    expect(vi.mocked(records.patchRecord).mock.calls[0]![1]).toEqual({ directReader: BOB });
  });
  it("a grant still there after the patch is a failure", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(rec({ facts: { directReader: `${ALICE}, ${BOB}` } }));
    vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"e2"' } as never);
    await expect(revokeEntityShare(ID, ALICE, VAULT, FRAMED)).rejects.toThrow(`grant W-FIELD did not revoke ${ALICE}`);
  });
  it("the list of the record's type is read again afterwards, at the named vault; a bulk caller skips it", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ facts: { directReader: ALICE } })).mockResolvedValueOnce(rec({ facts: {} }));
    vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"e2"' } as never);
    await revokeEntityShare(ID, ALICE, `${VAULT}/`, FRAMED);
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["NoteDocument"], 0);
    vi.mocked(vaultSets.listVaultRecordsPage).mockClear();
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ facts: { directReader: ALICE } })).mockResolvedValueOnce(rec({ facts: {} }));
    await revokeEntityShare(ID, ALICE, VAULT, FRAMED, { skipListRefresh: true });
    expect(vaultSets.listVaultRecordsPage).not.toHaveBeenCalled();
  });
  it("with no vault named, the vault is the one the framed @id is in", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ facts: { directReader: ALICE } })).mockResolvedValueOnce(rec({ facts: {} }));
    vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"e2"' } as never);
    await revokeEntityShare(ID, ALICE, null, FRAMED);
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["NoteDocument"], 0);
  });
  it("a type given as a path or as a CURIE is read as its bare name", async () => {
    for (const typeUri of ["https://ontology.example.test/base/t/File?x=1", "t:File"]) {
      vi.mocked(vaultSets.listVaultRecordsPage).mockClear();
      vi.mocked(records.readRecord).mockResolvedValueOnce(rec({ typeUri, facts: { directReader: ALICE } })).mockResolvedValueOnce(rec({ typeUri, facts: {} }));
      vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"e2"' } as never);
      await revokeEntityShare(ID, ALICE, VAULT, FRAMED);
      expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["File"], 0);
    }
  });
});

describe("listDirectShares", () => {
  it("is empty for no facts", () => {
    expect(listDirectShares(null)).toEqual([]);
    expect(listDirectShares(undefined)).toEqual([]);
    expect(listDirectShares({})).toEqual([]);
  });
  it("a reader is read; a writer is read and write; both keys in either spelling; sorted by principal", () => {
    expect(listDirectShares({ directReader: `${BOB}, ${ALICE}`, "a:directWriter": BOB })).toEqual([
      { principal: ALICE, modes: ["read"] },
      { principal: BOB, modes: ["read", "write"] },
    ]);
    expect(listDirectShares({ "a:directReader": ALICE, directWriter: "" })).toEqual([{ principal: ALICE, modes: ["read"] }]);
  });
  it("a principal that is only a writer is still read and write", () => {
    expect(listDirectShares({ directWriter: ALICE })).toEqual([{ principal: ALICE, modes: ["read", "write"] }]);
  });
});
