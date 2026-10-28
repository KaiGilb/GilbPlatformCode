// @vitest-environment jsdom
// The relations query: it reads nothing without a real record id, keys by the door, and keeps a read fresh for fifteen seconds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { relationsKey } from "@kaigilb/gilbplatformcode-lws-relations";
import { useRelations } from "./relationHooks";
import { HOST, installWire, authorityRow } from "../test/wire";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  tearDown();
});

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const AT = `${HOST}/vault/e/fn1`;

describe("useRelations", () => {
  it("reads nothing for no id and nothing for a temporary id", async () => {
    const wire = installWire();
    const qc = new QueryClient();
    const none = renderHook(() => useRelations(null, null), { wrapper: wrapper(qc) });
    const temp = renderHook(() => useRelations("temp:abc", AT), { wrapper: wrapper(qc) });
    await new Promise((r) => setTimeout(r, 20));
    expect(none.result.current.fetchStatus).toBe("idle");
    expect(temp.result.current.fetchStatus).toBe("idle");
    expect(wire.relationReads).toEqual([]);
  });

  it("reads the relations a record takes part in and keeps them under the door's key", async () => {
    const wire = installWire();
    wire.setRelations("fn1", [authorityRow(`${HOST}/vault/r/a1`, `${HOST}/vault/e/kai`)]);
    const qc = new QueryClient();
    const { result } = renderHook(() => useRelations("fn1", AT), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([authorityRow(`${HOST}/vault/r/a1`, `${HOST}/vault/e/kai`)]);
    expect(qc.getQueryData(relationsKey("fn1", AT))).toBe(result.current.data);
    expect(wire.relationReads).toHaveLength(1);
    expect(wire.relationReads[0]).toContain("/vault/e/fn1/relations");
  });

  it("answers an empty list for a record the vault does not show, and an error for a failed read", async () => {
    const wire = installWire();
    wire.setRelations("gone", 404);
    wire.setRelations("bad", 500);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const gone = renderHook(() => useRelations("gone", `${HOST}/vault/e/gone`), { wrapper: wrapper(qc) });
    const bad = renderHook(() => useRelations("bad", `${HOST}/vault/e/bad`), { wrapper: wrapper(qc) });
    await waitFor(() => expect(gone.result.current.isSuccess).toBe(true));
    expect(gone.result.current.data).toEqual([]);
    await waitFor(() => expect(bad.result.current.isError).toBe(true));
    expect(bad.result.current.error?.message).toContain("500");
  });

  it("keeps a read fresh for fifteen seconds and no longer", async () => {
    installWire();
    const qc = new QueryClient();
    const { result, rerender } = renderHook(() => useRelations("fn1", AT), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const t0 = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0 + 14_000);
    rerender();
    expect(result.current.isStale).toBe(false);
    vi.setSystemTime(t0 + 16_000);
    rerender();
    expect(result.current.isStale).toBe(true);
  });
});
