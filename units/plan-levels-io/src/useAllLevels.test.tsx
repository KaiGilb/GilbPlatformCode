// @vitest-environment jsdom
// The level query hook: it reads nothing for an empty vault id, reads every level for a vault, does not retry a failed read, and
// reads a row that carries no document through the client it runs under.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { planLevelsKey, useAllLevels } from "./planLevelsIo";
import { DEFAULTS, installVault, V } from "../test/levelsWire";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useAllLevels", () => {
  it("reads nothing for an empty vault id", async () => {
    const vault = installVault(DEFAULTS);
    const qc = new QueryClient();
    const { result } = renderHook(() => useAllLevels(""), { wrapper: wrapper(qc) });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isSuccess).toBe(false);
    expect(vault.gets).toEqual([]);
  });

  it("reads every level of the vault and keeps them under the levels' key", async () => {
    installVault(DEFAULTS);
    const qc = new QueryClient();
    const { result } = renderHook(() => useAllLevels(V), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.map((r) => r.id)).toEqual(["biz", "stk", "prod", "sol"]);
    expect(qc.getQueryData<GridRecord[]>(planLevelsKey(V))).toBe(result.current.data);
  });

  it("does not retry a failed read", async () => {
    const vault = installVault([], { listFails: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });
    const { result } = renderHook(() => useAllLevels(V), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(vault.gets).toHaveLength(1);
  });

  it("reads a row with no document through the client it runs under", async () => {
    const vault = installVault([{ id: "biz", token: "Business", position: 1, bodiless: true }]);
    const qc = new QueryClient();
    const { result } = renderHook(() => useAllLevels(V), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vault.reads).toHaveLength(1);
  });
});
