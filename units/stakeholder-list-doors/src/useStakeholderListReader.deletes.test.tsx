// @vitest-environment jsdom
// The list reader takes deletes from the app's ONE delete watcher (`useRecordsBeingDeleted` of the host): a record whose delete is out
// leaves the list at once, a refused delete puts it back, and a record deleted earlier in the session (even with no list on screen) is not
// drawn when a list is drawn later. The reader is a stand-in that draws one fixed list; the hook and the watcher are REAL.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const R = "https://a.example.test/vault/e/r1";
vi.mock("./listDoors", () => ({ stakeholderListDeps: (_host: unknown, a: unknown) => a }));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-reader", async (orig) => {
  const list = {
    rows: [
      { key: "r1", kind: "record", recordId: "https://a.example.test/vault/e/r1", vaultId: "https://a.example.test/vault", title: "One", principal: null },
      { key: "r2", kind: "record", recordId: "https://a.example.test/vault/e/r2", vaultId: "https://a.example.test/vault", title: "Two", principal: null },
    ],
  };
  return {
    ...((await orig()) as object),
    createStakeholderListReader: () => ({ read: async () => list, more: () => undefined, refresh: async () => list, names: async () => new Map() }),
  };
});
import { useStakeholderListReader } from "./useStakeholderListReader";
import { StakeholderListDoorsHostContext } from "./doorsHost";
import { RECORD_DELETE_KEY, useDeleteRecord, watchRecordDeletes } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { forgetDeletedLinkedRecord } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

installPlatformHooks();

const args = { holder: "https://a.example.test", vaults: ["https://a.example.test/vault"], ownVaultId: "https://a.example.test/vault", typeNames: ["Person"], ownCardIds: [] };
const keys = (l: { rows: { key: string }[] } | null) => (l ? l.rows.map((r) => r.key) : null);
const host = fakeDoorsHost({ requestsSent: () => 0 });
const wrapperOf = (qc: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StakeholderListDoorsHostContext.Provider value={host}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </StakeholderListDoorsHostContext.Provider>
    );
  };

describe("the list reader follows the one delete watcher", () => {
  it("a delete out: the row leaves at once; refused: it comes back", async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useStakeholderListReader(args), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(keys(result.current.list)).toEqual(["r1", "r2"]));
    let refuse!: () => void;
    let out!: Promise<unknown>;
    act(() => {
      out = qc.getMutationCache().build(qc, { mutationKey: RECORD_DELETE_KEY, mutationFn: () => new Promise((_, no) => (refuse = () => no(new Error("refused")))) }).execute({ id: "r1" } as never).catch(() => undefined);
    });
    await waitFor(() => expect(keys(result.current.list)).toEqual(["r2"]));
    await act(async () => {
      refuse();
      await out;
    });
    await waitFor(() => expect(keys(result.current.list)).toEqual(["r1", "r2"]));
  });

  it("a record deleted earlier in the session is not drawn by a list drawn later", async () => {
    forgetDeletedLinkedRecord(R);
    const qc = new QueryClient();
    const { result } = renderHook(() => useStakeholderListReader(args), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(keys(result.current.list)).toEqual(["r2"]));
  });

  it("the app's delete door installs the watcher itself: a delete out before any list is drawn is known", async () => {
    const qc = new QueryClient();
    vi.stubGlobal("fetch", () => new Promise(() => undefined)); // the DELETE stays out
    const del = renderHook(() => useDeleteRecord("https://a.example.test/vault"), { wrapper: wrapperOf(qc) });
    act(() => {
      del.result.current.mutate({ id: "r2", entityUri: "https://a.example.test/vault/e/r2" });
    });
    // Asked only after the delete's start has been told to the mutation cache's subscribers: a watcher made now would have missed it.
    // The microtasks are let run (the source let 50 ms pass).
    await act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(qc.getMutationCache().getAll()[0]?.state.status).toBe("pending");
    expect(watchRecordDeletes(qc).pending().has("r2")).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("the host is required", () => {
  it("with no StakeholderListDoorsHostContext provider the hook throws an error that names it", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useStakeholderListReader(args), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> })).toThrow(/StakeholderListDoorsHostContext/);
    spy.mockRestore();
  });
});
