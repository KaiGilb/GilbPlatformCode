// @vitest-environment jsdom

/**
 * W-RETYPE.
 *
 *
 * Same `<ID>`, new `<TYPE>`, PUT only. ⛔ Not merge-from-rendered-read of every fact.
 * Pair F-LIVE of the new type after.
 *
 * `retypeRecord` / `listVaultRecordsPage` mocked as collaborators; `useRetypeRecord` is REAL
 */
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";

const vaults = vi.hoisted(() => ({
  listVaultRecordsPage: vi.fn(),
  // census door absent (404 → null): the FALLBACK branch, unchanged.
  listVaultHeldTypes: vi.fn(async () => null),
}));

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@kaigilb/gilbplatformcode-lws-records");
  return {
    ...actual,
    createRecord: vi.fn(),
    readRecord: vi.fn(),
    replaceRecord: vi.fn(),
    deleteRecord: vi.fn(),
    patchRecord: vi.fn(),
    retypeRecord: vi.fn(),
  };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaults.listVaultRecordsPage,
  listVaultHeldTypes: vaults.listVaultHeldTypes,
}));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", () => ({
  rememberRecord: vi.fn(async () => {}),
  forgetRecord: vi.fn(async () => {}),
  listRecordRefs: vi.fn(async () => []),
  purgeWorkingSet: vi.fn(async () => {}),
}));

import { RetypeChangedElsewhereError, useRetypeRecord } from "./recordHooks";

const VAULT = "https://person.platform.example.test/base";
const REC_ID = "rec-c14-wretype000000000001";
const FRAMED = `${VAULT}/e/${REC_ID}`;

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function seedRecords(qc: QueryClient, rows: BaseRecord[]) {
  qc.setQueryData(recordsKey(VAULT), {
    pages: [{ records: rows, total: rows.length, complete: true, pageSize: 50, offset: 0 }],
    pageParams: [0],
  });
}

/** The record as the card read it.: with the served document at its ETag, as
 *  `readRecord` hands it out, so the retype's first PUT is built without a second read. */
function rec(over: Partial<BaseRecord> = {}): BaseRecord {
  const r: BaseRecord = {
    id: REC_ID,
    entityUri: FRAMED,
    typeUri: "t:UntypedEntity",
    facts: { title: "Named" },
    opaqueFacts: [],
    etag: '"etag-1"',
    ...over,
  };
  return { served: { facts: r.facts, context: undefined, etag: r.etag }, ...r };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(records.retypeRecord).mockResolvedValue({ etag: '"etag-2"' });
  vi.mocked(records.readRecord).mockResolvedValue({
    ...rec(),
    facts: { title: "Named", directReader: "https://other.platform.example.test/base" },
    etag: '"etag-fresh"',
  });
  vaults.listVaultRecordsPage.mockResolvedValue({
    records: [],
    total: 0,
    complete: true,
    pageSize: 50,
    offset: 0,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("W-RETYPE is PUT of id+type, not merge-from-rendered-read", () => {
  it("source no longer merge-from-rendered-read in useRetypeRecord", () => {
    const src = readFileSync("src/recordHooks.ts", "utf8");
    const start = src.indexOf("export function useRetypeRecord");
    const end = src.indexOf("export function useDeleteRecord");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    const fnStart = body.indexOf("mutationFn:");
    const fnEnd = body.indexOf("onMutate:");
    expect(fnStart).toBeGreaterThanOrEqual(0);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const mutationFn = body.slice(fnStart, fnEnd);
    expect(mutationFn).not.toMatch(/mergeFacts/);
    expect(mutationFn).not.toMatch(/const AUTH_Z = new Set/);
    // the hook now reads the record on 412 or with no ETag (/),
    // ⛔ only to decide whether to send; the read's facts never ride the PUT (the next tests).
    expect(mutationFn).not.toMatch(/send\([^)]*stored\.facts/);
    expect(mutationFn).not.toMatch(/"\*"/);
    expect(mutationFn).not.toMatch(/replaceRecord\(/);
    expect(mutationFn).toMatch(/retypeRecord\(/);
  });

  it("useRetypeRecord PUTs id+type via retypeRecord — no readRecord merge, no replaceRecord", async () => {
    const row = rec();
    const qc = makeClient();
    seedRecords(qc, [row]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    const out = await result.current.mutateAsync({
      record: row,
      typeName: "Task",
      facts: { title: "Named" },
    });
    expect(out.typeUri).toBe("t:Task");
    expect(records.readRecord).not.toHaveBeenCalled();
    expect((records as unknown as { replaceRecord: ReturnType<typeof vi.fn> }).replaceRecord).not.toHaveBeenCalled();
    expect(records.retypeRecord).toHaveBeenCalledTimes(1);
    expect(records.retypeRecord).toHaveBeenCalledWith(
      REC_ID,
      "Task",
      '"etag-1"',
      FRAMED,
      { title: "Named" },
    );
  });

  it("PUT facts are in-hand only — a rendered re-read grant is not merged", async () => {
    const row = rec({ facts: { title: "Named" } });
    const qc = makeClient();
    seedRecords(qc, [row]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    await result.current.mutateAsync({
      record: row,
      typeName: "Task",
      facts: { title: "Named" },
    });
    const args = vi.mocked(records.retypeRecord).mock.calls[0];
    expect(args?.[4]).toEqual({ title: "Named" });
    expect(args?.[4]).not.toHaveProperty("directReader");
    expect(records.readRecord).not.toHaveBeenCalled();
  });

  it("pairs F-LIVE of the new type after W-RETYPE", async () => {
    const row = rec();
    const qc = makeClient();
    seedRecords(qc, [row]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    await result.current.mutateAsync({
      record: row,
      typeName: "Task",
      facts: { title: "Named" },
    });
    await waitFor(() => {
      expect(vaults.listVaultRecordsPage).toHaveBeenCalled();
    });
    expect(vaults.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["Task"], 0);
  });

  it("no ETag in hand: the record is read first, and the PUT is bound to the read's ETag, ⛔ never If-Match * the PUT's facts are still in-hand only", async () => {
    const row = rec({ etag: null });
    const qc = makeClient();
    seedRecords(qc, [row]);
    vi.mocked(records.readRecord).mockResolvedValue({ ...rec(), facts: { title: "Named" }, etag: '"etag-fresh"' });
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    await result.current.mutateAsync({
      record: row,
      typeName: "NoteDocument",
      facts: { title: "Named" },
    });
    expect(records.readRecord).toHaveBeenCalledTimes(1);
    expect(records.retypeRecord).toHaveBeenCalledTimes(1);
    expect(records.retypeRecord).toHaveBeenCalledWith(
      REC_ID,
      "NoteDocument",
      '"etag-fresh"',
      FRAMED,
      { title: "Named" },
    );
  });
});

describe("the retype on 412, at the hook", () => {
  const conflict = () => new records.RecordConflictError();

  it("412, nothing saved elsewhere (case a): one read, then ONE more PUT with the read's ETag and the card's facts as composed now; never *", async () => {
    const row = rec({ facts: { title: "Named", body: "text" } });
    const qc = makeClient();
    seedRecords(qc, [row]);
    vi.mocked(records.retypeRecord).mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ etag: '"etag-3"' });
    // The store holds the card's own save (body = edited), landed after the PUT went out.
    vi.mocked(records.readRecord).mockResolvedValue({ ...rec(), facts: { title: "Named", body: "edited" }, etag: '"etag-2"' });
    let held = { title: "Named", body: "text" };
    const compose = () => ({ held, send: { ...held } });
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    const p = result.current.mutateAsync({ record: row, typeName: "Task", facts: compose().send, compose });
    held = { title: "Named", body: "edited" };
    const out = await p;
    expect(out.etag).toBe('"etag-3"');
    const tokens = vi.mocked(records.retypeRecord).mock.calls.map((c) => c[2]);
    expect(tokens).toEqual(['"etag-1"', '"etag-2"']);
    expect(vi.mocked(records.retypeRecord).mock.calls[1]![4], "the resend carries the card's facts now").toEqual({ title: "Named", body: "edited" });
    expect(records.readRecord).toHaveBeenCalledTimes(1);
  });

  it("412, a value saved elsewhere (case b): one read, NO second PUT; the mutation fails with RetypeChangedElsewhereError carrying the stored record, and the list row is the stored record", async () => {
    const row = rec({ facts: { title: "Named", body: "text" } });
    const qc = makeClient();
    seedRecords(qc, [row]);
    vi.mocked(records.retypeRecord).mockRejectedValueOnce(conflict());
    const stored = { ...rec(), typeUri: "t:UntypedEntity", facts: { title: "Named", body: "theirs" }, etag: '"etag-2"' };
    vi.mocked(records.readRecord).mockResolvedValue(stored);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    const err = await result.current
      .mutateAsync({ record: row, typeName: "Task", facts: { title: "Named", body: "text" } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RetypeChangedElsewhereError);
    expect((err as RetypeChangedElsewhereError).stored?.facts).toEqual({ title: "Named", body: "theirs" });
    expect(records.retypeRecord).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const d = qc.getQueryData<{ pages: { records: BaseRecord[] }[] }>(recordsKey(VAULT))!;
      const r = d.pages[0]!.records.find((x) => x.id === REC_ID)!;
      expect(r.typeUri).toBe("t:UntypedEntity");
      expect(r.facts).toEqual({ title: "Named", body: "theirs" });
    });
  });

  it("412 twice (case b): exactly two PUTs, neither with *", async () => {
    const row = rec({ facts: { title: "Named" } });
    const qc = makeClient();
    seedRecords(qc, [row]);
    vi.mocked(records.retypeRecord).mockRejectedValue(conflict());
    vi.mocked(records.readRecord).mockResolvedValue({ ...rec(), facts: { title: "Named" }, etag: '"etag-2"' });
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrapperFor(qc) });
    const err = await result.current.mutateAsync({ record: row, typeName: "Task", facts: { title: "Named" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RetypeChangedElsewhereError);
    expect(vi.mocked(records.retypeRecord).mock.calls.map((c) => c[2])).toEqual(['"etag-1"', '"etag-2"']);
  });
});
