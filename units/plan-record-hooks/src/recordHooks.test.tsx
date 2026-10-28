// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isTempId, recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { useCreateRecord, useDeleteRecord } from "./recordHooks";
import { RecordConflictError, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { RECORD_TYPE_BY_ID, typeUri, typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";

// Isolate the hook logic: stub the vault-network boundary (keep the REAL error classes so
// `instanceof RecordConflictError` still works) and the working-set replica. These tests
// cover the ETag/If-Match optimistic-concurrency behaviour central to Slice 2A:
// the 412 reconcile-to-vault-truth path and the optimistic rollback paths that the grid's
// happy-path integration tests do not reach.
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@kaigilb/gilbplatformcode-lws-records");
  return {
    ...actual,
    createRecord: vi.fn(),
    readRecord: vi.fn(),
    replaceRecord: vi.fn(),
    deleteRecord: vi.fn(),
    // ⚠ `patchRecord` MUST be stubbed. `useUpdateRecord` has issued a merge-PATCH, not a
    // PUT, since `83f7661`; while this factory spread the real one through, every save test
    // reached the network (ECONNREFUSED::1:8787) instead of the code under test. A mock
    // that omits an export the module under test calls is not isolation — it is a hole.
    patchRecord: vi.fn(),
  };
});
vi.mock("@kaigilb/gilbplatformcode-working-set-store", () => ({
  rememberRecord: vi.fn(async () => {}),
  forgetRecord: vi.fn(async () => {}),
  listRecordRefs: vi.fn(async () => []),
  purgeWorkingSet: vi.fn(async () => {}),
}));

setUp(); // the registry below needs the platform origin when this module loads
const VAULT = "p1";
const NOTE = typeUri("Note");
const noteSpec = RECORD_TYPE_BY_ID.note!;

/**
 * Seed the vault-records cache in the shape the hooks actually read.
 *
 * The cache became a TanStack `InfiniteData` at `ccd5488`. `flattenRecordPages` returns []
 * for a bare array, so a flat seed silently starved `onMutate` of its rollback snapshot —
 * which made two rollback tests look like rollback BUGS when the rollback logic was correct
 * and simply had nothing to restore.
 */
function seedRecords(qc: QueryClient, rows: BaseRecord[]) {
  qc.setQueryData(recordsKey(VAULT), {
    pages: [
      { records: rows, total: rows.length, complete: true, pageSize: 50, offset: 0 },
    ],
    pageParams: [0],
  });
}

/** The flattened rows currently in the cache — the list a surface would render. */
function cachedRows(qc: QueryClient): BaseRecord[] {
  const data = qc.getQueryData<InfiniteData<{ records: BaseRecord[] }>>(recordsKey(VAULT));
  return data?.pages.flatMap((p) => p.records) ?? [];
}

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

beforeEach(() => {
  vi.clearAllMocks();
  // The app's create test relied on an earlier useUpdateRecord test having left a resolved readRecord; the answer "not found" is set here.
  vi.mocked(records.readRecord).mockResolvedValue(null);
});

describe("useDeleteRecord (optimistic remove + rollback)", () => {
  // Spec: the design— an optimistic mutation that fails rolls the
  // cache back to its prior state (the vault is the source of truth).
  it("restores the row when the vault DELETE fails", async () => {
    const rec: BaseRecord = { id: "r4", typeUri: NOTE, facts: { title: "Keep me" }, opaqueFacts: [], etag: '"e1"' };
    vi.mocked(records.deleteRecord).mockRejectedValue(new Error("network down"));

    const qc = makeClient();
    seedRecords(qc, [rec]);
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrapperFor(qc) });

    await expect(result.current.mutateAsync({ id: "r4" })).rejects.toThrow();
    await waitFor(() => {
      expect(cachedRows(qc)).toEqual([rec]);
    });
  });
});

describe("useDeleteRecord forgets the record's page link once the DELETE has landed (Tester T06)", () => {
  it("a landed delete forgets the link read with the grid's pages; a refused one keeps it", async () => {
    const { notePageLinks, pageLinkOf } = await import("@kaigilb/gilbplatformcode-stakeholder-list-state");
    notePageLinks([{ id: "r5", body: { sameAs: { "@id": "https://tom.platform.example.test/vault" } } } as never, { id: "r6", body: { sameAs: { "@id": "https://tom.platform.example.test/vault" } } } as never]);
    expect(pageLinkOf("r5")?.state).toBe("linked");
    const qc = makeClient();
    seedRecords(qc, [{ id: "r5", typeUri: NOTE, facts: {}, opaqueFacts: [], etag: '"e1"' }, { id: "r6", typeUri: NOTE, facts: {}, opaqueFacts: [], etag: '"e1"' }]);
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrapperFor(qc) });
    vi.mocked(records.deleteRecord).mockResolvedValueOnce(undefined as never);
    await result.current.mutateAsync({ id: "r5" });
    expect(pageLinkOf("r5")).toBeUndefined();
    vi.mocked(records.deleteRecord).mockRejectedValueOnce(new Error("refused"));
    await expect(result.current.mutateAsync({ id: "r6" })).rejects.toThrow();
    expect(pageLinkOf("r6")?.state).toBe("linked");
  });
});

describe("useCreateRecord (optimistic insert + canonical swap / rollback)", () => {
  // Spec: — create a record; the layer-2 no-spinner pattern swaps the
  // optimistic temp row for the vault-minted canonical id on success.
  it("swaps the optimistic temp row for the vault-minted canonical on success", async () => {
    vi.mocked(records.createRecord).mockResolvedValue({ id: "srv-1", etag: '"e1"' });

    const qc = makeClient();
    seedRecords(qc, []);
    const { result } = renderHook(() => useCreateRecord(VAULT), { wrapper: wrapperFor(qc) });

    const out = await result.current.mutateAsync({ type: noteSpec, facts: { title: "X" } });
    expect(out.id).toBe("srv-1");
    // the create targets the VIEWED vault: createRecord is called with the
    // viewed vault's NAMESPACE (VAULT) as its FIRST arg, not a separate sign-in container. This is
    // what makes the record land in the vault on screen (records.ts POSTs it to `/lws/vault/<VAULT>/c`).
    //
    // Two deliberate production changes are now pinned here rather than re-derived:
    //  • the type goes on the wire as the host-free CURIE `t:Note` — `typeUriForVaultNamespace`
    //    (recordTypes.ts:102) does this ON PURPOSE, because an absolute own-host URI was read
    //    as foreign and the grid missed those rows entirely ("Hytta note2 still in
    //    DB, empty grid"). Calling the production helper keeps this test tracking that rule
    //    instead of hard-coding a spelling that can drift again.
    //  • `label` accompanies `title` — `withCanonicalLabel` dual-writes the cross-app master.
    expect(records.createRecord).toHaveBeenCalledWith(
      VAULT,
      typeUriForVaultNamespace(noteSpec.typeName, VAULT),
      { title: "X", label: "X" },
      "X",
    );
    await waitFor(() => {
      const list = cachedRows(qc);
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe("srv-1");
      expect(isTempId(list[0]!.id)).toBe(false);
    });
  });

  it("removes the optimistic temp row when the vault POST fails (rollback)", async () => {
    vi.mocked(records.createRecord).mockRejectedValue(new Error("boom"));

    const qc = makeClient();
    seedRecords(qc, []);
    const { result } = renderHook(() => useCreateRecord(VAULT), { wrapper: wrapperFor(qc) });

    await expect(
      result.current.mutateAsync({ type: noteSpec, facts: { title: "X" } }),
    ).rejects.toThrow();
    await waitFor(() => {
      expect(cachedRows(qc)).toEqual([]);
    });
  });
});
