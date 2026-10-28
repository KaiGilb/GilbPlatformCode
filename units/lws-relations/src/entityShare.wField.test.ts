/**
 * Cycle165 BAPP165.R9 — C13 W-FIELD on grant predicates.
 *
 * Spec: [[Lookup_Code_base-value-io-write#W-FIELD]] · [[Lookup_Code_base-value-io-find#F-LIVE]]
 * · [[Lookup_Code_base-value-io-find#F-OPEN]] · [[Rule_Code_base-value-io#RuleBasevioPair]]
 * · winner CensusNamedLookupAllSites item 5 (C13 = W-FIELD, ⛔ not B-REV).
 *
 * One predicate written. ⛔ Not whole-record replace from a rendered read.
 * Pair F-LIVE / grant re-read after.
 *
 * `patchRecord` / `readRecord` / `listVaultRecordsPage` mocked as collaborators;
 * `revokeEntityShare` is REAL ([[Rule_Code_base-testing#RuleBasetestMockedModuleNoInstrument]]).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { setUp, tearDown, type FakeHost } from "../test/support";

const vaults = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn() }));
// `replaceRecord` is the full-state write that is not taken into `lws-records`; the mock stands in for it so the file can still say it is never the act.
const replace = vi.hoisted(() => ({ replaceRecord: vi.fn() }));

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readRecord: vi.fn(),
    replaceRecord: replace.replaceRecord,
    patchRecord: vi.fn(),
  };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaults.listVaultRecordsPage,
}));
import { revokeEntityShare } from "./entityShare";

const VAULT = "https://person.platform.example.test/base";
const REC_ID = "rec-c13-wfield00000000000001";
const FRAMED = `${VAULT}/e/${REC_ID}`;
const ALICE = "https://alice.platform.example.test/base";
const BOB = "https://bob.platform.example.test/base";
const CAROL = "https://carol.platform.example.test/base";

function rec(over: Partial<BaseRecord> = {}): BaseRecord {
  return {
    id: REC_ID,
    entityUri: FRAMED,
    typeUri: "t:NoteDocument",
    facts: {
      title: "Shared note",
      directReader: `${ALICE}, ${BOB}`,
    },
    opaqueFacts: [],
    etag: '"etag-1"',
    ...over,
  };
}

function dropPrincipal(facts: Record<string, string>, who: string): Record<string, string> {
  const next: Record<string, string> = {};
  const needle = who.trim().toLowerCase().replace(/\/$/, "");
  for (const [k, v] of Object.entries(facts)) {
    if (!/^(a:)?direct(Reader|Writer)$/i.test(k)) {
      next[k] = v;
      continue;
    }
    const kept = v
      .split(/,\s+/)
      .map((s) => s.trim())
      .filter((p) => p && p.toLowerCase().replace(/\/$/, "") !== needle);
    if (kept.length) next[k] = kept.join(", ");
  }
  return next;
}

function mockOpenThenPair(open: BaseRecord, who: string): void {
  const pair: BaseRecord = {
    ...open,
    facts: dropPrincipal(open.facts, who),
    etag: '"etag-2"',
  };
  vi.mocked(records.readRecord).mockResolvedValueOnce(open).mockResolvedValueOnce(pair);
}

function revokeBody(): string {
  const src = readFileSync("src/entityShare.ts", "utf8");
  const start = src.indexOf("export async function revokeEntityShare");
  const end = src.indexOf("async function grantDirect");
  expect(start, "revokeEntityShare must exist").toBeGreaterThanOrEqual(0);
  expect(end, "grantDirect must follow revokeEntityShare").toBeGreaterThan(start);
  return src.slice(start, end);
}

function patchKeys(): string[][] {
  return vi.mocked(records.patchRecord).mock.calls.map((c) => Object.keys(c[1] ?? {}));
}

beforeEach(() => {
  setUp();
  vi.mocked(records.readRecord).mockReset();
  replace.replaceRecord.mockReset();
  vi.mocked(records.patchRecord).mockReset();
  vaults.listVaultRecordsPage.mockReset();
  replace.replaceRecord.mockResolvedValue({ etag: '"etag-put"' });
  vi.mocked(records.patchRecord).mockResolvedValue({ etag: '"etag-2"' });
  vaults.listVaultRecordsPage.mockResolvedValue({
    records: [],
    total: 0,
    complete: true,
    pageSize: 50,
    offset: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({}),
      headers: { get: () => null },
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("C13 W-FIELD on grant predicates — not whole-record replace, not B-REV", () => {
  it("C13 source no longer replaceRecord in revokeEntityShare", () => {
    const body = revokeBody();
    expect(body).not.toMatch(/replaceRecord/);
    expect(body).toMatch(/patchRecord\(/);
  });

  it("C13 source does not re-apply remaining grants via shareEntity after the write", () => {
    const body = revokeBody();
    expect(body).not.toMatch(/shareEntity\(/);
    expect(body).not.toMatch(/revoke-vault/);
    expect(body).not.toMatch(/grant-direct/);
  });

  it("C13 reader revoke PATCHes only directReader — replaceRecord is not the act", async () => {
    const row = rec();
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    expect(replace.replaceRecord).not.toHaveBeenCalled();
    expect(records.patchRecord).toHaveBeenCalledTimes(1);
    const [id, patch, at] = vi.mocked(records.patchRecord).mock.calls[0]!;
    expect(id).toBe(REC_ID);
    expect(Object.keys(patch)).toEqual(["directReader"]);
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("directWriter");
    // 🔴 C161 `D-F3d` serve blocker — the shape Base's `directGranteeMatches` actually matches:
    // ONE grantee is a BARE STRING, ⛔ never `{"@id": …}` and ⛔ never a one-member array.
    // This line asserted `{ "@id": ALICE }` until 2026-09-06; that expectation PINNED the
    // defect that made a per-person revoke remove EVERY reader once Base `e8dfada` let a
    // second reader exist ([[Rule_Code_base-testing-discrimination#RuleBasetestNoDefectAssertion]]).
    expect(patch.directReader).toEqual(ALICE);
    expect(at).toBe(FRAMED);
  });

  it("C13 title and sibling facts are not in the merge-patch", async () => {
    const row = rec({
      facts: {
        title: "Shared note",
        status: "open",
        directReader: `${ALICE}, ${BOB}`,
      },
    });
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    const patch = vi.mocked(records.patchRecord).mock.calls[0]![1];
    expect(Object.keys(patch)).toEqual(["directReader"]);
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("status");
  });

  it("C13 last remaining principal PATCHes null — retracts that one predicate", async () => {
    const row = rec({ facts: { title: "Shared note", directReader: ALICE } });
    mockOpenThenPair(row, ALICE);
    await revokeEntityShare(REC_ID, ALICE, VAULT, FRAMED);
    expect(records.patchRecord).toHaveBeenCalledTimes(1);
    const patch = vi.mocked(records.patchRecord).mock.calls[0]![1];
    expect(Object.keys(patch)).toEqual(["directReader"]);
    expect(patch.directReader).toBeNull();
  });

  it("C13 writer revoke PATCHes one predicate per call — not a two-key patch", async () => {
    const row = rec({
      facts: {
        title: "Shared note",
        directReader: `${ALICE}, ${BOB}`,
        directWriter: `${ALICE}, ${BOB}`,
      },
    });
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    expect(replace.replaceRecord).not.toHaveBeenCalled();
    expect(records.patchRecord).toHaveBeenCalledTimes(2);
    const keys = patchKeys();
    for (const k of keys) {
      expect(k, "W-FIELD is one key").toHaveLength(1);
    }
    expect(keys).toEqual([["directWriter"], ["directReader"]]);
    const writerPatch = vi.mocked(records.patchRecord).mock.calls[0]![1];
    const readerPatch = vi.mocked(records.patchRecord).mock.calls[1]![1];
    expect(writerPatch.directWriter).toEqual(ALICE);
    expect(readerPatch.directReader).toEqual(ALICE);
  });

  it("C13 remaining siblings ride as the W-FIELD value — not a whole-record PUT of remaining facts", async () => {
    const row = rec({
      facts: {
        title: "Shared note",
        directReader: `${ALICE}, ${BOB}, ${CAROL}`,
      },
    });
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    expect(replace.replaceRecord).not.toHaveBeenCalled();
    const patch = vi.mocked(records.patchRecord).mock.calls[0]![1];
    // Two or more grantees is a JSON ARRAY OF BARE STRINGS — the other half of
    // `encodeDirectGrantees` at Base `e8dfada`. An array of `{"@id"}` members satisfies
    // neither disjunct of `directGranteeMatches` and decodes to the EMPTY set.
    expect(patch.directReader).toEqual([ALICE, CAROL]);
  });

  it("C13 pairs grant re-read after W-FIELD", async () => {
    const row = rec();
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    expect(records.readRecord).toHaveBeenCalledTimes(2);
    expect(records.readRecord).toHaveBeenLastCalledWith(REC_ID, FRAMED);
  });

  it("C13 pairs F-LIVE of the record type after W-FIELD", async () => {
    const row = rec();
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    expect(vaults.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["NoteDocument"], 0);
  });

  it("C13 does not POST revoke-vault — winner is W-FIELD, not B-REV", async () => {
    const row = rec();
    mockOpenThenPair(row, BOB);
    await revokeEntityShare(REC_ID, BOB, VAULT, FRAMED);
    const fetchMock = vi.mocked(fetch);
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toMatch(/revoke-vault/);
      expect(String(url)).not.toMatch(/grant-direct/);
      expect(String(url)).not.toMatch(/grant-write-direct/);
    }
  });
});
