// Hostile probes of ensureEtagUnchanged on its own.
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { planRecordKey } from "./planFind";
import { ensureEtagUnchanged } from "./planRowCache";
import { setUp, tearDown } from "../test/support";

const ORIGIN = "https://h.platform.example.test";
const VAULT = `${ORIGIN}/base`;

function ent(id: string, origin = ORIGIN): string {
  return `${origin}/base/e/${id}`;
}

describe("QA5-U ensureEtagUnchanged on its own", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    setUp();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    tearDown();
  });

  function row(etag: string | null, body = "Old."): GridRecord {
    return {
      id: "r1",
      entityUri: ent("r1"),
      updatedAt: 0,
      typeUri: "t:SpecificationElement",
      facts: { body },
      opaqueFacts: [],
      etag,
      served: { facts: { body }, context: undefined, etag },
    } as GridRecord;
  }

  function serve(body: string, etag: string | null, status = 200) {
    fetchMock.mockImplementation(async () => {
      if (status !== 200) return new Response("no", { status });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (etag) headers.etag = etag;
      return new Response(JSON.stringify({ "@id": ent("r1"), "@type": "t:SpecificationElement", "a:body": body }), { status: 200, headers });
    });
  }

  it("a row with an ETag is not read, and sameFor is not asked", async () => {
    const qc = new QueryClient();
    const sameFor = vi.fn(() => false);
    const out = await ensureEtagUnchanged(qc, VAULT, row('"e1"'), sameFor);
    expect({ fetched: fetchMock.mock.calls.length, asked: sameFor.mock.calls.length, row: "row" in out ? out.row.etag : null }).toEqual({
      fetched: 0,
      asked: 0,
      row: '"e1"',
    });
  });

  it("no ETag; the read is the same: the write is built on the read row and its ETag", async () => {
    const qc = new QueryClient();
    serve("Old.", '"e2"');
    const out = await ensureEtagUnchanged(qc, VAULT, row(null), (fresh) => fresh.facts.body === "Old.");
    expect("row" in out ? out.row.etag : out).toBe('"e2"');
  });

  it("no ETag; another writer changed it: conflict, and the card's record read now holds their copy", async () => {
    const qc = new QueryClient();
    serve("Theirs.", '"e3"');
    const out = await ensureEtagUnchanged(qc, VAULT, row(null), (fresh) => fresh.facts.body === "Old.");
    const cached = qc.getQueryData<BaseRecord>(planRecordKey("r1", ent("r1")));
    expect({ conflict: "conflict" in out, cached: cached?.facts.body, etag: cached?.etag }).toEqual({
      conflict: true,
      cached: "Theirs.",
      etag: '"e3"',
    });
  });

  it("no ETag; the read has no ETag, fails, or is gone: unreadable, never a write", async () => {
    const answers: [string, string | null, number][] = [
      ["Old.", null, 200],
      ["", null, 500],
      ["", null, 404],
    ];
    const kinds: string[] = [];
    for (const [body, etag, status] of answers) {
      serve(body, etag, status);
      const out = await ensureEtagUnchanged(new QueryClient(), VAULT, row(null), () => true);
      kinds.push(Object.keys(out)[0]!);
    }
    expect(kinds).toEqual(["unreadable", "unreadable", "unreadable"]);
  });
});

