// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVaults, vaultsKey } from "./reachableVaults";
import { jsonResponse, setUp, stubFetch, tearDown } from "../test/support";

beforeEach(() => void setUp());
afterEach(() => {
  cleanup();
  tearDown();
});

const A = "https://h.example.test/base/pa";
const B = "https://h.example.test/base/pb";
const ANN = "https://id.example.test/base/p/ann";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
}
function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const answer = { vaults: [{ vaultId: A, "@id": `${A}/e/self`, name: "Ann", modes: ["read"], isLandingVault: true }, { vaultId: B, name: "Other", modes: ["read"] }] };

describe("useVaults", () => {
  it("shows the session's set at once, lean, then decorated when the answer lands", async () => {
    stubFetch(() => jsonResponse(answer));
    const session = { principal: ANN, vaults: [{ vaultId: A, modes: ["read" as const, "write" as const] }] };
    const { result } = renderHook(() => useVaults(session), { wrapper: wrap(client()) });
    expect(result.current.vaults).toEqual([expect.objectContaining({ vaultId: A, entity: null, isLandingVault: false, modes: ["read", "write"] })]);
    await waitFor(() => expect(result.current.vaults[0]!.isLandingVault).toBe(true));
    expect(result.current.vaults).toHaveLength(1);
    expect(result.current.vaults[0]).toMatchObject({ entity: `${A}/e/self`, name: "Ann", modes: ["read", "write"] });
  });

  it("keeps the lean rows when the decoration fails, and shows no error", async () => {
    const seen = stubFetch(() => new Response("{}", { status: 503 }));
    const session = { principal: ANN, vaults: [{ vaultId: A, modes: ["read" as const] }] };
    const { result } = renderHook(() => useVaults(session), { wrapper: wrap(client()) });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.vaults.map((v) => v.vaultId)).toEqual([A]);
    expect(result.current.vaults[0]!.isLandingVault).toBe(false);
  });

  it("with an empty session set it recovers the answer's set", async () => {
    stubFetch(() => jsonResponse(answer));
    const session = { principal: ANN, vaults: [] };
    const { result } = renderHook(() => useVaults(session), { wrapper: wrap(client()) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.vaults.map((v) => v.vaultId)).toEqual([A, B]));
    expect(result.current.isPending).toBe(false);
  });

  it("with an empty session set and a failed answer it reports the error", async () => {
    stubFetch(() => new Response("{}", { status: 503 }));
    const session = { principal: ANN, vaults: [] };
    const { result } = renderHook(() => useVaults(session), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.vaults).toEqual([]);
  });

  it("asks nothing without a principal", async () => {
    const seen = stubFetch(() => jsonResponse(answer));
    const { result } = renderHook(() => useVaults(undefined), { wrapper: wrap(client()) });
    expect(result.current.vaults).toEqual([]);
    expect(result.current.isPending).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toHaveLength(0);
  });

  it("keeps the answer in the cache under the principal's key", async () => {
    stubFetch(() => jsonResponse(answer));
    const qc = client();
    const session = { principal: ANN, vaults: [{ vaultId: A, modes: ["read" as const] }] };
    renderHook(() => useVaults(session), { wrapper: wrap(qc) });
    await waitFor(() => expect(qc.getQueryData(vaultsKey(ANN))).toHaveLength(2));
  });

  it("does not retry a not-signed-in answer", async () => {
    const seen = stubFetch(() => new Response("{}", { status: 401 }));
    const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const session = { principal: ANN, vaults: [{ vaultId: A, modes: ["read" as const] }] };
    renderHook(() => useVaults(session), { wrapper: wrap(qc) });
    await waitFor(() => expect(qc.getQueryState(vaultsKey(ANN))?.status).toBe("error"));
    expect(seen).toHaveLength(1);
  });

  it("refetch asks again", async () => {
    const seen = stubFetch(() => jsonResponse(answer));
    const session = { principal: ANN, vaults: [{ vaultId: A, modes: ["read" as const] }] };
    const { result } = renderHook(() => useVaults(session), { wrapper: wrap(client()) });
    await waitFor(() => expect(seen).toHaveLength(1));
    result.current.refetch();
    await waitFor(() => expect(seen).toHaveLength(2));
  });
});
