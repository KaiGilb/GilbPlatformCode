/**
 * production 2026-11-08, PictureRecords run 2, F26.
 * A write grant (grant-write-direct) plants only a:directWriter. View needs a separate
 * read grant (a:directReader). shareEntity(write) therefore leaves the grantee without
 * view. shareEntityEditAndView grants write, then read, and reads both rights back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { shareEntity, shareEntityEditAndView } from "./entityShare";
import { resp, setUp, tearDown } from "../test/support";

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
const WRITE = `${VAULT}/authz/grant-write-direct`;
const READ = `${VAULT}/authz/grant-direct`;

function rec(facts: Record<string, string>): BaseRecord {
  return {
    id: ID,
    entityUri: FRAMED,
    typeUri: "https://ontology.example.test/base/t/NoteDocument",
    facts,
    opaqueFacts: [],
    etag: '"e1"',
  };
}

/** The record as the measured grant routes leave it. */
let facts: Record<string, string>;
let posts: string[];
/** When set, the read grant does not plant a:directReader. */
let dropReader: boolean;

function plant(attr: "directWriter" | "directReader", principal: string): void {
  const cur = facts[attr] ? facts[attr].split(/,\s+/).filter((s) => s.length > 0) : [];
  if (!cur.includes(principal)) cur.push(principal);
  facts[attr] = cur.join(", ");
}

beforeEach(() => {
  setUp();
  facts = { title: "T" };
  posts = [];
  dropReader = false;
  vi.mocked(records.readRecord).mockReset();
  vi.mocked(records.readRecord).mockImplementation(async () => rec({ ...facts }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const u = String(url);
        posts.push(u);
        const body = JSON.parse(String(init.body)) as { principal?: string };
        const principal = String(body.principal ?? "");
        if (u.endsWith("/grant-write-direct")) plant("directWriter", principal);
        else if (u.endsWith("/grant-direct") && !dropReader) plant("directReader", principal);
      }
      return resp(201, { body: { granted: true } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("shareEntity write, measured 2026-11-08", () => {
  it("plants only a:directWriter, so the grantee has no view", async () => {
    await shareEntity(ID, ALICE, "write", VAULT, FRAMED);
    expect(posts).toEqual([WRITE]);
    expect(facts.directWriter).toBe(ALICE);
    expect(facts.directReader).toBeUndefined();
  });
});

describe("shareEntityEditAndView", () => {
  it("grants write then view, and the record names the grantee for both", async () => {
    await expect(shareEntityEditAndView(ID, ALICE, VAULT, FRAMED)).resolves.toEqual({ granted: true });
    expect(posts).toEqual([WRITE, READ]);
    expect(facts.directWriter).toBe(ALICE);
    expect(facts.directReader).toBe(ALICE);
  });

  it("throws naming view when the read grant did not plant a reader", async () => {
    dropReader = true;
    await expect(shareEntityEditAndView(ID, ALICE, VAULT, FRAMED)).rejects.toThrow(/view/);
    expect(facts.directWriter).toBe(ALICE);
    expect(facts.directReader).toBeUndefined();
  });
});
